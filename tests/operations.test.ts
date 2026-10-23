import { expect, test } from "vitest";
import { gradeOperation, bounds, normalizeColor } from "../src/operations";
import {
  operationLesson,
  sortState,
  formatState,
  validationState,
} from "./operation-fixtures";

for (const [name, change] of [
  [
    "漏掉最后一行",
    (s: ReturnType<typeof sortState>) => (s.range = bounds("A1:D5")),
  ],
  [
    "筛选错误列",
    (s: ReturnType<typeof sortState>) => (s.criteria[0].column = 2),
  ],
  [
    "额外筛选",
    (s: ReturnType<typeof sortState>) =>
      s.criteria.push({ column: 3, values: ["待发货"], unsupported: false }),
  ],
  [
    "只排序库存导致错位",
    (s: ReturnType<typeof sortState>) => (s.rows[0][0] = "手套"),
  ],
  ["遗漏隐藏记录", (s: ReturnType<typeof sortState>) => s.rows.pop()],
  [
    "隐藏行字段被修改",
    (s: ReturnType<typeof sortState>) => (s.rows[2][3] = "取消"),
  ],
  [
    "重复记录",
    (s: ReturnType<typeof sortState>) => (s.rows[4] = [...s.rows[2]]),
  ],
  [
    "显示顺序错误",
    (s: ReturnType<typeof sortState>) =>
      ([s.rows[0], s.rows[1]] = [s.rows[1], s.rows[0]]),
  ],
  ["额外手动隐藏", (s: ReturnType<typeof sortState>) => s.hiddenRows.push(1)],
  [
    "仅手动隐藏没有真实筛选",
    (s: ReturnType<typeof sortState>) => (s.filteredRows = []),
  ],
  ["更改表头", (s: ReturnType<typeof sortState>) => (s.headers[0] = "其他")],
] as const)
  test(`筛选排序拒绝：${name}`, () => {
    const l = operationLesson("36"),
      s = sortState();
    change(s);
    expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe(
      "incorrect",
    );
  });
for (const [name, change] of [
  ["手工涂色无规则", (s: ReturnType<typeof formatState>) => (s.rules = [])],
  [
    "错误颜色",
    (s: ReturnType<typeof formatState>) => (s.rules[0].background = "#00ff00"),
  ],
  [
    "条件小于等于",
    (s: ReturnType<typeof formatState>) =>
      (s.rules[0].operator = "lessThanOrEqual"),
  ],
  [
    "错误覆盖范围",
    (s: ReturnType<typeof formatState>) =>
      (s.rules[0].ranges = [bounds("C2:C5")]),
  ],
  [
    "多覆盖表头",
    (s: ReturnType<typeof formatState>) =>
      (s.rules[0].ranges = [bounds("C1:C6")]),
  ],
  [
    "重叠冲突规则",
    (s: ReturnType<typeof formatState>) =>
      s.rules.push({ ...structuredClone(s.rules[0]), background: "#000000" }),
  ],
  ["另一工作表", (s: ReturnType<typeof formatState>) => (s.sheet = "other")],
] as const)
  test(`条件格式拒绝：${name}`, () => {
    const l = operationLesson("37"),
      s = formatState();
    change(s);
    expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe(
      "incorrect",
    );
  });
test("等价颜色及拆分范围通过，范围外规则不干扰", () => {
  const l = operationLesson("37"),
    s = formatState();
  s.rules[0].background = "rgb(252, 224, 218)";
  s.rules[0].ranges = [bounds("C2:C3"), bounds("C4:C6")];
  s.rules.push({
    ...s.rules[0],
    ranges: [bounds("G2:G6")],
    background: "#000000",
  });
  expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe("passed");
  expect(normalizeColor("#FCE0DA")).toBe("#fce0da");
  expect(normalizeColor("rgba(252,224,218,0.5)")).toBeUndefined();
});
for (const [name, change] of [
  [
    "地址错位",
    (s: ReturnType<typeof validationState>) => (s.cells[4].address = "D7"),
  ],
  [
    "重复地址",
    (s: ReturnType<typeof validationState>) => (s.cells[4].address = "D2"),
  ],
  ["缺格", (s: ReturnType<typeof validationState>) => s.cells.pop()],
  [
    "额外允许值",
    (s: ReturnType<typeof validationState>) =>
      s.cells[1].values.push("已经发货"),
  ],
  [
    "关闭错误提示",
    (s: ReturnType<typeof validationState>) => (s.cells[2].showError = false),
  ],
  [
    "错误验证类型",
    (s: ReturnType<typeof validationState>) => (s.cells[2].type = "textLength"),
  ],
] as const)
  test(`逐格验证拒绝：${name}`, () => {
    const l = operationLesson("38"),
      s = validationState();
    change(s);
    expect(gradeOperation(l.operation!, s, 0, l.sheets).status).toBe(
      "incorrect",
    );
  });
test("验证规则来自配置，改工作表、地址和允许值无需修改判题器", () => {
  const l = structuredClone(operationLesson("38")),
    s = validationState();
  const goal = {
    kind: "validation" as const,
    sheet: "delivery",
    range: "B5:B9",
    values: ["收到", "退回"],
    rejectInvalid: true,
  };
  s.sheet = "delivery";
  s.cells.forEach((c, i) => {
    c.address = `B${5 + i}`;
    c.values = ["退回", "收到"];
  });
  expect(gradeOperation(goal, s, 0, l.sheets).status).toBe("passed");
});
