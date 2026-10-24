import { test, expect, openLesson, checkPassed } from "./helpers";
import { formulaInput } from "./native-editor";

test("在公式中间点选引用保留后文，字符串内部不插入引用", async ({ page }) => {
  await openLesson(page, "02");
  const grid = page
    .locator(
      '.spreadsheet canvas:visible:not([data-u-comp="formula-editor"] canvas)',
    )
    .first();
  async function point(column: number) {
    const box = (await grid.boundingBox())!;
    await page.mouse.click(
      box.x + 46 + column * 118 + 35,
      box.y + 24 + 32 + 16,
    );
  }
  await formulaInput(page).fill("=ROUND(,2)");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await page.locator(".target-tags button").first().click();
  await page.keyboard.press("F2");
  await page.keyboard.press("Home");
  for (let i = 0; i < 7; i++)
    await page.keyboard.press("ArrowRight", { delay: 30 });
  await point(1);
  await page.keyboard.type("*");
  await point(2);
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await page.locator(".target-tags button").first().click();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=ROUND(B2*C2,2)",
  );
  await checkPassed(page);

  const text = '="中文"';
  await formulaInput(page).fill(text);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.insertText("X");
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    '="中文X"',
  );
  await page.keyboard.press("Backspace");
  await point(2);
  // In a string the native editor commits/selects instead of inserting a reference.
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await page.locator(".target-tags button").first().click();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", text);
});
