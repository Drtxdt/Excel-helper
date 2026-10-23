import { lessons } from "../src/content";
import { bounds, type OperationState } from "../src/operations";
export const operationLesson = (id: string) =>
  lessons.find((l) => l.id === id)!;
export function sortState(): Extract<OperationState, { kind: "sort-filter" }> {
  return {
    kind: "sort-filter",
    sheet: "main",
    range: bounds("A1:D6"),
    headers: ["物资", "分类", "库存", "状态"],
    rows: [
      ["面包", "食品", 3, "待发货"],
      ["饼干", "食品", 8, "已发货"],
      ["手套", "工具", 12, "待发货"],
      ["饮水", "食品", 15, "待发货"],
      ["胶带", "工具", 20, "取消"],
    ],
    criteria: [{ column: 1, values: ["食品"], unsupported: false }],
    hiddenRows: [3, 5],
    filteredRows: [3, 5],
  };
}
export function formatState(): Extract<OperationState, { kind: "format" }> {
  return {
    kind: "format",
    sheet: "main",
    rules: [
      {
        ranges: [bounds("C2:C6")],
        type: "highlightCell",
        subType: "number",
        operator: "lessThan",
        value: 10,
        background: "#fce0da",
      },
    ],
  };
}
export function validationState(): Extract<
  OperationState,
  { kind: "validation" }
> {
  return {
    kind: "validation",
    sheet: "main",
    cells: ["D2", "D3", "D4", "D5", "D6"].map((address) => ({
      address,
      type: "list",
      values: ["待发货", "已发货", "取消"],
      allowInvalid: false,
      showError: true,
    })),
  };
}
