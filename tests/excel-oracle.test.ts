import { createHash } from "node:crypto";
import { test, expect } from "vitest";
import { Univer } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import "@univerjs/engine-formula/facade";
import {
  buildExcelCases,
  excelInputText,
  type ExcelCase,
} from "../scripts/compatibility-fixtures.mjs";
import capture from "./fixtures/excel-golden.json";
import { calculate } from "../src/headless";
import { makeWorkbook, put, cell, equal } from "../src/workbook";
import { bounds, cellAddress } from "../src/operations";
import { lessons } from "../src/content";
import type { CellValue, WorkbookSnapshot } from "../src/types";
interface ResultCell {
  sheet: string;
  cell: string;
  formula: string | null;
  type: string;
  value: CellValue;
  errorType: number | null;
  errorText: string | null;
}
const golden = capture as unknown as {
  inputSha256: string;
  environment: { application: string; independentProcess: boolean };
  cases: {
    case: ExcelCase;
    dateSystem: string;
    verifiedAt: string;
    cells: ResultCell[];
  }[];
};
const inputs = buildExcelCases();
const errors: Record<number, string> = {
  1: "#NULL!",
  2: "#DIV/0!",
  3: "#VALUE!",
  4: "#REF!",
  5: "#NAME?",
  6: "#NUM!",
  7: "#N/A",
  8: "#GETTING_DATA",
};
function workbook(c: ExcelCase): WorkbookSnapshot {
  const book = makeWorkbook({
    ...lessons[0],
    id: c.id,
    sheets: c.input.sheets,
    targets: [],
  });
  for (const [key, formula] of Object.entries(c.input.formulas)) {
    const [sheet, a] = key.split("!");
    put(book, sheet, a, formula);
  }
  for (const x of c.input.changes) put(book, x.sheet, x.cell, x.value);
  if (c.input.fills.length) {
    const u = new Univer();
    u.registerPlugin(UniverFormulaEnginePlugin);
    const api = FUniver.newAPI(u);
    try {
      for (const fill of c.input.fills) {
        const area = bounds(fill.range);
        for (let r = area.startRow; r <= area.endRow; r++)
          for (let col = area.startColumn; col <= area.endColumn; col++) {
            const sourceRow = fill.direction === "down" ? area.startRow : r,
              sourceColumn =
                fill.direction === "right" ? area.startColumn : col;
            if (r === sourceRow && col === sourceColumn) continue;
            const source = cell(
              book,
              fill.sheet,
              cellAddress(sourceRow, sourceColumn),
            );
            put(
              book,
              fill.sheet,
              cellAddress(r, col),
              source.f
                ? api
                    .getFormula()
                    .moveFormulaRefOffset(
                      source.f,
                      col - sourceColumn,
                      r - sourceRow,
                    )
                : (source.v ?? null),
            );
          }
      }
    } finally {
      u.dispose();
    }
  }
  return book;
}
function observed(book: WorkbookSnapshot, c: ResultCell, index: number) {
  const raw = cell(book, c.sheet, c.cell);
  if (cell(book, "oracle", `A${index + 1}`).v)
    return {
      type: "error",
      value: null,
      errorText: errors[Number(cell(book, "oracle", `B${index + 1}`).v)],
    };
  const value = raw.t === 3 ? Boolean(raw.v) : (raw.v ?? null);
  return {
    type: value === null ? "blank" : typeof value,
    value,
    errorText: null,
  };
}

test("Excel 实测输入与当前课程一致，覆盖全部公式关和变式", () => {
  expect(golden.environment.application).toBe("Microsoft Excel");
  expect(golden.environment.independentProcess).toBe(true);
  expect(golden.inputSha256).toBe(
    createHash("sha256").update(excelInputText()).digest("hex"),
  );
  expect(golden.cases.map((x) => x.case)).toEqual(inputs);
  expect(
    new Set(
      golden.cases.filter((x) => x.case.lessonId).map((x) => x.case.lessonId),
    ).size,
  ).toBe(37);
  for (const c of golden.cases) {
    expect(Number.isFinite(Date.parse(c.verifiedAt))).toBe(true);
    expect(c.cells.length).toBeGreaterThan(0);
  }
});
for (const g of golden.cases) {
  if (g.dateSystem === "1904") {
    test("Excel 1904 日期实测与 1900 相差 1462 天，不宣称 Univer 支持 1904", () => {
      const base = golden.cases.find((c) => c.case.id === "edge-dates-1900")!;
      for (const c of g.cells)
        expect(
          Number(base.cells.find((x) => x.cell === c.cell)!.value) -
            Number(c.value),
        ).toBe(1462);
    });
    continue;
  }
  test(`Excel 对照 ${g.case.id}`, async () => {
    const input = workbook(g.case);
    for (const fill of g.case.input.fills)
      for (const expected of g.cells.filter(
        (c) => c.sheet === fill.sheet && c.formula,
      )) {
        // This compares engine reference movement with native Excel FillDown/FillRight, not learner answers.
        expect(cell(input, expected.sheet, expected.cell).f).toBe(
          expected.formula,
        );
      }
    // Ask the engine for semantic error types: the snapshot value alone cannot
    // distinguish an actual #N/A error from the literal text "#N/A".
    input.sheets.oracle = {
      ...input.sheets[input.sheetOrder[0]],
      id: "oracle",
      name: "Oracle probes",
      cellData: {},
    };
    input.sheetOrder.push("oracle");
    g.cells.forEach((c, i) => {
      const ref = `'${input.sheets[c.sheet].name.replaceAll("'", "''")}'!${c.cell}`;
      put(input, "oracle", `A${i + 1}`, `=ISERROR(${ref})`);
      put(input, "oracle", `B${i + 1}`, `=IFERROR(ERROR.TYPE(${ref}),0)`);
    });
    const actual = await calculate(input);
    const differences: unknown[] = [];
    for (const [index, c] of g.cells.entries()) {
      const value = observed(actual.book, c, index);
      const target = {
        type: c.type,
        value: c.value,
        errorText: c.errorType ? errors[c.errorType] : null,
      };
      if (
        value.type !== target.type ||
        !equal(value.value, target.value) ||
        value.errorText !== target.errorText
      )
        differences.push({
          cell: `${c.sheet}!${c.cell}`,
          formula: c.formula,
          excel: target,
          univer: value,
        });
    }
    expect(differences).toEqual([]);
    for (const t of g.case.targets)
      if (Object.hasOwn(t, "expected")) {
        const c = g.cells.find(
          (c) => c.sheet === t.sheet && c.cell === t.cell,
        )!;
        expect(c.type, `${g.case.id} ${t.cell}`).not.toBe("error");
        expect(
          equal(c.value, t.expected),
          `${g.case.id} ${t.cell}: Excel ${c.value}; course ${t.expected}`,
        ).toBe(true);
      }
  });
}
