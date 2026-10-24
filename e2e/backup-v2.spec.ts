import { formulaInput } from "./native-editor";
import { readFile } from "node:fs/promises";
import { test, expect, writeFormula } from "./helpers";
test("统一备份恢复案件草稿、线索和提示；旧课程备份保留案件", async ({
  page,
  browser,
}, info) => {
  await page.goto("/#/case/case-017");
  await expect(
    page.getByRole("button", { name: "写入", exact: true }),
  ).toBeEnabled();
  await writeFormula(page, "=SUMIF(签收!A2:A17,A2,签收!B2:B17)");
  await page.getByRole("button", { name: "调查提示", exact: true }).click();
  await page
    .getByRole("button", { name: "查看第一个提示", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByText("案件已保存到本机", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "学习记录", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const path = info.outputPath("unified.json");
  await (await downloading).saveAs(path);
  const data = JSON.parse(await readFile(path, "utf8"));
  await page.screenshot({
    path: info.outputPath("unified-records.png"),
    fullPage: true,
  });
  expect(data.version).toBe(2);
  expect(data.cases[0].stages[0].hints).toBe(1);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
  });
  try {
    const target = await context.newPage();
    await target.goto("/#/records");
    await target.locator("input[type=file]").setInputFiles(path);
    await expect(target.getByRole("status")).toContainText("备份已恢复");
    await target.locator("input[type=file]").setInputFiles({
      name: "old.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "supply-station",
          version: 1,
          exportedAt: "now",
          records: [],
        }),
      ),
    });
    await expect(target.getByRole("status")).toContainText("备份已恢复");
    await target
      .getByRole("link", { name: "消失的第 17 箱货物", exact: true })
      .click();
    await expect(formulaInput(target).value).toHaveAttribute(
      "data-value",
      "=SUMIF(签收!A2:A17,A2,签收!B2:B17)",
    );
    await target.getByRole("button", { name: "调查提示", exact: true }).click();
    await expect(
      target.getByRole("button", { name: "再看一个提示", exact: true }),
    ).toBeVisible();
    await target.screenshot({ path: info.outputPath("case-restored.png") });
  } finally {
    await context.close();
  }
});
