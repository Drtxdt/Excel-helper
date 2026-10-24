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
test("公式栏显示函数候选、参数并通过点选区域插入引用", async ({
  page,
}, info) => {
  await openLesson(page, "11");
  const bar = page.locator(
    '[data-u-comp="formula-bar"] [data-u-comp="formula-editor"]',
  );
  await bar.click();
  await page.keyboard.type("=SU", { delay: 50 });
  await expect(page.getByText("求参数的和", { exact: true })).toBeVisible();
  await page.getByText("SUM", { exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "=SUM(");
  const a = await cellPoint(page, 1, 1),
    b = await cellPoint(page, 1, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type(")");
  await page.screenshot({ path: info.outputPath("native-formula.png") });
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=SUM(B2:B4)",
  );
});
test("漏等号一键修正只修改草稿；可按文字写入和撤销", async ({ page }) => {
  await openLesson(page, "02");
  await formulaInput(page).fill("B2*C2");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(page.locator(".input-advice")).toContainText("当作文字");
  await page.getByRole("button", { name: "补上 =", exact: true }).click();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2",
  );
  await page.keyboard.press("Escape");
  await selectCell(page, 3);
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "");
  await formulaInput(page).fill("B2*C2");
  await page.getByRole("button", { name: "按文字写入", exact: true }).click();
  await selectCell(page, 3);
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "B2*C2");
  await page.getByRole("button", { name: "检查作答", exact: true }).click();
  await expect(page.locator(".diagnostic")).toHaveCount(1);
  await expect(page.locator(".diagnostic")).toContainText("开头加上 =");
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

test("键盘接受候选，跨表点选保持写入位置，嵌套公式与中文文本保留", async ({
  page,
}) => {
  await openLesson(page, "10");
  const bar = page.locator(
    '[data-u-comp="formula-bar"] [data-u-comp="formula-editor"]',
  );
  await bar.click();
  await page.keyboard.type("=SU", { delay: 50 });
  await expect(page.getByText("求参数的和", { exact: true })).toBeVisible();
  await page.keyboard.type("M");
  await expect(page.getByText("SUBTOTAL", { exact: true })).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");
  await expect(formulaInput(page).value).toHaveAttribute("data-value", "=SUM(");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await formulaInput(page).fill("=B2*");
  await page
    .getByRole("group", { name: "切换工作表" })
    .getByRole("button", { name: "价格", exact: true })
    .click();
  await selectCell(page, 1);
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await page.locator(".target-tags button").first().click();
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    /=B2\*.*价格.*!B2/,
  );
  await checkPassed(page);
  await formulaInput(page).fill('=IF(B2>0,ROUND(B2*价格!B2,2),"中文（备注）")');
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await checkPassed(page);
});

test("过期修正消失，明确文本不拦截，提交后的计算错误与检查一致", async ({
  page,
}) => {
  await openLesson(page, "02");
  await formulaInput(page).fill("SUM(B2:B4)");
  await expect(
    page.getByRole("button", { name: "补上 =", exact: true }),
  ).toBeVisible();
  await formulaInput(page).fill("普通备注");
  await expect(
    page.getByRole("button", { name: "补上 =", exact: true }),
  ).toHaveCount(0);
  await formulaInput(page).fill("'SUM(B2:B4)");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(page.locator(".input-advice")).toHaveCount(0);
  await formulaInput(page).fill("=1/0");
  await page.getByRole("button", { name: "写入", exact: true }).click();
  await expect(page.locator(".input-advice")).toContainText("除数是零或空白");
  await page.getByRole("button", { name: "检查作答", exact: true }).click();
  await expect(page.locator(".diagnostic")).toHaveCount(1);
  await expect(page.locator(".diagnostic")).toContainText("#DIV/0!");
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

test("组合事件仿真：选字尚未结束时不提交检查", async ({ page }) => {
  await openLesson(page, "02");
  await formulaInput(page).fill("=B2*C2");
  // Dispatch only composition lifecycle events; this is not a real OS IME test.
  await page.evaluate(() =>
    document.activeElement!.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    ),
  );
  await page.getByRole("button", { name: "检查作答", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("输入法还在选字");
  await expect(page.locator(".feedback")).toHaveCount(0);
  await page
    .locator('[data-u-comp="formula-bar"] [data-u-comp="formula-editor"]')
    .click();
  await page.evaluate(() =>
    document.activeElement!.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    ),
  );
  await formulaInput(page).fill("=B2*C2");
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
