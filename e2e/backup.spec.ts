import { formulaInput } from "./native-editor";
import { readFile, open } from "node:fs/promises";
import {
  test,
  expect,
  openLesson,
  writeFormula,
  checkPassed,
  waitSaved,
  dismissGuide,
} from "./helpers";

test("真实导出、跨浏览器上下文导入、损坏文件隔离及导入前备份", async ({
  page,
  browser,
}, testInfo) => {
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  await checkPassed(page);
  await waitSaved(page);
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "学习记录" })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const download = await downloadPromise;
  const exported = testInfo.outputPath("original-backup.json");
  await download.saveAs(exported);
  const payload = JSON.parse(await readFile(exported, "utf8"));
  expect(payload.records).toHaveLength(1);
  expect(payload.records[0]).toMatchObject({ lessonId: "02", completed: true });
  expect(payload.records[0].draft.sheets.main.cellData[1][3].f).toBe("=B2*C2");

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    locale: "zh-CN",
  });
  try {
    const restored = await context.newPage();
    await restored.goto("/#/records");
    const chooserPromise = restored.waitForEvent("filechooser");
    await restored
      .getByRole("button", { name: "导入备份", exact: true })
      .click();
    await (await chooserPromise).setFiles(exported);
    await expect(restored.getByRole("status")).toContainText("备份已恢复");
    await restored.locator('.record-list a[href="#/lesson/02"]').click();
    await expect(
      restored.getByRole("button", { name: "写入", exact: true }),
    ).toBeEnabled();
    await expect(formulaInput(restored).value).toHaveAttribute(
      "data-value",
      "=B2*C2",
    );
    await dismissGuide(restored);
    await checkPassed(restored);
    await waitSaved(restored);
    await restored
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "学习记录" })
      .click();
    const invalidChooser = restored.waitForEvent("filechooser");
    await restored
      .getByRole("button", { name: "导入备份", exact: true })
      .click();
    await (
      await invalidChooser
    ).setFiles({
      name: "damaged.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await expect(restored.getByRole("status")).toContainText("没有导入");
    await expect(
      restored.locator('.record-list a[href="#/lesson/02"]'),
    ).toContainText("已完成");

    const oversized = structuredClone(payload);
    oversized.records[0].draft.sheets.main.rowCount = 2001;
    await restored.locator("input[type=file]").setInputFiles({
      name: "too-many-rows.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(oversized)),
    });
    await expect(restored.getByRole("status")).toContainText("2,000");
    await expect(restored.getByRole("status")).toContainText("没有导入");
    await expect(
      restored.locator('.record-list a[href="#/lesson/02"]'),
    ).toContainText("已完成");
    // Playwright limits in-memory file buffers to 50 MiB; use a real file.
    const largePath = testInfo.outputPath("too-many-bytes.json");
    const largeFile = await open(largePath, "w");
    try {
      await largeFile.truncate(60_000_001);
    } finally {
      await largeFile.close();
    }
    await restored.locator("input[type=file]").setInputFiles(largePath);
    await expect(restored.getByRole("status")).toContainText("60,000,000 字节");
    await expect(
      restored.locator('.record-list a[href="#/lesson/02"]'),
    ).toContainText("已完成");

    await restored.screenshot({
      path: testInfo.outputPath("backup-limit-feedback.png"),
      fullPage: true,
    });
    // Simulate slow disk reads, without changing application import/state APIs.
    await restored.evaluate(() => {
      const read = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = async function () {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return read.call(this);
      };
    });
    await restored.locator("input[type=file]").setInputFiles({
      name: "slow-valid-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ ...payload, records: [] }) + " ".repeat(2_000_000),
      ),
    });
    await restored
      .getByRole("button", { name: "取消读取", exact: true })
      .click();
    await expect(restored.getByRole("status")).toContainText("已取消读取");
    await expect(
      restored.locator('.record-list a[href="#/lesson/02"]'),
    ).toContainText("已完成");

    const importAgain = restored.waitForEvent("filechooser");
    await restored
      .getByRole("button", { name: "导入备份", exact: true })
      .click();
    await (
      await importAgain
    ).setFiles({
      name: "empty.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...payload, records: [] })),
    });
    await expect(restored.getByRole("status")).toContainText("备份已恢复");
    await expect(
      restored.locator('.record-list a[href="#/lesson/02"]'),
    ).toContainText("还没开始");
    const previousPromise = restored.waitForEvent("download");
    await restored
      .getByRole("button", { name: "下载导入前备份", exact: true })
      .click();
    const previousPath = testInfo.outputPath("before-import.json");
    await (await previousPromise).saveAs(previousPath);
    const previous = JSON.parse(await readFile(previousPath, "utf8"));
    expect(previous.records[0].draft.sheets.main.cellData[1][3].f).toBe(
      "=B2*C2",
    );
    await restored.reload();
    await expect(
      restored.locator('.record-list a[href="#/lesson/02"]'),
    ).toContainText("还没开始");
  } finally {
    await context.close();
  }
});
