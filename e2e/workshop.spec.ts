import { formulaInput } from "./native-editor";
import { test, expect, openLesson, writeFormula, checkPassed } from "./helpers";

test("引导可跳过、重开；帮助与重置对话框限制焦点并返回触发按钮", async ({
  page,
}) => {
  await page.goto("/#/lesson/02");
  const guide = page.getByRole("dialog", { name: "先试一次表格操作" });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "跳过引导", exact: true }).click();
  const reopen = page.getByRole("button", { name: "操作引导", exact: true });
  await reopen.click();
  await expect(guide).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reopen).toBeFocused();
  const hint = page.getByRole("button", { name: "查看提示", exact: true });
  await hint.click();
  const close = page.getByRole("button", { name: "关闭侧栏", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "查看完整解法与说明" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(hint).toBeFocused();
  const reset = page.getByRole("button", { name: "重做本关", exact: true });
  await reset.click();
  await expect(
    page.getByRole("dialog", { name: "重新做这份任务？" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reset).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
for (const width of [1024, 1366, 1920])
  test(`工作台 ${width} 版面与字号可用`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await openLesson(page, "02");
    await writeFormula(page, "=B2*C2");
    await checkPassed(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const grid = await page.locator(".spreadsheet").boundingBox();
    expect(grid!.width).toBeGreaterThan(650);
    expect(grid!.height).toBeGreaterThan(250);
    const small = await page
      .locator(
        ".workshop-actions button,.task-panel p,.workshop-heading,.entry-bar input,.learning-toolbar button,.sheet-footer button",
      )
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => parseFloat(getComputedStyle(n).fontSize) < 14)
          .map((n) => n.textContent),
      );
    expect(small).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`desktop-${width}.png`),
      fullPage: true,
    });
  });

test("帮助抽屉中的快捷键不撤销底层作答", async ({ page }) => {
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  const hint = page.getByRole("button", { name: "查看提示", exact: true });
  await hint.click();
  await expect(
    page.getByRole("button", { name: "关闭侧栏", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("Escape");
  await expect(hint).toBeFocused();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "");
});

test("键盘选格移动、修改后旧反馈失效，重置后可重新检查", async ({ page }) => {
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  await checkPassed(page);
  const address = page.getByRole("textbox", {
    name: "单元格地址",
    exact: true,
  });
  await address.fill("B2");
  await address.press("Enter");
  // Clicking the target address moves focus to the native grid; ArrowRight updates selection.
  await page.locator(".target-tags button").first().click();
  const grid = await page
    .locator(
      '.spreadsheet canvas:visible:not([data-u-comp="formula-editor"] canvas)',
    )
    .first()
    .boundingBox();
  await page.mouse.click(grid!.x + 46 + 3 * 118 + 32, grid!.y + 24 + 32 + 16);
  await page.keyboard.press("ArrowLeft");
  await expect(address).toHaveValue("C2");
  await formulaInput(page).fill("16");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(page.locator(".feedback.passed")).toHaveCount(0);
  await page.getByRole("button", { name: "重做本关", exact: true }).click();
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "");
  await writeFormula(page, "=B2*C2");
  await checkPassed(page);
});
