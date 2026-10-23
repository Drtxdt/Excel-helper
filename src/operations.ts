import type { CellValue, GradeResult, OperationGoal, SheetSeed } from "./types";
import { address } from "./workbook";

export interface Bounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}
export function bounds(a1: string): Bounds {
  const [first, last = first] = a1.split(":");
  const a = address(first),
    b = address(last);
  if (a.r > b.r || a.c > b.c || a.r < 0 || a.c < 0)
    throw Error("范围起点必须位于终点左上方。");
  return { startRow: a.r, endRow: b.r, startColumn: a.c, endColumn: b.c };
}
export function cellAddress(row: number, column: number) {
  let letters = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${letters}${row + 1}`;
}
export function rangeCells(range: Bounds): string[] {
  const cells: string[] = [];
  for (let r = range.startRow; r <= range.endRow; r++)
    for (let c = range.startColumn; c <= range.endColumn; c++)
      cells.push(cellAddress(r, c));
  return cells;
}
export function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const c = color.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(c)) return `#${c.replace(/^#/, "")}`;
  if (/^#[0-9a-f]{3}$/.test(c))
    return `#${[...c.slice(1)].map((n) => n + n).join("")}`;
  const rgb =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/.exec(
      c,
    );
  if (rgb && rgb.slice(1, 4).every((n) => Number(n) <= 255))
    return `#${rgb
      .slice(1, 4)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")}`;
  return undefined;
}
export interface FormatRule {
  ranges: Bounds[];
  type: string;
  subType?: string;
  operator?: string;
  value?: unknown;
  background?: string;
}
export type OperationState =
  | {
      kind: "sort-filter";
      sheet: string;
      range: Bounds | null;
      headers: CellValue[];
      rows: CellValue[][];
      criteria: { column: number; values: string[]; unsupported: boolean }[];
      hiddenRows: number[];
      filteredRows: number[];
    }
  | { kind: "format"; sheet: string; rules: FormatRule[] }
  | {
      kind: "validation";
      sheet: string;
      cells: {
        address: string;
        type: string | null;
        values: string[];
        allowInvalid: boolean;
        showError: boolean;
      }[];
    };
export interface OperationInput {
  category: string;
  ascending: boolean;
  range: string;
  threshold: number;
  values: string;
  reject: boolean;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && same([...a].sort(), [...b].sort());
const sameBounds = (a: Bounds | null, b: Bounds) =>
  !!a &&
  a.startRow === b.startRow &&
  a.endRow === b.endRow &&
  a.startColumn === b.startColumn &&
  a.endColumn === b.endColumn;
const intersects = (a: Bounds, b: Bounds) =>
  a.startRow <= b.endRow &&
  a.endRow >= b.startRow &&
  a.startColumn <= b.endColumn &&
  a.endColumn >= b.startColumn;

export function gradeOperation(
  goal: OperationGoal,
  state: OperationState,
  revision: number,
  sheets: SheetSeed[],
): GradeResult {
  const diagnostics: GradeResult["diagnostics"] = [];
  const fail = (message: string, cell = goal.range) =>
    diagnostics.push({
      cell: `${goal.sheet}!${cell}`,
      expected: null,
      actual: null,
      message,
    });
  const area = bounds(goal.range);
  if (state.kind !== goal.kind || state.sheet !== goal.sheet)
    fail(`请在 ${goal.sheet} 工作表的 ${goal.range} 完成操作。`);
  else if (goal.kind === "sort-filter" && state.kind === "sort-filter") {
    if (!sameBounds(state.range, area))
      fail(`筛选范围应为 ${goal.range}，包含表头和全部记录。`);
    if (
      state.criteria.length !== 1 ||
      state.criteria[0]?.column !== goal.filter.column ||
      state.criteria[0]?.unsupported ||
      !sameSet(state.criteria[0]?.values ?? [], goal.filter.values)
    )
      fail(
        `${goal.filter.label}应仅保留：${goal.filter.values.join("、")}。请清除其他列的筛选条件。`,
      );
    const seed = sheets.find((s) => s.id === goal.sheet);
    const original =
      seed?.rows
        .slice(area.startRow + 1, area.endRow + 1)
        .map((r) => r.slice(area.startColumn, area.endColumn + 1)) ?? [];
    const headers = seed?.rows[area.startRow]?.slice(
      area.startColumn,
      area.endColumn + 1,
    );
    if (
      !same(state.headers, headers) ||
      !same(
        state.rows.map((r) => JSON.stringify(r)).sort(),
        original.map((r) => JSON.stringify(r)).sort(),
      )
    )
      fail(
        "有记录丢失、重复或字段错位。排序时请带着整行移动，并保留原始数据。",
      );
    const filterIndex = goal.filter.column - area.startColumn,
      sortIndex = goal.sort.column - area.startColumn;
    const hidden = state.rows.flatMap((r, i) =>
      goal.filter.values.includes(String(r[filterIndex]))
        ? []
        : [area.startRow + 1 + i],
    );
    if (
      !same(
        [...state.filteredRows].sort((a, b) => a - b),
        hidden,
      ) ||
      !same(
        [...state.hiddenRows].sort((a, b) => a - b),
        hidden,
      )
    )
      fail("当前可见记录与筛选条件不一致。请检查额外隐藏的行与筛选范围。");
    const visible = state.rows.filter(
      (_, i) => !hidden.includes(area.startRow + 1 + i),
    );
    const values = visible.map((r) => r[sortIndex]);
    if (
      values.some(
        (v, i) =>
          typeof v !== "number" ||
          (i > 0 &&
            (goal.sort.ascending
              ? Number(values[i - 1]) > v
              : Number(values[i - 1]) < v)),
      )
    )
      fail(
        `${goal.sort.label}应按${goal.sort.ascending ? "从小到大" : "从大到小"}排列，整行数据一起移动。`,
      );
  } else if (goal.kind === "format" && state.kind === "format") {
    const required = new Set(rangeCells(area));
    const covered = new Set<string>();
    for (const rule of state.rules.filter((r) =>
      r.ranges.some((x) => intersects(x, area)),
    )) {
      const correct =
        rule.type === "highlightCell" &&
        rule.subType === "number" &&
        rule.operator === goal.operator &&
        rule.value === goal.threshold &&
        normalizeColor(rule.background) === normalizeColor(goal.background);
      if (!correct) {
        fail(
          `目标范围存在不符合要求的规则：需要小于 ${goal.threshold}，背景色 ${goal.background}。请检查冲突规则。`,
        );
        continue;
      }
      for (const r of rule.ranges) {
        if (
          r.startRow < area.startRow ||
          r.endRow > area.endRow ||
          r.startColumn < area.startColumn ||
          r.endColumn > area.endColumn
        )
          fail(`条件格式超出本关要求范围 ${goal.range}。`);
        const intersection = {
          startRow: Math.max(r.startRow, area.startRow),
          endRow: Math.min(r.endRow, area.endRow),
          startColumn: Math.max(r.startColumn, area.startColumn),
          endColumn: Math.min(r.endColumn, area.endColumn),
        };
        for (const cell of rangeCells(intersection)) covered.add(cell);
      }
    }
    for (const cell of required)
      if (!covered.has(cell))
        fail(
          `${cell} 缺少符合条件和颜色要求的规则。手工涂色不能代替条件格式。`,
          cell,
        );
  } else if (goal.kind === "validation" && state.kind === "validation") {
    const required = rangeCells(area);
    if (
      state.cells.length !== required.length ||
      new Set(state.cells.map((c) => c.address)).size !== required.length
    )
      fail("验证规则的单元格覆盖范围不完整。");
    for (const cell of required) {
      const rule = state.cells.find((c) => c.address === cell);
      if (
        !rule ||
        rule.type !== "list" ||
        !sameSet(rule.values, goal.values) ||
        rule.allowInvalid === goal.rejectInvalid ||
        (goal.rejectInvalid && !rule.showError)
      )
        fail(
          `${cell} 应允许 ${goal.values.join("、")}，并${goal.rejectInvalid ? "拒绝" : "允许"}列表外输入。`,
          cell,
        );
    }
  }
  return {
    revision,
    status: diagnostics.length ? "incorrect" : "passed",
    scenarios: 1,
    duration: 0,
    diagnostics,
  };
}
