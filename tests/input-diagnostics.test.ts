import { test, expect } from "vitest";
import { grade } from "../src/grade";
import { lessons } from "../src/content";
import { makeWorkbook, put, cell } from "../src/workbook";

test("同一份文本错误不在变式中重复，保留定位和错误类别", async () => {
  const book = makeWorkbook(lessons[1]);
  put(book, "main", "D2", "B2*C2");
  const result = await grade(lessons[1], book, 7);
  expect(result.status).toBe("incorrect");
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]).toMatchObject({
    code: "missing-equals",
    action: "locate",
    cell: "main!D2",
  });
  expect(result.revision).toBe(7);
});
test.each([
  ["=1/0", "#DIV/0!"],
  ["=NOSUCHFUNCTION(1)", "#NAME?"],
])("计算错误保留真实错误类型并解释：%s", async (formula, error) => {
  const book = makeWorkbook(lessons[1]);
  put(book, "main", "D2", formula);
  const result = await grade(lessons[1], book);
  expect(result.diagnostics[0]).toMatchObject({
    code: "formula-error",
    actual: error,
  });
});

test("明确按文本保存的内容不重复建议转换公式", async () => {
  const book = makeWorkbook(lessons[1]);
  book.sheets.main.cellData[1][3] = { v: "SUM(B2:B4)", t: 4 };
  const result = await grade(lessons[1], book);
  expect(result.diagnostics.every((d) => d.code !== "missing-equals")).toBe(
    true,
  );
});

test("输入问题排在其他单元格的计算差异前", async () => {
  const lesson = lessons[6];
  const book = makeWorkbook(lesson);
  put(book, "main", "D2", "=1");
  put(book, "main", "D3", "B3*C3");
  const result = await grade(lesson, book);
  expect(result.diagnostics[0]).toMatchObject({
    cell: "main!D3",
    code: "missing-equals",
  });
});

test.each([
  ['="#DIV/0!"', "#DIV/0!"],
  ['=IFERROR(1/0,"#N/A")', "#N/A"],
  ["=NA()", "#N/A"],
  ["=1/0", "#DIV/0!"],
])("引擎元数据让选格诊断与判题一致：%s", async (formula, value) => {
  const { calculate } = await import("../src/headless");
  const { calculationAdvice } = await import("../src/input-diagnostics");
  const lesson = structuredClone(lessons[1]);
  lesson.targets[0].expected = value;
  lesson.variants = [];
  const book = makeWorkbook(lesson);
  put(book, "main", "D2", formula);
  const calculated = await calculate(book);
  const raw = cell(calculated.book, "main", "D2");
  expect(raw.v).toBe(value);
  const isError = formula === "=NA()" || formula === "=1/0";
  expect(Boolean(calculationAdvice(raw))).toBe(isError);
  const result = await grade(lesson, book);
  expect(result.status).toBe(isError ? "incorrect" : "passed");
  expect(result.diagnostics[0]?.code).toBe(
    isError ? "formula-error" : undefined,
  );
});

test.each(['="#DIV/0!"', '=IFERROR(1/0,"#N/A")'])(
  "错误样式文本只报告数值差异：%s",
  async (formula) => {
    const book = makeWorkbook(lessons[1]);
    put(book, "main", "D2", formula);
    const result = await grade(lessons[1], book);
    expect(result.status).toBe("incorrect");
    expect(result.diagnostics.every((d) => d.code === "result-mismatch")).toBe(
      true,
    );
  },
);
