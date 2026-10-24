import { test, expect, writeFormula, dismissGuide } from "./helpers";
import type { Page } from "@playwright/test";

async function openCase(page: Page) {
  await page.goto("/#/case/case-017");
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
}
async function write(page: Page, address: string, formula: string) {
  const input = page.getByRole("textbox", { name: "单元格地址", exact: true });
  await input.fill(address);
  await input.press("Enter");
  await writeFormula(page, formula);
}
async function reconcile(page: Page) {
  await write(page, "D2", "=SUMIF('签收'!$A$2:$A$17,A2,'签收'!$B$2:$B$17)");
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("D2:D18");
  await page.getByRole("button", { name: "↓ 向下填充", exact: true }).click();
  await write(page, "B21", "=SUM(B2:B18)");
  await write(page, "B22", "=SUM(D2:D18)");
  await write(page, "B23", "=B21-B22");
  await page.getByRole("button", { name: "核验这份证据", exact: true }).click();
  await expect(page.locator('[data-evidence="0"]')).toContainText("已核验");
}
async function transfer(page: Page) {
  await page.getByRole("button", { name: /2. 旧标签去了哪里/ }).click();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await write(page, "B2", "=VLOOKUP(A2,标签!A2:B4,2,FALSE)");
  await write(page, "C2", '=SUMIF(调拨!A2:A4,B2&"|有效",调拨!C2:C4)');
  await write(page, "D2", '=SUMIF(调拨!A2:A4,B2&"|撤回",调拨!C2:C4)');
  await write(page, "E2", '=VLOOKUP(B2&"|有效",调拨!A2:C4,2,FALSE)');
  await page.getByRole("button", { name: "核验这份证据", exact: true }).click();
  await expect(page.locator('[data-evidence="1"]')).toContainText("已核验");
}
test("首案：计算解锁、交接绑定、刷新恢复与旧证据失效", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("link", { name: "进入调查桌 →" }).click();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /2. 旧标签去了哪里/ }),
  ).toBeDisabled();
  await page.getByText("填写交接结论", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "去向", exact: true })
    .selectOption("河湾卫生站");
  await page
    .getByRole("combobox", { name: "原因", exact: true })
    .selectOption("常规汇总漏了临时调拨记录");
  await page
    .getByRole("combobox", { name: "处理建议", exact: true })
    .selectOption("补登记调拨并关联新旧标签，保留撤回记录");
  await page.getByRole("button", { name: "提交交接", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("没核验完整");
  await reconcile(page);
  await transfer(page);
  await page.getByRole("button", { name: "提交交接", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("绑定");
  await page.getByLabel("绑定：先把缺口找出来").check();
  await page.getByLabel("绑定：旧标签去了哪里").check();
  await page
    .getByRole("combobox", { name: "去向", exact: true })
    .selectOption("河湾学校");
  await page.getByRole("button", { name: "提交交接", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("有效签收");
  await page
    .getByRole("combobox", { name: "去向", exact: true })
    .selectOption("河湾卫生站");
  await page.getByRole("button", { name: "提交交接", exact: true }).click();
  await expect(page.locator(".case-solved")).toContainText("第 17 箱，找到了");
  await expect(page.locator(".case-save")).toContainText("案件已保存到本机");
  await page.reload();
  await expect(page.locator(".case-solved")).toBeVisible();
  await expect(page.locator('[data-evidence="1"]')).toContainText("已核验");
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await page.locator(".case-solved").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("case-solved.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /1. 先把缺口找出来/ }).click();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await write(page, "D2", "=999");
  await expect(page.locator('[data-evidence="0"]')).toContainText("待核验");
  await expect(page.locator('[data-evidence="1"]')).toContainText("待核验");
  await expect(page.locator(".case-solved")).toHaveCount(0);
  await page.getByRole("button", { name: /2. 旧标签去了哪里/ }).click();
  await expect(
    page.getByRole("button", { name: "核验这份证据", exact: true }),
  ).toBeDisabled();
});
test("调查提示链接到练习，再返回时保留草稿和提示记录", async ({ page }) => {
  await openCase(page);
  await write(page, "D2", "=45");
  await page.getByRole("button", { name: "调查提示", exact: true }).click();
  await page
    .getByRole("button", { name: "查看第一个提示", exact: true })
    .click();
  await expect(page.locator(".case-save")).toContainText("案件已保存到本机");
  await page.getByRole("link", { name: "去练习相关公式 →" }).click();
  await dismissGuide(page);
  await page
    .getByRole("link", { name: "← 返回第 17 箱货物调查（调查进度已保留）" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "输入公式或数值", exact: true }),
  ).toHaveValue("=45");
  await page.getByRole("button", { name: "调查提示", exact: true }).click();
  await expect(
    page.getByText("先看两张表共有哪一列。行号相同，不代表是同一箱。", {
      exact: true,
    }),
  ).toBeVisible();
});
test("固定答案和原始单据改写不能解锁线索", async ({ page }) => {
  await openCase(page);
  await write(page, "D2", "=1");
  await page.getByRole("button", { name: "核验这份证据", exact: true }).click();
  await expect(page.locator(".case-stage .case-message")).toContainText(
    "还有差异",
  );
  await expect(
    page.getByRole("button", { name: /2. 旧标签去了哪里/ }),
  ).toBeDisabled();
  await write(page, "B2", "0");
  await page.getByRole("button", { name: "核验这份证据", exact: true }).click();
  await expect(page.locator(".case-stage .case-message")).toContainText(
    "原始记录改变了",
  );
});
