import { measured } from "../performance";
import type { GradeResult, CalculationTask, WorkbookSnapshot } from "../types";
import type { OperationGoal } from "../types";
import type { OperationInput, OperationState } from "../operations";
import { gradeOperation } from "../operations";

export type Phase =
  "preparing" | "editing" | "waiting" | "grading" | "feedback" | "error";
export interface SessionState {
  phase: Phase;
  ready: boolean;
  revision: number;
  error: string;
  result?: GradeResult;
  sheet: string;
  cell: string;
  value: string;
}
export const sessionState = (): SessionState => ({
  phase: "preparing",
  ready: false,
  revision: 0,
  error: "",
  sheet: "",
  cell: "",
  value: "",
});
export interface SessionAdapter {
  wait(): Promise<void>;
  snapshot(): WorkbookSnapshot;
  dispose(): void;
  focus(sheet: string, range: string): void;
  write(sheet: string, range: string, value: string): void;
  fillDown(sheet: string, range: string): Promise<void>;
  undo(): void;
  redo(): void;
  operate(goal: OperationGoal, input: OperationInput): Promise<void>;
  operationState(goal: OperationGoal): OperationState;
}
export interface SessionDependencies {
  create(
    snapshot: WorkbookSnapshot,
    changed: () => void,
    selected: (s: string, c: string, v: string) => void,
  ): SessionAdapter;
  grade(
    lesson: CalculationTask,
    snapshot: WorkbookSnapshot,
    revision: number,
    signal: AbortSignal,
  ): Promise<GradeResult>;
  changed(): void;
  passed(result: GradeResult): void;
  waitTimeout?: number;
  gradeTimeout?: number;
}
export function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      fn();
    };
    const abort = () =>
      done(() => reject(new DOMException("Cancelled", "AbortError")));
    const timer = setTimeout(
      () => done(() => reject(new Error("检查超时，作答已保留。请再试一次。"))),
      ms,
    );
    signal.addEventListener("abort", abort, { once: true });
    // Attach handlers even after cancellation, so a late adapter rejection is consumed.
    promise.then(
      (v) => done(() => resolve(v)),
      (e) => done(() => reject(e)),
    );
    if (signal.aborted) abort();
  });
}
/** Owns engine/async lifetimes. Keep this instance outside Vue's deep proxies. */
export class TeachingSession {
  private adapter?: SessionAdapter;
  private init?: AbortController;
  private checkRun?: AbortController;
  private disposed = false;
  constructor(
    readonly state: SessionState,
    private deps: SessionDependencies,
  ) {}
  private cancelCheck() {
    this.checkRun?.abort();
    this.checkRun = undefined;
  }
  changed = () => {
    if (!this.state.ready || this.disposed) return;
    this.cancelCheck();
    this.state.revision++;
    this.state.result = undefined;
    this.state.error = "";
    this.state.phase = "editing";
    this.deps.changed();
  };
  async prepare(snapshot: WorkbookSnapshot, sheet: string, cell: string) {
    const started = performance.now();
    if (this.disposed) return;
    this.init?.abort();
    this.cancelCheck();
    const run = new AbortController();
    this.init = run;
    this.state.ready = false;
    this.state.phase = "preparing";
    this.state.result = undefined;
    this.state.error = "";
    this.state.revision++;
    this.adapter?.dispose();
    this.adapter = undefined;
    try {
      const a = this.deps.create(snapshot, this.changed, (s, c, v) => {
        if (!run.signal.aborted && !this.disposed)
          Object.assign(this.state, { sheet: s, cell: c, value: v });
      });
      this.adapter = a;
      await bounded(a.wait(), run.signal, this.deps.waitTimeout ?? 12000);
      if (run.signal.aborted || this.disposed) return;
      a.focus(sheet, cell);
      measured("ready", started);
      this.state.ready = true;
      this.state.phase = "editing";
    } catch (e) {
      if (!run.signal.aborted && !this.disposed) {
        this.state.phase = "error";
        this.state.error = `工作簿未能打开，草稿已保留。可以重试。${e instanceof Error ? e.message : ""}`;
      }
    }
  }
  async check(lesson: CalculationTask) {
    if (!this.state.ready || this.checkRun || this.disposed || !this.adapter)
      return;
    const started = performance.now();
    const a = this.adapter,
      run = new AbortController(),
      revision = this.state.revision;
    this.checkRun = run;
    this.state.phase = "waiting";
    this.state.error = "";
    this.state.result = undefined;
    try {
      await bounded(a.wait(), run.signal, this.deps.waitTimeout ?? 12000);
      if (run.signal.aborted) return;
      this.state.phase = "grading";
      const result = lesson.operation
        ? gradeOperation(
            lesson.operation,
            a.operationState(lesson.operation),
            revision,
            lesson.sheets,
          )
        : await bounded(
            this.deps.grade(lesson, a.snapshot(), revision, run.signal),
            run.signal,
            this.deps.gradeTimeout ?? 20000,
          );
      if (
        run.signal.aborted ||
        this.disposed ||
        revision !== this.state.revision
      )
        return;
      if (result.revision !== revision)
        throw Error("检查结果已过期，请重新检查最新作答。");
      measured("check", started);
      this.state.result = result;
      this.state.phase = result.status === "error" ? "error" : "feedback";
      if (result.status === "passed") this.deps.passed(result);
    } catch (e) {
      if (!run.signal.aborted && !this.disposed) {
        this.state.phase = "error";
        this.state.error =
          e instanceof Error
            ? e.message
            : "检查未完成，作答已保留。请重新检查。";
      }
    } finally {
      run.abort();
      if (this.checkRun === run) this.checkRun = undefined;
    }
  }
  snapshot() {
    return this.adapter?.snapshot();
  }
  focus(sheet: string, cell: string) {
    this.act(() => this.adapter?.focus(sheet, cell));
  }
  write(
    sheet = this.state.sheet,
    range = this.state.cell,
    value = this.state.value,
  ) {
    this.act(() => {
      this.adapter?.write(sheet, range, value);
      this.adapter?.focus(sheet, range);
    });
  }
  fill(sheet = this.state.sheet, range = this.state.cell) {
    return this.act(() => this.adapter?.fillDown(sheet, range));
  }
  undo() {
    this.act(() => this.adapter?.undo());
  }
  redo() {
    this.act(() => this.adapter?.redo());
  }
  operate(goal: OperationGoal, input: OperationInput) {
    const adapter = this.adapter;
    return this.act(async () => {
      await adapter?.operate(goal, input);
      if (adapter === this.adapter) this.changed();
    });
  }
  private async act(action: () => unknown) {
    if (!this.state.ready || this.disposed) return;
    const a = this.adapter;
    try {
      await action();
    } catch (e) {
      if (a === this.adapter && !this.disposed) {
        this.state.phase = "error";
        this.state.error =
          e instanceof Error ? e.message : "操作未完成，请重试。";
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.init?.abort();
    this.cancelCheck();
    this.adapter?.dispose();
    this.adapter = undefined;
  }
}
