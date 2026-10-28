import type { EditorState } from "../input-diagnostics";
import { measured } from "../performance";
import type { GradeResult, CalculationTask, WorkbookSnapshot } from "../types";
import type { OperationGoal } from "../types";
import type { OperationInput, OperationState } from "../operations";
import { gradeOperation } from "../operations";

export type Phase =
  "preparing" | "editing" | "waiting" | "grading" | "feedback" | "error";
export type CommitResult =
  | { status: "success" }
  | {
      status: "unsubmitted" | "unavailable" | "cancelled" | "failed";
      message: string;
    };
interface CheckAttempt {
  controller: AbortController;
  adapter: SessionAdapter;
  inputRevision: number;
  settled: boolean;
  revision?: number;
}
export interface SessionState {
  phase: Phase;
  ready: boolean;
  committing: boolean;
  revision: number;
  error: string;
  result?: GradeResult;
  editor?: EditorState;
  sheet: string;
  cell: string;
  value: string;
  calculationError?: string;
}
export const sessionState = (): SessionState => ({
  phase: "preparing",
  ready: false,
  committing: false,
  revision: 0,
  error: "",
  sheet: "",
  cell: "",
  value: "",
});
export interface SessionAdapter {
  ready?(): Promise<void>;
  commit?(): Promise<boolean>;
  resolveInput?(
    action: "equals" | "text" | "edit",
    revision: number,
  ): Promise<void>;
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
    selected: (s: string, c: string, v: string, error?: string) => void,
    editing: (editor: EditorState) => void,
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
  private checkRun?: CheckAttempt;
  private inputRevision = 0;
  private pendingCommit?: {
    adapter: SessionAdapter;
    promise: Promise<CommitResult>;
  };
  private disposed = false;
  private actions = new Set<Promise<boolean>>();
  constructor(
    readonly state: SessionState,
    private deps: SessionDependencies,
  ) {}
  private cancelCheck() {
    this.checkRun?.controller.abort();
    this.checkRun = undefined;
    if (this.state.phase === "waiting" || this.state.phase === "grading")
      this.state.phase = "editing";
  }
  changed = () => {
    if (!this.state.ready || this.disposed) return;
    // Pending fill and this attempt's commit may emit ordinary mutations.
    // Keep tracking their revisions; once calculation starts, any mutation cancels.
    if (this.checkRun?.settled) this.cancelCheck();
    this.state.revision++;
    this.state.result = undefined;
    this.state.error = "";
    if (!this.checkRun) this.state.phase = "editing";
    this.deps.changed();
  };
  async prepare(snapshot: WorkbookSnapshot, sheet: string, cell: string) {
    const started = performance.now();
    if (this.disposed) return;
    this.init?.abort();
    this.cancelCheck();
    this.actions.clear();
    const run = new AbortController();
    this.init = run;
    this.state.ready = false;
    this.inputRevision++;
    this.pendingCommit = undefined;
    this.state.committing = false;
    this.state.editor = undefined;
    this.state.phase = "preparing";
    this.state.result = undefined;
    this.state.error = "";
    this.state.revision++;
    this.adapter?.dispose();
    this.adapter = undefined;
    try {
      const a = this.deps.create(
        snapshot,
        () => {
          if (!run.signal.aborted && !this.disposed) this.changed();
        },
        (s, c, v, calculationError) => {
          if (!run.signal.aborted && !this.disposed)
            Object.assign(this.state, {
              sheet: s,
              cell: c,
              value: v,
              calculationError,
            });
        },
        (editor) => {
          if (run.signal.aborted || this.disposed) return;
          this.state.editor = editor;
          if (editor.active) {
            this.inputRevision++;
            this.cancelCheck();
            this.state.result = undefined;
            this.state.error = "";
            this.state.phase = "editing";
          }
        },
      );
      this.adapter = a;
      await bounded(
        a.ready ? a.ready() : a.wait(),
        run.signal,
        this.deps.waitTimeout ?? 12000,
      );
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
  private currentCheck(attempt: CheckAttempt) {
    return (
      this.checkRun === attempt &&
      !attempt.controller.signal.aborted &&
      !this.disposed &&
      this.adapter === attempt.adapter &&
      this.inputRevision === attempt.inputRevision
    );
  }
  private settledCheck(attempt: CheckAttempt) {
    return (
      this.currentCheck(attempt) &&
      !this.state.editor?.active &&
      attempt.revision === this.state.revision
    );
  }
  async check(lesson: CalculationTask) {
    if (!this.state.ready || this.checkRun || this.disposed || !this.adapter)
      return;
    const started = performance.now();
    const a = this.adapter;
    const attempt: CheckAttempt = {
      controller: new AbortController(),
      adapter: a,
      inputRevision: this.inputRevision,
      settled: false,
    };
    // Reserve before the first await, including pending operations and editor commit.
    this.checkRun = attempt;
    const signal = attempt.controller.signal;
    this.state.phase = "waiting";
    this.state.error = "";
    this.state.result = undefined;
    try {
      if (
        this.actions.size &&
        !(
          await bounded(
            Promise.all([...this.actions]),
            signal,
            this.deps.waitTimeout ?? 12000,
          )
        ).every(Boolean)
      )
        return;
      if (!this.currentCheck(attempt)) return;
      if (a.commit) {
        const outcome = await bounded(
          this.submitEditing(a),
          signal,
          this.deps.waitTimeout ?? 12000,
        );
        if (outcome.status !== "success") return;
      }
      if (!this.currentCheck(attempt) || this.state.editor?.active) return;
      const revision = this.state.revision;
      attempt.revision = revision;
      attempt.settled = true;
      await bounded(a.wait(), signal, this.deps.waitTimeout ?? 12000);
      if (!this.settledCheck(attempt)) return;
      this.state.phase = "grading";
      const result = lesson.operation
        ? gradeOperation(
            lesson.operation,
            a.operationState(lesson.operation),
            revision,
            lesson.sheets,
          )
        : await bounded(
            this.deps.grade(lesson, a.snapshot(), revision, signal),
            signal,
            this.deps.gradeTimeout ?? 20000,
          );
      if (!this.settledCheck(attempt)) return;
      if (result.revision !== revision)
        throw Error("检查结果已过期，请重新检查最新作答。");
      measured("check", started);
      this.state.result = result;
      this.state.phase = result.status === "error" ? "error" : "feedback";
      if (result.status === "passed") this.deps.passed(result);
    } catch (e) {
      if (this.currentCheck(attempt)) {
        this.state.phase = "error";
        this.state.error =
          e instanceof Error
            ? e.message
            : "检查未完成，作答已保留。请重新检查。";
      }
    } finally {
      attempt.controller.abort();
      if (this.checkRun === attempt) {
        this.checkRun = undefined;
        if (this.state.phase === "waiting" || this.state.phase === "grading")
          this.state.phase = "editing";
      }
    }
  }
  /** Only submit the editor. Callers own the calculation wait and its cancellation. */
  private submitEditing(a: SessionAdapter): Promise<CommitResult> {
    if (this.pendingCommit?.adapter === a) return this.pendingCommit.promise;
    const inputRevision = this.inputRevision;
    const pending = {
      adapter: a,
      promise: undefined as unknown as Promise<CommitResult>,
    };
    this.pendingCommit = pending;
    this.state.committing = true;
    pending.promise = (async (): Promise<CommitResult> => {
      try {
        const accepted = a.commit ? await a.commit() : true;
        if (this.disposed || a !== this.adapter)
          return { status: "cancelled", message: "工作簿已切换。" };
        if (!accepted) {
          const message = "输入尚未写入，请按单元格旁的提示继续修改。";
          this.state.error = message;
          return { status: "unsubmitted", message };
        }
        if (inputRevision !== this.inputRevision)
          return { status: "cancelled", message: "输入已有变化，请重新确认。" };
        if (this.state.editor?.active)
          return {
            status: "unsubmitted",
            message: "输入尚未确认，请继续修改。",
          };
        this.state.error = "";
        return { status: "success" };
      } catch (e) {
        if (
          this.disposed ||
          a !== this.adapter ||
          inputRevision !== this.inputRevision
        )
          return { status: "cancelled", message: "输入或工作簿已有变化。" };
        const message =
          e instanceof Error ? e.message : "输入尚未写入，请继续修改。";
        this.state.error = message;
        return {
          status: this.state.editor?.active ? "unsubmitted" : "failed",
          message,
        };
      } finally {
        if (this.pendingCommit === pending) {
          this.pendingCommit = undefined;
          this.state.committing = false;
        }
      }
    })();
    return pending.promise;
  }
  async commit(): Promise<CommitResult> {
    if (this.disposed)
      return { status: "cancelled", message: "工作簿已关闭。" };
    if (!this.state.ready || !this.adapter)
      return { status: "unavailable", message: "工作簿尚未准备好。" };
    const a = this.adapter,
      inputRevision = this.inputRevision;
    const signal = this.init!.signal;
    try {
      if (
        this.actions.size &&
        !(
          await bounded(
            Promise.all([...this.actions]),
            signal,
            this.deps.waitTimeout ?? 12000,
          )
        ).every(Boolean)
      )
        return {
          status: "failed",
          message: this.state.error || "上一次操作未完成。",
        };
      if (
        this.disposed ||
        a !== this.adapter ||
        inputRevision !== this.inputRevision
      )
        return {
          status: "cancelled",
          message: "输入或工作簿已有变化，请重新确认。",
        };
      const outcome = await bounded(
        this.submitEditing(a),
        signal,
        this.deps.waitTimeout ?? 12000,
      );
      if (outcome.status !== "success") return outcome;
      const revision = this.state.revision;
      await bounded(a.wait(), signal, this.deps.waitTimeout ?? 12000);
      if (
        this.disposed ||
        a !== this.adapter ||
        inputRevision !== this.inputRevision ||
        revision !== this.state.revision ||
        this.state.editor?.active
      )
        return { status: "cancelled", message: "作答已有变化，请重新确认。" };
      return { status: "success" };
    } catch (e) {
      if (
        signal.aborted ||
        this.disposed ||
        a !== this.adapter ||
        inputRevision !== this.inputRevision
      )
        return { status: "cancelled", message: "输入或工作簿已有变化。" };
      const message =
        e instanceof Error ? e.message : "输入尚未写入，请继续修改。";
      this.state.error = message;
      return { status: "failed", message };
    }
  }
  resolveInput(action: "equals" | "text" | "edit", revision: number) {
    return this.act(() => this.adapter?.resolveInput?.(action, revision));
  }
  snapshot() {
    return this.adapter?.snapshot();
  }
  focus(sheet: string, cell: string) {
    this.act(() => this.adapter?.focus(sheet, cell), false);
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
    const a = this.adapter;
    return this.act(async () => {
      await a?.fillDown(sheet, range);
      if (a === this.adapter) await a?.wait();
    });
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
  private act(action: () => unknown, invalidates = true) {
    if (invalidates) this.cancelCheck();
    const task = this.perform(action);
    this.actions.add(task);
    void task.finally(() => this.actions.delete(task));
    return task;
  }
  private async perform(action: () => unknown): Promise<boolean> {
    if (!this.state.ready || this.disposed) return false;
    const a = this.adapter;
    try {
      await action();
      return a === this.adapter && !this.disposed;
    } catch (e) {
      if (a === this.adapter && !this.disposed) {
        this.state.phase = "error";
        this.state.error =
          e instanceof Error ? e.message : "操作未完成，请重试。";
      }
      return false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.actions.clear();
    this.init?.abort();
    this.cancelCheck();
    this.adapter?.dispose();
    this.adapter = undefined;
  }
}
