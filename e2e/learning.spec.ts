import {
  test,
  expect,
  openLesson,
  writeFormula,
  checkPassed,
  waitSaved,
} from "./helpers";

test("引用公式经过独立变式判题；固定结果被拦截，提示可展开", async ({
  page,
}) => {
  await openLesson(page, "02");
  await writeFormula(page, "=45");
  await page.getByRole("button", { name: "检查作答", exact: true }).click();
  await expect(page.locator(".feedback.incorrect")).toContainText("应得到 75");
  await expect(page.locator(".feedback.incorrect")).toContainText("应得到 24");
  await page.getByRole("button", { name: "查看提示", exact: true }).click();
  await expect(page.locator(".hint")).toHaveCount(1);
  await page.getByRole("button", { name: "再给一个提示", exact: true }).click();
  await expect(page.locator(".hint")).toHaveCount(2);
  await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
  await writeFormula(page, "=B2*C2");
  await checkPassed(page);
  await waitSaved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "输入公式或数值", exact: true }),
  ).toHaveValue("=B2*C2");
  await checkPassed(page);
});

test("原生填充的共享公式在刷新后仍能通过变式检查", async ({ page }) => {
  await openLesson(page, "07");
  await writeFormula(page, "=B2*C2");
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2:D4");
  await page.getByRole("button", { name: "↓ 向下填充", exact: true }).click();
  await checkPassed(page);
  await waitSaved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await checkPassed(page);
  await page.getByRole("button", { name: "换一批数据", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "输入公式或数值", exact: true }),
  ).toHaveValue("");
  await writeFormula(page, "=B2*C2");
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2:D4");
  await page.getByRole("button", { name: "↓ 向下填充", exact: true }).click();
  await checkPassed(page);
  await expect(page.locator(".feedback.passed")).toContainText(
    "已记为独立完成变式",
  );
});

test("公式栏支持 Enter、撤销和重做", async ({ page }) => {
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  const input = page.getByRole("textbox", {
    name: "输入公式或数值",
    exact: true,
  });
  await input.fill("=0");
  await input.press("Enter");
  await expect(page.locator(".toolbar-note")).toContainText("=0");
  await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
  await expect(input).toHaveValue("=B2*C2");
  await page.getByRole("button", { name: "↷ 重做", exact: true }).click();
  await expect(input).toHaveValue("=0");
});
