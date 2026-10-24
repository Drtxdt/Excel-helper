import { formulaInput } from "./native-editor";
import { test, expect, dismissGuide, waitSaved } from "./helpers";

test("触摸选择函数候选、补上等号并确认写入", async ({ page }) => {
  await page.goto("/#/lesson/02");
  await dismissGuide(page);
  await page.locator(".target-tags button").first().tap();
  await formulaInput(page).fill("=SU");
  await expect(page.getByText("求参数的和", { exact: true })).toBeVisible();
  await page.getByText("SUM", { exact: true }).tap();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "=SUM(");
  await formulaInput(page).fill("B2*C2");
  await page.getByRole("button", { name: "补上 =", exact: true }).tap();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await page.getByRole("button", { name: "写入", exact: true }).tap();
  await page.getByRole("button", { name: "检查作答", exact: true }).tap();
  await expect(page.locator(".feedback.passed")).toBeVisible();
});

test("横屏触摸选格、公式栏写入、提示抽屉和撤销重做", async ({ page }, info) => {
  await page.goto("/#/lesson/02");
  const guide = page.getByRole("dialog", { name: "先试一次表格操作" });
  await expect(guide).toBeVisible();
  await expect(guide.locator("li")).toHaveCount(5);
  await guide.getByRole("button", { name: "开始操作", exact: true }).tap();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "收起任务", exact: true }).tap();
  await expect(page.locator(".task-panel")).toHaveCount(0);
  const grid = await page
    .locator(
      '.spreadsheet canvas:visible:not([data-u-comp="formula-editor"] canvas)',
    )
    .first()
    .boundingBox();
  expect(grid).not.toBeNull();
  // Canvas grid: 46px row header, 118px columns, 24px column header, 32px rows.
  await page.touchscreen.tap(grid!.x + 46 + 118 + 32, grid!.y + 24 + 32 + 16);
  await expect(
    page.getByRole("textbox", { name: "单元格地址", exact: true }),
  ).toHaveValue("B2");
  await page.touchscreen.tap(
    grid!.x + 46 + 3 * 118 + 32,
    grid!.y + 24 + 32 + 16,
  );
  await expect(
    page.getByRole("textbox", { name: "单元格地址", exact: true }),
  ).toHaveValue("D2");
  const input = formulaInput(page);
  await input.tap();
  await input.fill("=B2*C2");
  await page.getByRole("button", { name: "写入", exact: true }).tap();
  await expect(page.locator(".toolbar-note")).toContainText("=B2*C2");
  await page.getByRole("button", { name: "↶ 撤销", exact: true }).tap();
  await expect(input.value).toHaveAttribute("data-value", "");
  await page.getByRole("button", { name: "↷ 重做", exact: true }).tap();
  await expect(input.value).toHaveAttribute("data-value", "=B2*C2");
  const hint = page.getByRole("button", { name: "查看提示", exact: true });
  await hint.tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".hint")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("tablet-help.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭侧栏", exact: true }).tap();
  await expect(hint).toBeFocused();
  await page.getByRole("button", { name: "检查作答", exact: true }).tap();
  await expect(page.locator(".feedback.passed")).toBeVisible();
  await waitSaved(page);
  await page.screenshot({
    path: info.outputPath("tablet-1024.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);
  const panel = await page.locator(".spreadsheet").boundingBox();
  expect(panel!.height).toBeGreaterThan(180);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(input.value).toHaveAttribute("data-value", "=B2*C2");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("触摸按钮填充与切换工作表，不要求拖动或双击", async ({ page }) => {
  await page.goto("/#/lesson/07");
  await dismissGuide(page);
  await page.locator(".target-tags button").first().tap();
  const input = formulaInput(page);
  await input.fill("=B2*C2");
  await page.getByRole("button", { name: "写入", exact: true }).tap();
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2:D4");
  await page.getByRole("button", { name: "↓ 向下填充", exact: true }).tap();
  await page.getByRole("button", { name: "检查作答", exact: true }).tap();
  await expect(page.locator(".feedback.passed")).toBeVisible();
  await page.goto("/#/lesson/10");
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  const tabs = page.getByRole("group", { name: "切换工作表" });
  await tabs.getByRole("button", { name: "价格", exact: true }).tap();
  await expect(
    tabs.getByRole("button", { name: "价格", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(input.value).toHaveAttribute("data-value", "手套");
  await tabs.getByRole("button", { name: "订单", exact: true }).tap();
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2");
  await input.fill("=B2*'价格'!B2");
  await page.getByRole("button", { name: "写入", exact: true }).tap();
  await page.getByRole("button", { name: "检查作答", exact: true }).tap();
  await expect(page.locator(".feedback.passed")).toBeVisible();
});

test("竖屏提供转横屏提示，横屏后保留当前作答", async ({ page }) => {
  await page.goto("/#/lesson/02");
  await dismissGuide(page);
  await page.locator(".target-tags button").first().tap();
  const input = formulaInput(page);
  await input.fill("=B2*C2");
  await page.getByRole("button", { name: "写入", exact: true }).tap();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole("note")).toContainText("转为横屏");
  await expect(page.locator(".workshop-body")).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(input.value).toHaveAttribute("data-value", "=B2*C2");
  await expect(page.locator(".workshop-body")).toBeVisible();
});
