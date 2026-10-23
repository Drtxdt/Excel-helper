import { test, expect } from "vitest";
import { lessons } from "../src/content";
import { grade } from "../src/grade";
import { makeWorkbook, applySolution, put, cell } from "../src/workbook";
import {
  operationLesson,
  sortState,
  formatState,
  validationState,
} from "./operation-fixtures";
import { gradeOperation } from "../src/operations";
import { backup, parseBackup } from "../src/storage";
import { exerciseLesson } from "../src/exercise";
test("已有计算缓存的填充公式在变式里重新计算", async () => {
  const b = applySolution(lessons[6]);
  for (const t of lessons[6].targets) {
    const c = cell(b, t.sheet, t.cell);
    c.v = t.expected;
    c.t = 2;
  }
  expect((await grade(lessons[6], b)).status).toBe("passed");
});
test("独立练习也必须通过其他数据，不能写死变式答案", async () => {
  const l = exerciseLesson(lessons[1], 0);
  const b = applySolution(lessons[1]);
  for (const c of lessons[1].variants[0].changes)
    put(b, c.sheet, c.cell, c.value);
  expect((await grade(l, b)).status).toBe("passed");
  put(b, "main", "D2", "=75");
  expect((await grade(l, b)).status).toBe("incorrect");
});
test("常量算术允许，引用关硬编码被变式识别", async () => {
  const b = makeWorkbook(lessons[1]);
  put(b, "main", "D2", "=45");
  const r = await grade(lessons[1], b);
  expect(r.status).toBe("incorrect");
  expect(r.diagnostics.some((d) => d.variant)).toBe(true);
  expect(cell(b, "main", "B2").v).toBe(3);
});
test("接受等价 PRODUCT 解法", async () => {
  expect(
    (await grade(lessons[1], applySolution(lessons[1], undefined, 1))).status,
  ).toBe("passed");
});
test("不能用纯结果代替公式", async () => {
  const b = makeWorkbook(lessons[0]);
  put(b, "main", "D2", 45);
  expect((await grade(lessons[0], b)).status).toBe("incorrect");
});
test("遗漏求和范围会被识别", async () => {
  const b = applySolution(lessons[10]);
  put(b, "main", "B6", "=SUM(B2:B4)");
  expect((await grade(lessons[10], b)).status).toBe("incorrect");
});
test("解析函数节点而非字符串包含来检查技能", async () => {
  const b = makeWorkbook(lessons[10]);
  put(b, "main", "B6", '=IF("SUM"="SUM",40,40)');
  const r = await grade(lessons[10], b);
  expect(r.diagnostics.some((d) => d.message.includes("请练习 SUM"))).toBe(
    true,
  );
});
test("筛选必须保留正确行并排序", () => {
  const l = operationLesson("36"),
    s = sortState();
  expect(gradeOperation(l.operation!, s, 2, l.sheets).status).toBe("passed");
  s.hiddenRows = [];
  expect(gradeOperation(l.operation!, s, 2, l.sheets).status).toBe("incorrect");
});
test("条件格式检查真实规则范围与条件", () => {
  const l = operationLesson("37"),
    s = formatState();
  expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe("passed");
  s.rules[0].value = 9;
  expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe("incorrect");
});
test("验证规则必须拒绝无效值并覆盖五格", () => {
  const l = operationLesson("38"),
    s = validationState();
  expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe("passed");
  s.cells[2].allowInvalid = true;
  expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe("incorrect");
});
test("备份结构校验拒绝损坏与重复记录", () => {
  expect(parseBackup(JSON.stringify(backup([]))).records).toEqual([]);
  expect(() => parseBackup("{bad")).toThrow();
  expect(() =>
    parseBackup(JSON.stringify({ ...backup([]), version: 99 })),
  ).toThrow();
  expect(() =>
    parseBackup(
      JSON.stringify({
        ...backup([]),
        records: [{ lessonId: "01", draft: {} }],
      }),
    ),
  ).toThrow();
});
