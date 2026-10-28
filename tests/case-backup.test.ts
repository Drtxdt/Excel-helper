import "fake-indexeddb/auto";
import { test, expect, vi } from "vitest";
import { openDB } from "idb";
import {
  createStorage,
  backup,
  parseImport,
  parseBackup,
} from "../src/storage";
import { cases } from "../src/cases/catalog";
import { case017 } from "../src/cases/definition";
import { freshCase, verifyEvidence, conclude } from "../src/cases/model";
import { caseExportDecision } from "../src/cases/export-policy";
import { makeWorkbook, put } from "../src/workbook";
const course = {
  lessonId: "02",
  lessonVersion: 1,
  completed: true,
  mastered: false,
  hintsViewed: 1,
  updatedAt: "now",
};
const envelope = (progress = freshCase(case017)) => ({
  format: "supply-station-case",
  version: 1,
  progress,
});
function solved() {
  const p = freshCase(case017);
  case017.stages.forEach((stage, i) => {
    const book = makeWorkbook(stage);
    for (const [key, f] of Object.entries(stage.solutions[0].cells)) {
      const [s, c] = key.split("!");
      put(book, s, c, f);
    }
    verifyEvidence(p, i, book);
    p.stages[i].hints = i + 1;
  });
  p.active = 1;
  p.answer = { ...case017.conclusion.correct, evidence: [0, 1] };
  conclude(case017, p);
  p.updatedAt = "2026-10-28";
  return p;
}
test("单案件完整往返只替换目标，课程、其他案件和课程修订保留", async () => {
  const other = { ...case017, id: "case-018" };
  cases.push(other);
  const name = crypto.randomUUID(),
    s = createStorage({ name });
  try {
    await s.readRecords();
    await s.saveRecord(course);
    await s.saveCase(freshCase(case017), { revision: 0, generation: 0 });
    await s.saveCase(freshCase(other), { revision: 0, generation: 0 });
    const before = await s.exportBackup();
    await s.restore(JSON.stringify(envelope(solved())));
    expect(await s.readRecords()).toEqual([course]);
    expect((await s.readCase(other.id)).progress).toEqual(
      before.cases.find((c) => c.caseId === other.id),
    );
    expect((await s.readCase(case017.id)).progress).toEqual(solved());
    expect(await s.previousBackup()).toMatchObject({
      records: before.records,
      cases: before.cases,
    });
    await s.saveRecord({ ...course, hintsViewed: 2 });
    expect((await s.readRecords())[0].hintsViewed).toBe(2);
  } finally {
    cases.pop();
    await s.close();
  }
});
test("目标写入和代次写入失败均原子回滚，包括导入前副本", async () => {
  for (const abortKey of ["case:case-017", "revision-state"]) {
    const name = crypto.randomUUID(),
      s = createStorage({ name });
    await s.readRecords();
    await s.saveRecord(course);
    await s.restore(JSON.stringify(backup([course])));
    const previous = await s.previousBackup(),
      before = await s.exportBackup();
    const db = await openDB(name, 1),
      meta = await db.get("settings", "revision-state");
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        const request = original.call(this, value, key);
        if (key === abortKey) this.transaction.abort();
        return request;
      });
    try {
      await expect(
        s.restore(JSON.stringify(envelope(solved()))),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(await s.exportBackup()).toMatchObject({
      records: before.records,
      cases: before.cases,
    });
    expect(await s.previousBackup()).toEqual(previous);
    expect(await db.get("settings", "revision-state")).toEqual(meta);
    await s.restore(JSON.stringify(envelope(solved())));
    expect((await s.readCase(case017.id)).progress?.completed).toBe(true);
    db.close();
    await s.close();
  }
});
test("旧标签页案件与课程写入均不能覆盖单案件导入后的状态", async () => {
  const name = crypto.randomUUID(),
    s = createStorage({ name }),
    stale = createStorage({ name });
  await s.readRecords();
  await s.saveRecord(course);
  await stale.readRecords();
  const old = await stale.readCase(case017.id);
  await s.restore(JSON.stringify(envelope(solved())));
  await expect(stale.saveCase(freshCase(case017), old)).rejects.toThrow(
    "另一页面",
  );
  await expect(stale.saveRecord({ ...course, hintsViewed: 4 })).rejects.toThrow(
    "有更新",
  );
  expect((await s.readCase(case017.id)).progress?.completed).toBe(true);
  expect(await s.readRecords()).toEqual([course]);
  await s.close();
  await stale.close();
});
test("导入等待已排队保存；导入之后的旧案件请求被代次拒绝", async () => {
  const s = createStorage({ name: crypto.randomUUID() });
  await s.readRecords();
  const old = await s.readCase(case017.id);
  const saving = s.saveRecord(course);
  const importing = s.restore(JSON.stringify(envelope(solved())));
  const late = s.saveCase(freshCase(case017), old);
  await expect(late).rejects.toThrow("另一页面");
  await saving;
  await importing;
  expect((await s.previousBackup()).records).toEqual([course]);
  expect(await s.readRecords()).toEqual([course]);
  await s.close();
});
test("单案件继承导入限制与证据校验，不能伪装成课程备份", () => {
  const p = solved();
  expect(() => parseBackup(JSON.stringify(envelope(p)))).toThrow();
  const parsed = parseImport(JSON.stringify(envelope(p)));
  expect(parsed.format).toBe("supply-station-case");
  const book = p.stages[0].draft!;
  book.sheets[book.sheetOrder[0]].cellData[1][1] = { v: 999 };
  const invalid = parseImport(JSON.stringify(envelope(p)));
  expect(
    invalid.format === "supply-station-case" && invalid.progress.completed,
  ).toBe(false);
  expect(
    invalid.format === "supply-station-case" &&
      invalid.progress.stages[0].verified,
  ).toBeUndefined();
  book.sheets[book.sheetOrder[0]].rowCount = 2001;
  expect(() => parseImport(JSON.stringify(envelope(p)))).toThrow("2,000");
  expect(() =>
    parseImport(JSON.stringify({ ...envelope(), version: 9 })),
  ).toThrow("版本");
  expect(() =>
    parseImport(
      JSON.stringify(envelope({ ...freshCase(case017), caseId: "unknown" })),
    ),
  ).toThrow("未知案件");
});
test.each(["unsubmitted", "cancelled", "failed"] as const)(
  "活动编辑 %s 不允许静默降级导出",
  (status) => {
    expect(
      caseExportDecision({ status, message: "保留输入" }, true),
    ).toMatchObject({ allowed: false });
  },
);
test("初始化不可用允许导出已加载进度，但未提交编辑仍阻止导出", () => {
  expect(
    caseExportDecision({ status: "unavailable", message: "初始化失败" }, false),
  ).toMatchObject({
    allowed: true,
    message: expect.stringContaining("不包含尚未提交"),
  });
  expect(
    caseExportDecision({ status: "unavailable", message: "初始化失败" }, true)
      .allowed,
  ).toBe(false);
  expect(caseExportDecision({ status: "success" }, false).allowed).toBe(true);
});
