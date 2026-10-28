import { test, expect, openLesson, writeFormula, waitSaved } from "./helpers";
import { formulaInput } from "./native-editor";

async function selectD2(page: import("@playwright/test").Page) {
  const box = await page
    .locator(
      '.spreadsheet canvas:visible:not([data-u-comp="formula-editor"] canvas)',
    )
    .first()
    .boundingBox();
  if (!box) throw Error("表格没有显示");
  await page.mouse.click(box.x + 46 + 3 * 118 + 35, box.y + 24 + 32 + 16);
}

test("网格未确认输入显示确认后保存；取消、提交及刷新与已保存作答一致", async ({
  page,
}) => {
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  await waitSaved(page);
  await selectD2(page);
  await page.keyboard.type("=0");
  await expect(page.locator(".save-state")).toHaveText("正在输入，确认后保存");
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-state")).toHaveText("已保存到本机");
  await selectD2(page);
  await page.keyboard.type("=0");
  await expect(page.locator(".save-state")).toHaveText("正在输入，确认后保存");
  // Refresh does not promise to persist an unconfirmed native draft.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await selectD2(page);
  await page.keyboard.type("=B2*C2+1");
  await page.keyboard.press("Enter");
  await waitSaved(page);
  await page.reload();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2+1",
  );
});

test("案件使用相同的未确认输入提示，取消后仍显示实际保存状态", async ({
  page,
}) => {
  await page.goto("/#/case/case-017");
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  const address = page.getByRole("textbox", {
    name: "单元格地址",
    exact: true,
  });
  await address.fill("D2");
  await writeFormula(page, "=0");
  await expect(page.locator(".case-save [role=status]")).toHaveText(
    "案件已保存到本机",
  );
  await selectD2(page);
  await page.keyboard.type("=1");
  await expect(page.locator(".case-save [role=status]")).toHaveText(
    "正在输入，确认后保存",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".case-save [role=status]")).toHaveText(
    "案件已保存到本机",
  );
});
