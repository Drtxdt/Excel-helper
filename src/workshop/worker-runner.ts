import { measured } from "../performance";
import type { CalculationTask, GradeResult, WorkbookSnapshot } from "../types";

/** One resident Worker per active desk; headless.ts still creates/disposes each workbook. */
export class GradeRunner {
  private worker?: Worker;
  private cancel?: () => void;
  private serial = 0;
  constructor(private create: () => Worker) {}
  run(
    lesson: CalculationTask,
    snapshot: WorkbookSnapshot,
    revision: number,
    signal: AbortSignal,
  ): Promise<GradeResult> {
    if (signal.aborted)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    if (this.cancel) return Promise.reject(Error("已有检查正在进行。"));
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const worker = (this.worker ??= this.create());
      const id = ++this.serial;
      const close = (discard: boolean) => {
        signal.removeEventListener("abort", abort);
        worker.onmessage = null;
        worker.onerror = null;
        this.cancel = undefined;
        if (discard) {
          worker.terminate();
          this.worker = undefined;
        }
      };
      const abort = () => {
        close(true);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      this.cancel = abort;
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () => {
        close(true);
        reject(Error("检查未完成，作答已保留。请重新检查。"));
      };
      worker.onmessage = (e) => {
        if (e.data.ready) {
          measured("worker-init", started);
          return;
        }
        if (
          e.data.id !== id ||
          !e.data.result ||
          e.data.result.revision !== revision
        ) {
          close(true);
          reject(Error("检查结果无效，请重试。"));
          return;
        }
        close(e.data.result.status === "error");
        resolve(e.data.result);
      };
      try {
        worker.postMessage({ id, lesson, snapshot, revision });
      } catch (error) {
        close(true);
        reject(error);
      }
    });
  }
  dispose() {
    this.cancel?.();
    this.worker?.terminate();
    this.worker = undefined;
  }
}
