import { chromium } from "@playwright/test";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import os from "node:os";
import { execFileSync } from "node:child_process";
const lessons = JSON.parse(await readFile("src/content/lessons.json"));
const investigation = JSON.parse(await readFile("src/cases/case-017.json"));
const samples = Number(process.env.PERF_SAMPLES || 5);
const output = process.env.PERF_OUTPUT || "outputs/pr06/performance.json";
const browser = await chromium.launch();
const rows = [],
  resources = [];
try {
  for (let n = 0; n < samples; n++) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const active = new Set();
    page.on("worker", (w) => {
      active.add(w);
      w.on("close", () => active.delete(w));
    });
    for (const id of process.env.PERF_TRANSFER
      ? ["case-017", "case-017-transfer"]
      : ["02", "07", "26", "33", "40", "case-017"]) {
      const isCase = id.startsWith("case-");
      const task = isCase
        ? investigation.stages[id.endsWith("transfer") ? 1 : 0]
        : lessons.find((x) => x.id === id);
      const fresh = page.url() === "about:blank";
      console.log("sample", n, "task", id);
      await page.evaluate(() => performance.clearMeasures());
      const started = performance.now();
      await page.goto(
        `http://127.0.0.1:4173/?perf=1#/${isCase ? "case/case-017" : "lesson/" + id}`,
      );
      if (id.endsWith("transfer"))
        await page.getByRole("button", { name: /^2\. 旧标签去了哪里/ }).click();
      await page.getByRole("button", { name: "写入", exact: true }).waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".entry-bar button")?.disabled,
      );
      rows.push({
        id,
        sample: n,
        metric: "navigation-ready",
        mode: fresh
          ? n === 0
            ? "cold-browser"
            : "fresh-context"
          : "warm-route",
        ms: performance.now() - started,
      });
      const guide = page.getByRole("dialog", { name: "先试一次表格操作" });
      if (await guide.isVisible())
        await guide
          .getByRole("button", { name: "开始操作", exact: true })
          .click();
      for (const [key, formula] of Object.entries(task.solutions[0].cells)) {
        const [sheet, cell] = key.split("!");
        await page
          .getByRole("group", { name: "切换工作表" })
          .getByRole("button", {
            name: task.sheets.find((s) => s.id === sheet).name,
            exact: true,
          })
          .click();
        await page
          .getByRole("textbox", { name: "单元格地址", exact: true })
          .fill(cell);
        await page
          .getByRole("textbox", { name: "单元格地址", exact: true })
          .press("Enter");
        await page.waitForFunction(
          (cell) =>
            document
              .querySelector(".toolbar-note")
              ?.textContent?.trim()
              .startsWith(cell),
          cell,
        );
        await page
          .locator('[data-u-comp="formula-bar"] [data-u-comp="formula-editor"]')
          .click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.insertText(formula);
        const previous = await page.evaluate(
          () => performance.getEntriesByName("supply:recalculate").length,
        );
        await page.getByRole("button", { name: "写入", exact: true }).click();
        await page.waitForFunction(
          (n) => performance.getEntriesByName("supply:recalculate").length > n,
          previous,
        );
      }
      for (let repeat = 0; repeat < 3; repeat++) {
        await page
          .getByRole("button", {
            name: isCase ? "核验这份证据" : "检查作答",
            exact: true,
          })
          .click();
        try {
          await (
            isCase
              ? page.getByText("计算已核验，可以查看证据栏。", { exact: true })
              : page.locator(".feedback.passed")
          ).waitFor();
        } catch (e) {
          console.log(await page.locator("main").innerText());
          await page.screenshot({ path: "outputs/pr06/perf-failure.png" });
          throw e;
        }
        await page.waitForFunction(
          (count) =>
            performance.getEntriesByName("supply:check").length >= count,
          repeat + 1,
        );
      }
      const entries = await page.evaluate(() =>
        performance
          .getEntriesByType("measure")
          .filter((e) => e.name.startsWith("supply:"))
          .map((e) => ({ metric: e.name.slice(7), ms: e.duration })),
      );
      for (const [i, entry] of entries.entries())
        rows.push({
          id,
          sample: n,
          mode:
            entry.metric === "check"
              ? entries.slice(0, i).some((e) => e.metric === "check")
                ? "warm"
                : "first"
              : "all",
          ...entry,
        });
      // Hash routes preserve the document while releasing the old spreadsheet.
      await page
        .getByRole("link", { name: "学习记录", exact: false })
        .first()
        .click();
      await page.locator(".records-page").waitFor();
      await page.waitForTimeout(350);
      resources.push({
        id,
        sample: n,
        workers: active.size,
        canvases: await page.locator("canvas").count(),
        dom: await page.locator("*").count(),
      });
    }
    await context.close();
  }
  const summary = [];
  for (const key of new Set(rows.map((r) => `${r.id}/${r.metric}/${r.mode}`))) {
    const values = rows
      .filter((r) => `${r.id}/${r.metric}/${r.mode}` === key)
      .map((r) => r.ms)
      .sort((a, b) => a - b);
    summary.push({
      key,
      n: values.length,
      p50: values[Math.ceil(values.length * 0.5) - 1],
      p95: values[Math.ceil(values.length * 0.95) - 1],
    });
  }
  const files = await readdir("dist/assets");
  let bytes = 0;
  for (const f of files) bytes += (await stat(`dist/assets/${f}`)).size;
  await mkdir("outputs/pr06", { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        environment: {
          commit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          date: new Date().toISOString(),
          node: process.version,
          platform: os.platform(),
          cpu: os.cpus()[0].model,
          browser: browser.version(),
          viewport: "1366x768",
          samples,
        },
        bytes,
        summary,
        resources,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(
    output,
    bytes,
    summary.filter((x) => /check/.test(x.key)),
  );
} finally {
  await browser.close();
}
