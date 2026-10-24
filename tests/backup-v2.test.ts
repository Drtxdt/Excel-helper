import "fake-indexeddb/auto";
import { test, expect, vi } from "vitest";
import { openDB } from "idb";
import { createStorage, backup, parseBackup } from "../src/storage";
import { freshCase, verifyEvidence, conclude } from "../src/cases/model";
import { case017 } from "../src/cases/definition";
import { makeWorkbook, put } from "../src/workbook";
const record = {
  lessonId: "02",
  lessonVersion: 1,
  completed: true,
  mastered: true,
  hintsViewed: 0,
  updatedAt: "2026-10-24",
};
const fixture = () => {
  const name = crypto.randomUUID();
  return { name, s: createStorage({ name }) };
};
function solved() {
  const p = freshCase(case017);
  case017.stages.forEach((s, i) => {
    const b = makeWorkbook(s);
    for (const [key, f] of Object.entries(s.solutions[0].cells)) {
      const [sheet, cell] = key.split("!");
      put(b, sheet, cell, f);
    }
    verifyEvidence(p, i, b);
  });
  p.answer = { ...case017.conclusion.correct, evidence: [0, 1] };
  conclude(case017, p);
  return p;
}
test("v2 round trip preserves drafts, evidence, hints and conclusion; v1 preserves cases", async () => {
  const { s } = fixture(),
    p = solved();
  p.stages[1].hints = 2;
  await s.readRecords();
  await s.saveRecord(record);
  await s.saveCase(p, { revision: 0, generation: 0 });
  const exported = await s.exportBackup();
  expect(exported.cases).toEqual([p]);
  await s.restore(JSON.stringify(backup([])));
  expect(await s.readCases()).toEqual([]);
  expect((await s.previousBackup()).cases).toEqual([p]);
  await s.restore(JSON.stringify(exported));
  expect(await s.exportBackup()).toMatchObject({
    records: [record],
    cases: [p],
  });
  await s.restore(
    JSON.stringify({
      format: "supply-station",
      version: 1,
      exportedAt: "now",
      records: [],
    }),
  );
  expect(await s.readCases()).toEqual([p]);
  expect(await s.readRecords()).toEqual([]);
  await s.close();
});
test("legacy case migration saves recoverable copy and is idempotent", async () => {
  const { s, name } = fixture(),
    p = solved(),
    db = await openDB(name + "-legacy-cases", 1, {
      upgrade(d) {
        d.createObjectStore("cases");
      },
    });
  await db.put("cases", { revision: 8, progress: p }, p.caseId);
  expect(await s.readCases()).toEqual([p]);
  expect((await s.upgradeBackup()).cases).toEqual([p]);
  await s.restore(JSON.stringify(backup([])));
  expect(await s.readCases()).toEqual([]);
  expect((await db.get("cases", p.caseId)).progress).toEqual(p);
  await s.close();
  const next = createStorage({ name });
  expect(await next.readCases()).toEqual([]);
  await next.close();
  db.close();
});
test("old case writes cannot overwrite an imported generation", async () => {
  const { s, name } = fixture(),
    other = createStorage({ name }),
    p = freshCase(case017);
  const stale = await other.readCase(p.caseId);
  await s.readRecords();
  await s.restore(JSON.stringify(backup([record], [solved()])));
  await expect(other.saveCase(p, stale)).rejects.toThrow("另一页面");
  expect((await s.readCases())[0].completed).toBe(true);
  await s.close();
  await other.close();
});
test("native transaction abort rolls back courses, cases and before-import backup together", async () => {
  const { s } = fixture();
  await s.readRecords();
  await s.saveRecord(record);
  const original = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = original.call(this, value, key);
      if (key === "case:case-017") this.transaction.abort();
      return request;
    });
  try {
    await expect(
      s.restore(JSON.stringify(backup([], [solved()]))),
    ).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
  expect(await s.readRecords()).toEqual([record]);
  expect(await s.readCases()).toEqual([]);
  expect(await s.previousBackup()).toBeUndefined();
  await s.close();
});
test("corrupt migration keeps source and retries after repair; malformed backups never replace records", async () => {
  const { s, name } = fixture(),
    db = await openDB(name + "-legacy-cases", 1, {
      upgrade(d) {
        d.createObjectStore("cases");
      },
    });
  await db.put("cases", { progress: { caseId: "broken" } }, "case-017");
  await expect(s.readRecords()).rejects.toThrow();
  expect(await db.get("cases", "case-017")).toEqual({
    progress: { caseId: "broken" },
  });
  await db.put(
    "cases",
    { revision: 1, progress: freshCase(case017) },
    "case-017",
  );
  await s.readRecords();
  await s.saveRecord(record);
  await expect(
    s.restore(JSON.stringify({ ...backup([]), cases: [{ caseId: "broken" }] })),
  ).rejects.toThrow();
  expect(await s.readRecords()).toEqual([record]);
  expect(() =>
    parseBackup(JSON.stringify(backup([], [solved(), solved()]))),
  ).toThrow("重复");
  db.close();
  await s.close();
});
test("inconsistent restored conclusion is cleared without discarding drafts", () => {
  const p = solved();
  p.answer.destination = "错误地点";
  const parsed = parseBackup(JSON.stringify(backup([], [p])));
  expect(parsed.version === 2 && parsed.cases[0].completed).toBe(false);
  expect(parsed.version === 2 && parsed.cases[0].stages[0].draft).toEqual(
    p.stages[0].draft,
  );
});

test("损坏的案件不能在完整导出中被静默遗漏", async () => {
  const { s, name } = fixture();
  await s.readRecords();
  await s.saveRecord(record);
  const db = await openDB(name, 1);
  await db.put("settings", { revision: 1, progress: null }, "case:case-017");
  await expect(s.exportBackup()).rejects.toThrow();
  await expect(s.restore(JSON.stringify(backup([])))).rejects.toThrow();
  expect(await s.readRecords()).toEqual([record]);
  expect(await s.previousBackup()).toBeUndefined();
  db.close();
  await s.close();
});
test("迁移事务失败保留旧库，下次读取可重新迁移", async () => {
  const { s, name } = fixture(),
    p = freshCase(case017),
    legacy = await openDB(name + "-legacy-cases", 1, {
      upgrade(d) {
        d.createObjectStore("cases");
      },
    });
  await legacy.put("cases", { revision: 1, progress: p }, p.caseId);
  const original = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = original.call(this, value, key);
      if (key === "before-upgrade") this.transaction.abort();
      return request;
    });
  try {
    await expect(s.readRecords()).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
  expect((await legacy.get("cases", p.caseId)).progress).toEqual(p);
  expect(await s.readCases()).toEqual([p]);
  expect((await s.upgradeBackup()).cases).toEqual([p]);
  legacy.close();
  await s.close();
});
