import { test, expect, vi } from "vitest";
import { GradeRunner } from "../src/workshop/worker-runner";
import { lessons } from "../src/content";
import { makeWorkbook } from "../src/workbook";
class FakeWorker {
  onmessage: ((e: { data: any }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  respond(revision: number, id: number, status = "passed") {
    this.onmessage?.({
      data: {
        id,
        result: {
          revision,
          status,
          diagnostics: [],
          scenarios: 3,
          duration: 1,
        },
      },
    });
  }
}
function setup() {
  const workers: FakeWorker[] = [];
  return {
    workers,
    runner: new GradeRunner(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    }),
  };
}
const run = (
  r: GradeRunner,
  signal = new AbortController().signal,
  revision = 1,
) => r.run(lessons[1], makeWorkbook(lessons[1]), revision, signal);
test("successful checks reuse worker but carry distinct request IDs and snapshots", async () => {
  const { runner, workers } = setup();
  const a = run(runner);
  workers[0].respond(1, 1);
  await a;
  const b = run(runner, undefined, 2);
  expect(workers).toHaveLength(1);
  workers[0].respond(2, 2);
  await b;
  expect(workers[0].postMessage.mock.calls[0][0].snapshot).not.toBe(
    workers[0].postMessage.mock.calls[1][0].snapshot,
  );
  runner.dispose();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});
test("abort releases worker; late result cannot affect a new check", async () => {
  const { runner, workers } = setup(),
    abort = new AbortController();
  const a = run(runner, abort.signal),
    late = workers[0].onmessage;
  abort.abort();
  await expect(a).rejects.toMatchObject({ name: "AbortError" });
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  const b = run(runner, undefined, 2);
  expect(workers).toHaveLength(2);
  // Browser removes the event callback when terminated; it cannot deliver to the new worker.
  expect(workers[0].onmessage).toBeNull();
  expect(late).not.toBe(workers[1].onmessage);
  workers[1].respond(2, 2);
  await expect(b).resolves.toMatchObject({ revision: 2 });
  runner.dispose();
});
test.each(["error", "bad-result", "dispose", "post-failure"])(
  "discard worker after %s",
  async (kind) => {
    const { runner, workers } = setup();
    const a = run(runner);
    if (kind === "error") workers[0].onerror?.();
    if (kind === "bad-result") workers[0].respond(1, 99);
    if (kind === "dispose") runner.dispose();
    if (kind === "post-failure") {
      workers[0].respond(1, 1);
      await a;
      workers[0].postMessage.mockImplementation(() => {
        throw Error("clone");
      });
      await expect(run(runner)).rejects.toThrow("clone");
    } else await expect(a).rejects.toThrow();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  },
);
test("already aborted signal creates no worker; concurrent calls do not overwrite pending handler", async () => {
  const { runner, workers } = setup(),
    controller = new AbortController();
  controller.abort();
  await expect(run(runner, controller.signal)).rejects.toThrow();
  expect(workers).toHaveLength(0);
  const a = run(runner);
  await expect(run(runner)).rejects.toThrow("正在进行");
  workers[0].respond(1, 1);
  await a;
  runner.dispose();
});
