import "fake-indexeddb/auto";
import { test, expect, vi } from "vitest";
import { BACKUP_LIMITS as limits, readBackupFile } from "../src/backup-limits";
import { validateWorkbook } from "../src/backup-validation";
import { backup, parseBackup, createStorage } from "../src/storage";
import { lessons } from "../src/content";
import { case017 } from "../src/cases/definition";
import { freshCase } from "../src/cases/model";
import { makeWorkbook } from "../src/workbook";
import type { WorkbookSnapshot } from "../src/types";
const record = (index = 0) => ({
  lessonId: lessons[index].id,
  lessonVersion: lessons[index].version,
  completed: false,
  mastered: false,
  hintsViewed: 0,
  updatedAt: "2026-10-28",
  draft: makeWorkbook(lessons[index]),
});
const parse = (book: WorkbookSnapshot) =>
  parseBackup(JSON.stringify(backup([{ ...record(), draft: book }])));
function fill(book: WorkbookSnapshot, count: number) {
  for (const sheet of Object.values(book.sheets)) sheet.cellData = {};
  const sheet = book.sheets[book.sheetOrder[0]];
  sheet.rowCount = 2000;
  sheet.columnCount = 128;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 128),
      column = i % 128;
    sheet.cellData[row] ??= {};
    sheet.cellData[row][column] = { s: "body" };
  }
}

test("文件字节预筛不读取任何内容", async () => {
  const slice = vi.fn();
  await expect(
    readBackupFile({ size: limits.bytes + 1, slice } as unknown as Blob),
  ).rejects.toThrow("60,000,000 字节");
  expect(slice).not.toHaveBeenCalled();
});
test("跨切片 UTF-8 字符不被截断，损坏编码明确拒绝", async () => {
  const text = "a".repeat(65535) + "中文😀";
  expect(await readBackupFile(new Blob([text]))).toBe(text);
  await expect(
    readBackupFile(new Blob([new Uint8Array([0xc3, 0x28])])),
  ).rejects.toThrow("UTF-8");
});
test("字符限制恰好允许上限并提前拒绝超限文件", async () => {
  const file = new Blob(["x".repeat(limits.characters)]);
  expect((await readBackupFile(file)).length).toBe(limits.characters);
  const larger = new Blob([file, "x", "y".repeat(1_000_000)]);
  const sliced = vi.spyOn(larger, "slice");
  await expect(readBackupFile(larger)).rejects.toThrow("20,000,000 字符");
  expect(sliced.mock.calls.at(-1)![1]).toBeLessThan(larger.size);
  expect(() => parseBackup("x".repeat(limits.characters + 1))).toThrow(
    "20,000,000 字符",
  );
});
test("恰好 60,000,000 字节的中文文件按解码字符数判定", async () => {
  const file = new Blob(["中".repeat(limits.characters)]);
  expect(file.size).toBe(limits.bytes);
  expect((await readBackupFile(file)).length).toBe(limits.characters);
});
test("读取途中取消或失败不继续分配其余文件", async () => {
  const controller = new AbortController();
  const slice = vi.fn(() => ({
    arrayBuffer: async () => {
      controller.abort();
      return new ArrayBuffer(65536);
    },
  }));
  await expect(
    readBackupFile(
      { size: 200000, slice } as unknown as Blob,
      controller.signal,
    ),
  ).rejects.toThrow("取消");
  expect(slice).toHaveBeenCalledTimes(1);
  const failed = {
    size: 10,
    slice: () => ({
      arrayBuffer: async () => {
        throw Error("disk error");
      },
    }),
  } as unknown as Blob;
  await expect(readBackupFile(failed)).rejects.toThrow("无法按 UTF-8 读取");
});
test.each([
  [
    "重复顺序",
    (b: WorkbookSnapshot): unknown => b.sheetOrder.push("main"),
    "顺序",
  ],
  [
    "未知顺序",
    (b: WorkbookSnapshot): unknown => (b.sheetOrder[0] = "unknown"),
    "顺序",
  ],
  [
    "索引与 ID 不一致",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.id = "other"),
    "ID",
  ],
  [
    "缺少所需表",
    (b: WorkbookSnapshot): void => {
      b.sheets.other = { ...b.sheets.main, id: "other" };
      delete b.sheets.main;
      b.sheetOrder = ["other"];
    },
    "缺少",
  ],
  [
    "负坐标",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.cellData[-1] = {}),
    "坐标",
  ],
  [
    "小数坐标",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.cellData["0.1"] = {}),
    "坐标",
  ],
  [
    "非标准坐标",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.cellData["01"] = {}),
    "坐标",
  ],
  [
    "行越界",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.cellData[50] = {}),
    "坐标",
  ],
  [
    "列越界",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.cellData[0][18] = {}),
    "坐标",
  ],
  [
    "行数超限",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.rowCount = 2001),
    "2,000",
  ],
  [
    "列数超限",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.columnCount = 129),
    "128",
  ],
  [
    "维度缺失",
    (b: WorkbookSnapshot): unknown => delete b.sheets.main.rowCount,
    "行数",
  ],
  [
    "样式行越界",
    (b: WorkbookSnapshot): unknown => (b.sheets.main.rowData = { 2000: {} }),
    "坐标",
  ],
  [
    "合并越界",
    (b: WorkbookSnapshot): unknown =>
      (b.sheets.main.mergeData = [
        { startRow: 0, endRow: 50, startColumn: 0, endColumn: 0 },
      ]),
    "合并",
  ],
  [
    "公式超限",
    (b: WorkbookSnapshot): unknown =>
      (b.sheets.main.cellData[0][0] = { f: "=".repeat(8193) }),
    "8,192",
  ],
] as const)("拒绝畸形工作簿：%s", (_label, change, reason) => {
  const b = makeWorkbook(lessons[0]);
  change(b);
  expect(() => parse(b)).toThrow(reason);
});
test("辅助表、未知引擎字段与资源不被裁剪；16 表和边界尺寸可恢复", () => {
  const book = makeWorkbook(lessons[0]);
  book.resources = [
    { name: "SHEET_CONDITIONAL_FORMATTING_PLUGIN", data: '{"main":[]}' },
    { name: "SHEET_DATA_VALIDATION_PLUGIN", data: '{"main":[]}' },
  ];
  for (let i = 1; i < 16; i++) {
    const id = `helper-${i}`;
    book.sheetOrder.push(id);
    book.sheets[id] = {
      id,
      name: `辅助 ${i}`,
      cellData: {},
      rowCount: 2000,
      columnCount: 128,
      customField: { keep: true },
    };
  }
  book.sheets.main.cellData[0][0].f = "=".repeat(8192);
  book.sheets["helper-1"].cellData[1999] = { 127: { s: "body" } };
  expect(parse(book).records[0].draft).toEqual(book);
  book.sheets.extra = { ...book.sheets.main, id: "extra", name: "多一张" };
  book.sheetOrder.push("extra");
  expect(() => parse(book)).toThrow("16");
});
test("工作表名称重复不能让引用指向两张表", () => {
  const book = makeWorkbook(lessons[0]);
  book.sheets.other = { ...book.sheets.main, id: "other" };
  book.sheetOrder.push("other");
  expect(() => parse(book)).toThrow("名称");
});
test("样式格也计数；10,000 个接受、10,001 个拒绝", () => {
  const book = makeWorkbook(lessons[0]);
  fill(book, 10000);
  expect(validateWorkbook(book, ["main"], "测试")).toBe(10000);
  expect(parse(book).records[0].draft).toEqual(book);
  fill(book, 10001);
  expect(() => parse(book)).toThrow("10,000");
});
test("整份备份合计限制覆盖课程与案件", () => {
  const records = Array.from({ length: 10 }, (_, i) => record(i));
  for (const r of records) fill(r.draft, 10000);
  expect(parseBackup(JSON.stringify(backup(records))).records).toHaveLength(10);
  const p = freshCase(case017);
  p.stages[0].draft = makeWorkbook(case017.stages[0]);
  expect(() => parseBackup(JSON.stringify(backup(records, [p])))).toThrow(
    "100,000",
  );
});
test("案件工作簿也检查所需表及公式上限，先于证据遍历", () => {
  const p = freshCase(case017);
  p.stages[0].draft = makeWorkbook(case017.stages[0]);
  const book = p.stages[0].draft;
  const first = book.sheetOrder[0];
  book.sheets[first].cellData[0][0].f = "=".repeat(8193);
  expect(() => parseBackup(JSON.stringify(backup([], [p])))).toThrow("8,192");
  delete book.sheets[first];
  book.sheetOrder.shift();
  expect(() => parseBackup(JSON.stringify(backup([], [p])))).toThrow("缺少");
});
test("v1/v2 草稿往返；无效导入不打开事务或改变副本与记录", async () => {
  const connect = vi.fn();
  const unopened = createStorage({ name: crypto.randomUUID(), connect });
  const r = record();
  r.draft.sheets.main.rowCount = 2001;
  await expect(unopened.restore(JSON.stringify(backup([r])))).rejects.toThrow(
    "2,000",
  );
  expect(connect).not.toHaveBeenCalled();
  const s = createStorage({ name: crypto.randomUUID() });
  for (const version of [1, 2]) {
    const payload = { ...backup([record()]), version };
    await s.restore(JSON.stringify(payload));
    const before = await s.exportBackup();
    const previous = await s.previousBackup();
    await expect(s.restore(JSON.stringify(backup([r])))).rejects.toThrow(
      "2,000",
    );
    expect(await s.readRecords()).toEqual(before.records);
    expect(await s.previousBackup()).toEqual(previous);
  }
  await s.close();
});
