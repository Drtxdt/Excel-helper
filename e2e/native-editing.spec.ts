import { test, expect, openLesson, checkPassed, waitSaved } from "./helpers";
import { formulaInput } from "./native-editor";
import type { Page } from "@playwright/test";

async function cellPoint(page: Page, column: number, row = 1) {
  const box = await page
    .locator(
      '.spreadsheet canvas:visible:not([data-u-comp="formula-editor"] canvas)',
    )
    .first()
    .boundingBox();
  if (!box) throw Error("表格画布没有显示");
  return { x: box.x + 46 + column * 118 + 35, y: box.y + 24 + row * 32 + 16 };
}
async function selectCell(page: Page, column: number, row = 1) {
  const p = await cellPoint(page, column, row);
  await page.mouse.click(p.x, p.y);
}
test("真正从网格打字、F2、取消与未按 Enter 直接检查", async ({ page }) => {
  await openLesson(page, "02");
  await selectCell(page, 3);
  await page.keyboard.type("=B2*C2", { delay: 30 });
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await checkPassed(page);
  await selectCell(page, 3);
  await page.keyboard.press("F2");
  await page.keyboard.press("End");
  await page.keyboard.type("+1");
  await page.keyboard.press("Escape");
  await selectCell(page, 3);
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await waitSaved(page);
  await page.reload();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
});
test("网格双击输入文字、数字；撤销重做不依赖公式栏代填", async ({ page }) => {
  await openLesson(page, "02");
  const p = await cellPoint(page, 4);
  await page.mouse.dblclick(p.x, p.y);
  await page.keyboard.insertText("新到货");
  await page.keyboard.press("Enter");
  await selectCell(page, 4);
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "新到货",
  );
  await page.keyboard.type("17", { delay: 30 });
  await page.keyboard.press("Enter");
  await selectCell(page, 4);
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "17");
  await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "新到货",
  );
  await page.getByRole("button", { name: "↷ 重做", exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "17");
});
test("关闭提示后可继续编辑，路由切换提交尚未确认的公式", async ({ page }) => {
  await openLesson(page, "02");
  await page.getByRole("button", { name: "查看提示", exact: true }).click();
  await page.getByRole("button", { name: "关闭侧栏", exact: true }).click();
  await selectCell(page, 3);
  await page.keyboard.type("=B2*C2", { delay: 30 });
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "学习记录", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/records$/);
  await page.goBack();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
});

test("从剪贴板粘贴到网格，填充后计算三行", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openLesson(page, "07");
  await selectCell(page, 3);
  await page.evaluate(() => navigator.clipboard.writeText("=B2*C2"));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2:D4");
  await page.getByRole("button", { name: "↓ 向下填充", exact: true }).click();
  await checkPassed(page);
});

test("条件汇总课直接从网格输入中文条件", async ({ page }) => {
  await openLesson(page, "33");
  await selectCell(page, 2, 6);
  await page.keyboard.type('=SUMIFS(C2:C6,A2:A6,"东街",B2:B6,"已发货")', {
    delay: 20,
  });
  await checkPassed(page);
});
