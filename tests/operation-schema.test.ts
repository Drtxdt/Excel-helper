import { test, expect } from "vitest";
import { operationSchema, lessonSchema } from "../src/course-schema";
import { operationLesson, sortState } from "./operation-fixtures";
import { gradeOperation, bounds } from "../src/operations";

test("操作配置拒绝未知工作表、倒置范围、越界列和重复允许值", () => {
  const l = structuredClone(operationLesson("36"));
  expect(
    lessonSchema.safeParse({
      ...l,
      operation: { ...l.operation!, sheet: "missing" },
    }).success,
  ).toBe(false);
  for (const range of ["D6:A1", "A0:D6", "A1:XFE6", "A1:D1048577", "A1:D1"])
    expect(
      operationSchema.safeParse({ ...l.operation!, range }).success,
      range,
    ).toBe(false);
  if (l.operation?.kind !== "sort-filter") throw Error("fixture");
  expect(
    operationSchema.safeParse({
      ...l.operation,
      filter: { ...l.operation.filter, column: 4 },
    }).success,
  ).toBe(false);
  expect(
    operationSchema.safeParse({
      ...l.operation,
      filter: { ...l.operation.filter, values: ["未知"] },
    }).success,
  ).toBe(false);
  expect(
    operationSchema.safeParse({
      ...operationLesson("38").operation,
      values: ["收到", "收到"],
    }).success,
  ).toBe(false);
  expect(
    operationSchema.safeParse({
      ...operationLesson("37").operation,
      background: "red",
    }).success,
  ).toBe(false);
});

test("排序筛选使用配置的工作表、偏移范围与列号", () => {
  const l = structuredClone(operationLesson("36")),
    state = sortState();
  if (l.operation?.kind !== "sort-filter") throw Error("fixture");
  const goal = {
    ...l.operation,
    sheet: "other",
    range: "C4:F9",
    filter: { ...l.operation.filter, column: 3 },
    sort: { ...l.operation.sort, column: 4 },
  };
  const sheets = [
    {
      id: "other",
      name: "配送",
      rows: [
        [],
        [],
        [],
        ...l.sheets[0].rows.map((row) => [null, null, ...row]),
      ],
    },
  ];
  state.sheet = "other";
  state.range = bounds(goal.range);
  state.criteria[0].column = 3;
  state.hiddenRows = state.hiddenRows.map((r) => r + 3);
  state.filteredRows = state.filteredRows.map((r) => r + 3);
  expect(gradeOperation(goal, state, 0, sheets).status).toBe("passed");
  state.criteria[0].column = 1;
  expect(gradeOperation(goal, state, 0, sheets).status).toBe("incorrect");
});
