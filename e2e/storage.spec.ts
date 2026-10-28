import { formulaInput } from "./native-editor";
import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  openLesson,
  writeFormula,
  checkPassed,
  waitSaved,
} from "./helpers";

test("直接通过变式同时计为完成，刷新后地图和记录一致", async ({ page }) => {
  await openLesson(page, "02");
  await page.getByRole("button", { name: "换一批数据", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await page.locator(".target-tags button").first().click();
  await writeFormula(page, "=B2*C2");
  await checkPassed(page);
  await waitSaved(page);
  await expect(page.locator(".feedback.passed")).toContainText(
    "已记为独立完成变式",
  );
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "课程地图" })
    .click();
  await expect(page.locator(".progress-note strong")).toContainText("1 / 40");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "学习记录" })
    .click();
  await page.reload();
  await expect(page.locator(".records-summary > div").first()).toContainText(
    "1 / 40",
  );
  await expect(
    page.locator('.record-list a[href="#/lesson/02"]'),
  ).toContainText("独立完成变式");
});

test("另一标签页导入后保留本页作答，允许导出，再明确重新载入", async ({
  page,
  context,
}, testInfo) => {
  await openLesson(page, "02");
  await writeFormula(page, "=B2*C2");
  await waitSaved(page);
  const other = await context.newPage();
  const errors: string[] = [];
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto("/#/records");
  await expect(
    other.locator('.record-list a[href="#/lesson/02"]'),
  ).toContainText("正在练习");
  const chooser = other.waitForEvent("filechooser");
  await other.getByRole("button", { name: "导入备份", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "supply-station",
        version: 1,
        exportedAt: new Date().toISOString(),
        records: [],
      }),
    ),
  });
  await expect(other.getByRole("status")).toContainText("备份已恢复");
  await expect(page.getByRole("alert")).toContainText("已保存的学习记录有更新");
  await writeFormula(page, "=B2*C2+1");
  await expect(page.locator(".workshop-heading")).toContainText(
    "存档有更新，当前作答尚未保存",
  );
  await expect(formulaInput(page).value).toHaveAttribute(
    "data-value",
    "=B2*C2+1",
  );
  await page.screenshot({
    path: testInfo.outputPath("storage-conflict.png"),
    fullPage: true,
  });
  await testInfo.attach("存档冲突", {
    path: testInfo.outputPath("storage-conflict.png"),
    contentType: "image/png",
  });
  await page.getByRole("alert").getByRole("link", { name: "导出备份" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const file = testInfo.outputPath("conflicted-answer.json");
  await (await download).saveAs(file);
  const payload = JSON.parse(await readFile(file, "utf8"));
  expect(payload.records[0].draft.sheets.main.cellData[1][3].f).toBe(
    "=B2*C2+1",
  );
  await page
    .getByRole("button", { name: "重新载入已保存记录", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.locator('.record-list a[href="#/lesson/02"]'),
  ).toContainText("还没开始");
  await other.reload();
  await expect(
    other.locator('.record-list a[href="#/lesson/02"]'),
  ).toContainText("还没开始");
  expect(errors).toEqual([]);
  await other.close();
});
