import { test, expect } from "vitest";
import { explainMatches } from "../src/trace";
test("条件汇总解释匹配行和遗漏行", () => {
  const data: Record<string, unknown[][]> = {
    "A2:A4": [["东街"], ["东街"], ["西街"]],
    "B2:B4": [["已发货"], ["取消"], ["已发货"]],
    "C2:C4": [[100], [40], [60]],
  };
  expect(
    explainMatches(
      '=SUMIFS(C2:C4,A2:A4,"东街",B2:B4,"已发货")',
      (r) => data[r],
    ),
  ).toEqual([
    { row: 2, included: true, value: 100 },
    { row: 3, included: false, value: 40 },
    { row: 4, included: false, value: 60 },
  ]);
});
test("复杂条件不伪造中间解释", () => {
  expect(explainMatches('=SUMIF(A2:A4,">10",B2:B4)', () => [[20]])).toEqual([]);
});
