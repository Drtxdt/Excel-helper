import { formulaInput } from "./native-editor";
import type { Page } from "@playwright/test";
import { test, expect, waitSaved, dismissGuide } from "./helpers";
async function open(page: Page, id: string) {
  await page.goto(`/#/lesson/${id}`);
  await dismissGuide(page);
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
}
async function check(page: Page, passed: boolean) {
  await page.getByRole("button", { name: "检查作答", exact: true }).click();
  await expect(
    page.locator(passed ? ".feedback.passed" : ".feedback.incorrect"),
  ).toBeVisible();
}
async function apply(page: Page) {
  await page.getByRole("button", { name: "应用到表格", exact: true }).click();
}

test("排序筛选检查实际范围、可见行与整行数据，刷新后规则保留", async ({
  page,
}) => {
  await open(page, "36");
  await apply(page);
  await check(page, false);
  await page.getByLabel("分类", { exact: true }).selectOption("食品");
  await apply(page);
  await check(page, true);
  await waitSaved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await check(page, true);
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2");
  await formulaInput(page).fill("取消");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await check(page, false);
  await expect(page.locator(".feedback.incorrect")).toContainText("字段错位");
});

test("条件格式检查覆盖范围与阈值，实际规则可保存恢复", async ({
  page,
}, testInfo) => {
  await open(page, "37");
  await page
    .getByRole("textbox", { name: "应用范围", exact: true })
    .fill("C2:C5");
  await page.getByRole("spinbutton", { name: "小于", exact: true }).fill("10");
  await apply(page);
  await check(page, false);
  await expect(page.locator(".feedback.incorrect")).toContainText("C6");
  await page
    .getByRole("textbox", { name: "应用范围", exact: true })
    .fill("C2:C6");
  await apply(page);
  await check(page, true);
  await waitSaved(page);
  await page.screenshot({
    path: testInfo.outputPath("conditional-format.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await check(page, true);
});

test("数据验证逐格检查范围并实际拒绝列表外输入", async ({ page }) => {
  await open(page, "38");
  await page.getByLabel("允许的值", { exact: true }).fill("待发货,已发货,取消");
  await apply(page);
  await check(page, false);
  await page.getByLabel("拒绝其他值", { exact: true }).check();
  await page
    .getByRole("textbox", { name: "应用范围", exact: true })
    .fill("D2:D5");
  await apply(page);
  await check(page, false);
  await page
    .getByRole("textbox", { name: "应用范围", exact: true })
    .fill("D2:D6");
  await apply(page);
  await check(page, true);
  await waitSaved(page);
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D6");
  await formulaInput(page).fill("已经发货");
  // Native list cells open a searchable picker: unmatched text is not a cell edit.
  await expect(page.locator("input:focus")).toHaveValue("已经发货");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "待发货",
  );
  await formulaInput(page).fill("取消");
  await page.getByText("取消", { exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "取消");
  await waitSaved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await check(page, true);
});
