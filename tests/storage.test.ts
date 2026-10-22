import "fake-indexeddb/auto";
import { test, expect } from "vitest";
import {
  saveRecord,
  readRecords,
  restore,
  previousBackup,
  backup,
} from "../src/storage";
import { makeWorkbook } from "../src/workbook";
import { lessons } from "../src/content";
test("草稿完整恢复、导入前备份与损坏文件隔离", async () => {
  const r = {
    lessonId: "01",
    lessonVersion: 1,
    completed: true,
    mastered: false,
    hintsViewed: 2,
    draft: makeWorkbook(lessons[0]),
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(r);
  expect((await readRecords())[0]).toEqual(r);
  await expect(restore("{broken")).rejects.toThrow();
  expect((await readRecords())[0]).toEqual(r);
  await restore(JSON.stringify(backup([])));
  expect(await readRecords()).toEqual([]);
  expect((await previousBackup()).records).toEqual([r]);
});
