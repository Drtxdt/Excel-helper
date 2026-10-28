import { test, expect, dismissGuide, waitSaved } from "./helpers";
import { readFile } from "node:fs/promises";

test("操作关卡的筛选、条件格式和验证资源经备份导入后仍能判题", async ({
  page,
}, info) => {
  for (const id of ["36", "37", "38"]) {
    await page.goto(`/#/lesson/${id}`);
    await dismissGuide(page);
    if (id === "36")
      await page.getByLabel("分类", { exact: true }).selectOption("食品");
    if (id === "37")
      await page
        .getByRole("spinbutton", { name: "小于", exact: true })
        .fill("10");
    if (id === "38") {
      await page
        .getByLabel("允许的值", { exact: true })
        .fill("待发货,已发货,取消");
      await page.getByLabel("拒绝其他值", { exact: true }).check();
    }
    await page.getByRole("button", { name: "应用到表格", exact: true }).click();
    await page.getByRole("button", { name: "检查作答", exact: true }).click();
    await expect(page.locator(".feedback.passed")).toBeVisible();
    await waitSaved(page);
  }
  await page.goto("/#/records");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const path = info.outputPath("operations.json");
  await (await download).saveAs(path);
  const original = JSON.parse(await readFile(path, "utf8"));
  expect(original.records).toHaveLength(3);
  for (const record of original.records)
    expect(record.draft.resources.length).toBeGreaterThan(0);
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(page.getByRole("status")).toContainText("备份已恢复");
  const again = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const restoredPath = info.outputPath("restored-operations.json");
  await (await again).saveAs(restoredPath);
  const restored = JSON.parse(await readFile(restoredPath, "utf8"));
  expect(restored.records).toEqual(original.records);
  for (const id of ["36", "37", "38"]) {
    await page.goto(`/#/lesson/${id}`);
    await expect(
      page.getByRole("button", { name: "写入", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "检查作答", exact: true }).click();
    await expect(page.locator(".feedback.passed")).toBeVisible();
  }
});
