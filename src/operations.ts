import type { GradeResult } from "./types";
export function gradeOperation(
  kind: string,
  state: any,
  revision: number,
): GradeResult {
  let passed = false,
    message = "";
  if (kind === "sort-filter") {
    const visible = (state.rows ?? []).filter(
      (_: unknown, i: number) => !state.hidden?.includes(i + 1),
    );
    const items = visible.map((r: any[]) => r[0]);
    const quantities = visible.map((r: any[]) => r[2]);
    passed =
      state.criteria?.filters?.filters?.length === 1 &&
      state.criteria.filters.filters[0] === "食品" &&
      items.length === 3 &&
      ["面包", "饼干", "饮水"].every((v, i) => items[i] === v) &&
      quantities.every(
        (v: number, i: number) => i === 0 || v >= quantities[i - 1],
      );
    message =
      "请保留“食品”分类，并按库存从小到大排列整行。应依次看到面包、饼干、饮水。";
  } else if (kind === "format") {
    passed =
      Array.isArray(state) &&
      state.some(
        (r: any) =>
          r.rule?.type === "highlightCell" &&
          r.rule?.subType === "number" &&
          r.rule?.operator === "lessThan" &&
          r.rule?.value === 10 &&
          r.rule?.style?.bg?.rgb &&
          r.ranges?.some(
            (x: any) =>
              x.startRow === 1 &&
              x.endRow === 5 &&
              x.startColumn === 2 &&
              x.endColumn === 2,
          ),
      );
    message =
      "检查条件格式：范围 C2:C6，数值小于 10，并设置背景色。单独给格子涂色不会随库存变化。";
  } else {
    passed =
      Array.isArray(state) &&
      state.length === 5 &&
      state.every(
        (v: any) =>
          v &&
          v.type === "list" &&
          !v.allowInvalid &&
          ["待发货", "已发货", "取消"].every((x) => v.options.includes(x)) &&
          v.options.length === 3,
      );
    message =
      "请给 D2:D6 设置列表验证，允许待发货、已发货、取消，并拒绝其他值。";
  }
  return {
    revision,
    status: passed ? "passed" : "incorrect",
    scenarios: 1,
    duration: 0,
    diagnostics: passed
      ? []
      : [{ cell: "main", expected: null, actual: null, message }],
  };
}
