import { test, expect } from "vitest";
import { inputIssue, calculationAdvice } from "../src/input-diagnostics";

test.each(["SUM(A1:A3)", "B2*C2", "$B$2*C2", "3*15"])(
  "提醒漏写等号：%s",
  (text) => {
    expect(inputIssue(text)?.code).toBe("missing-equals");
  },
);
test.each([
  "手套",
  "2026-10-24",
  "13800138000",
  "0017",
  "'SUM(A1:A3)",
  "=SUM(A1:A3)",
  '=IF(A1=1,"中文（备注），内容","正常")',
  "='进货''记录'!A1",
])("不误改文字和合法公式：%s", (text) => {
  expect(inputIssue(text)).toBeUndefined();
});
test.each(["=SUM(A1:A3", '=IF(A1=1,"缺引号)', "=SUM（A1:A3）", "=SUM(A1:A3))"])(
  "解释符号错误：%s",
  (text) => {
    expect(inputIssue(text)?.code).toBe("syntax");
  },
);
test("未知错误不猜原因", () =>
  expect(calculationAdvice("#UNKNOWN!")).toBeUndefined());
