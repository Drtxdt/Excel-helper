import { readFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import {
  test,
  expect,
  openLesson,
  writeFormula,
  checkPassed,
  waitSaved,
} from "./helpers";
import { formulaInput } from "./native-editor";
async function openCase(page: Page) {
  await page.goto("/#/case/case-017");
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
}
async function writeCase(page: Page, value: string) {
  await page
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("B21");
  await writeFormula(page, value);
  await expect(page.locator(".case-save")).toContainText("案件已保存到本机");
}
async function exported(page: Page, info: TestInfo, name: string) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出案件备份", exact: true }).click();
  const path = info.outputPath(name);
  await (await download).saveAs(path);
  return { path, data: JSON.parse(await readFile(path, "utf8")) };
}

test("单案件文件先确认再恢复，取消不写入，课程保留且旧页面不能覆盖", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120000);
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  await checkPassed(page);
  await waitSaved(page);
  await openCase(page);
  await writeCase(page, "=SUM(B2:B18)");
  await page.getByRole("button", { name: "调查提示", exact: true }).click();
  await page
    .getByRole("button", { name: "查看第一个提示", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const original = await exported(page, info, "single-case.json");
  await writeCase(page, "=0");
  const stale = await context.newPage();
  await openCase(stale);
  await page.goto("/#/records");
  await page.locator("input[type=file]").setInputFiles(original.path);
  const dialog = page.getByRole("dialog", { name: "恢复案件备份" });
  await expect(dialog).toContainText("消失的第 17 箱货物");
  await expect(dialog).toContainText("课程与其他案件保留");
  await dialog.getByRole("button", { name: "取消恢复", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导入备份", exact: true }),
  ).toBeFocused();
  await openCase(page);
  const cancelled = await exported(page, info, "after-cancel.json");
  expect(
    cancelled.data.progress.stages[0].draft.sheets.dispatch.cellData[20][1].f,
  ).toBe("=0");
  await page.goto("/#/records");
  await page.locator("input[type=file]").setInputFiles(original.path);
  await page.screenshot({
    path: info.outputPath("case-import-confirmation.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "确认恢复案件", exact: true })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "案件备份已恢复",
  );
  await expect(
    page.locator('.record-list a[href="#/lesson/02"]'),
  ).toContainText("已完成");
  await page.reload();
  await openCase(page);
  const restored = await exported(page, info, "restored-case.json");
  expect(restored.data.progress.stages).toEqual(original.data.progress.stages);
  expect(restored.data.progress.active).toBe(original.data.progress.active);
  await stale
    .getByRole("textbox", { name: "单元格地址", exact: true })
    .fill("B21");
  await writeFormula(stale, "=999");
  await expect(stale.locator(".case-desk > [role=alert]")).toContainText(
    "另一页面",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  const protectedCopy = await exported(page, info, "protected-case.json");
  expect(protectedCopy.data.progress.stages).toEqual(
    original.data.progress.stages,
  );
  await stale.close();
});

test("引擎初始化失败仍导出已加载的案件草稿和提示", async ({ page }, info) => {
  await openCase(page);
  await writeCase(page, "=SUM(B2:B18)");
  await page.getByRole("button", { name: "调查提示", exact: true }).click();
  await page
    .getByRole("button", { name: "查看第一个提示", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const original = await exported(page, info, "before-fault.json");
  // Fault injection at the browser Worker boundary, not application state/answers.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("formula.worker"))
          throw new Error("测试：公式 Worker 无法启动");
        super(url, options);
      }
    };
  });
  await page.reload();
  await expect(page.locator(".case-stage [role=alert]")).toContainText(
    "工作簿未能打开",
  );
  const emergency = await exported(page, info, "engine-unavailable-case.json");
  expect(emergency.data).toEqual(original.data);
  await expect(page.locator(".case-desk > [role=status]")).toContainText(
    "不包含尚未提交的输入",
  );
  await page.screenshot({
    path: info.outputPath("case-emergency-export.png"),
    fullPage: true,
  });
});

test("输入未能提交时不下载半份备份，并保留修改入口", async ({ page }, info) => {
  await openCase(page);
  await formulaInput(page).fill("SUM(B2:B18)");
  const downloads: unknown[] = [];
  page.on("download", (d) => downloads.push(d));
  await page.getByRole("button", { name: "导出案件备份", exact: true }).click();
  await expect(page.locator(".case-desk > [role=status]")).toContainText(
    "尚未导出",
  );
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "SUM(B2:B18)",
  );
  expect(downloads).toHaveLength(0);
  await page.getByRole("button", { name: "补上 =", exact: true }).click();
  const repaired = await exported(page, info, "confirmed-edit.json");
  expect(repaired.data.progress.stages[0].draft).toBeTruthy();
  expect(downloads).toHaveLength(1);
});
