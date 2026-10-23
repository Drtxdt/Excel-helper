import {
  test,
  expect,
  openLesson,
  writeFormula,
  checkPassed,
  waitSaved,
} from "./helpers";

test.beforeAll(() => {
  if (process.platform !== "linux")
    throw Error("截图基线只能在文档指定的 Linux Playwright 容器内验证或更新。");
});
for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`工作台通关布局 ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLesson(page, "02");
    await writeFormula(page, "=B2*C2");
    await checkPassed(page);
    await waitSaved(page);
    await page.getByRole("heading", { level: 1 }).click();
    await expect(page).toHaveScreenshot(`workshop-${viewport.width}.png`, {
      fullPage: true,
    });
  });
}
