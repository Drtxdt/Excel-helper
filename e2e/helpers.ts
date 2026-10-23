import { test as base, expect, type Page } from "@playwright/test";

// Fail on uncaught application/Worker errors instead of accepting a partial UI.
export const test = base.extend<{ cleanConsole: void }>({
  cleanConsole: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors, "浏览器不应出现未处理异常").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
export async function openLesson(page: Page, id: string) {
  await page.goto(`/#/lesson/${id}`);
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  // Select the task's answer cell through the same locator button a learner uses.
  await page.locator(".target-tags button").first().click();
}
export async function writeFormula(page: Page, formula: string) {
  await page
    .getByRole("textbox", { name: "输入公式或数值", exact: true })
    .fill(formula);
  await expect(
    page.getByRole("textbox", { name: "输入公式或数值", exact: true }),
  ).toHaveValue(formula);
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(page.locator(".toolbar-note")).toContainText(formula);
}
export async function checkPassed(page: Page, scenarios = 3) {
  await page.getByRole("button", { name: "检查作答", exact: true }).click();
  await expect(page.locator(".feedback.passed")).toContainText(
    "这份表，对上了。",
  );
  await expect(page.locator(".feedback.passed")).toContainText(
    `已核对 ${scenarios} 份数据`,
  );
}
export async function waitSaved(page: Page) {
  await expect(page.locator(".workshop-heading")).toContainText("已保存到本机");
}
