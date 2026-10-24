import GradeWorker from "../grade.worker?worker";
import type { GradeResult, CalculationTask, WorkbookSnapshot } from "../types";
/** A cancelled/finished check releases its Worker; each check still uses independent workbooks. */
export function gradeInWorker(
  lesson: CalculationTask,
  snapshot: WorkbookSnapshot,
  revision: number,
  signal: AbortSignal,
): Promise<GradeResult> {
  return new Promise((resolve, reject) => {
    const worker = new GradeWorker();
    const close = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      close();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      close();
      reject(Error("检查未完成，作答已保留。请重新检查。"));
    };
    worker.onmessage = (e) => {
      close();
      if (e.data.id !== revision || !e.data.result)
        reject(Error("检查结果无效，请重试。"));
      else resolve(e.data.result);
    };
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ id: revision, lesson, snapshot, revision });
    } catch (e) {
      close();
      reject(e);
    }
  });
}
