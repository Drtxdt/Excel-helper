import { beforeEach, expect, test, vi } from "vitest";
import type { LearningRecord } from "../src/types";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  listen: vi.fn(),
}));
vi.mock("../src/storage", () => ({
  readRecords: mocks.read,
  saveRecord: mocks.save,
  restore: mocks.restore,
  onStorageConflict: mocks.listen,
  StorageConflict: class extends Error {
    constructor() {
      super("conflict");
    }
  },
}));
const record = (id = "01"): LearningRecord => ({
  lessonId: id,
  lessonVersion: 1,
  completed: false,
  mastered: false,
  hintsViewed: 0,
  updatedAt: "now",
});
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
});

test("首次读取复用同一请求，不覆盖读取期间的新作答", async () => {
  let resolve!: (records: LearningRecord[]) => void;
  mocks.read.mockReturnValue(
    new Promise<LearningRecord[]>((r) => (resolve = r)),
  );
  const { state, load, save } = await import("../src/state");
  const first = load(),
    second = load();
  expect(first).toBe(second);
  expect(mocks.read).toHaveBeenCalledOnce();
  await save({ ...record(), hintsViewed: 3 });
  resolve([record()]);
  await first;
  expect(state.records["01"].hintsViewed).toBe(3);
});

test("保存失败保留内存、冲突提示不会被较早的成功回调清掉", async () => {
  mocks.read.mockResolvedValue([]);
  const { state, load, save } = await import("../src/state");
  await load();
  let finish!: () => void;
  mocks.save.mockReturnValue(new Promise<void>((r) => (finish = r)));
  const saving = save(record());
  mocks.listen.mock.calls[0][0]();
  finish();
  await saving;
  expect(state.storageConflict).toBe(true);
  expect(state.storageError).toBe("conflict");
  expect(state.records["01"]).toEqual(record());
  mocks.save.mockRejectedValue(new Error("quota"));
  await save({ ...record(), hintsViewed: 4 });
  expect(state.records["01"].hintsViewed).toBe(4);
});

test("导入失败保留内存，成功后直接采用事务返回记录", async () => {
  mocks.read.mockResolvedValue([record()]);
  const { state, load, importRecords } = await import("../src/state");
  await load();
  mocks.restore.mockRejectedValue(new Error("full"));
  await expect(importRecords("backup")).rejects.toThrow("full");
  expect(state.records["01"]).toEqual(record());
  mocks.restore.mockResolvedValue([record("02")]);
  await importRecords("backup");
  expect(Object.keys(state.records)).toEqual(["02"]);
  expect(mocks.read).toHaveBeenCalledOnce();
});
