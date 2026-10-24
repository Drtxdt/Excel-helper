import { test, expect } from "./helpers";
test("平板调查桌触摸写入、提示和横屏布局", async ({ page }, info) => {
  await page.goto("/#/case/case-017");
  const write = page.getByRole("button", { name: "写入", exact: true });
  await expect(write).toBeEnabled();
  const grid = await page
    .locator(".spreadsheet canvas:visible")
    .first()
    .boundingBox();
  expect(grid!.width).toBeGreaterThan(650);
  expect(grid!.y + grid!.height).toBeLessThanOrEqual(768);
  await page
    .locator(".spreadsheet canvas:visible")
    .first()
    .tap({ position: { x: 46 + 118 + 25, y: 24 + 32 + 16 } });
  await expect(
    page.getByRole("textbox", { name: "单元格地址", exact: true }),
  ).toHaveValue("B2");
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2");
  await page
    .getByRole("textbox", { name: "输入公式或数值", exact: true })
    .fill("=1");
  await write.tap();
  await page.getByRole("button", { name: "调查提示", exact: true }).tap();
  await page.getByRole("button", { name: "查看第一个提示", exact: true }).tap();
  await page.getByRole("button", { name: "关闭", exact: true }).tap();
  await expect(
    page.getByRole("button", { name: "调查提示", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);
  await page.screenshot({
    path: info.outputPath("case-tablet.png"),
    fullPage: true,
  });
});
