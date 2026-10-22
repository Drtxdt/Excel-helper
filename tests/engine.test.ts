import { test, expect } from "vitest";
import { calculate } from "../src/headless";
import { applySolution, cell } from "../src/workbook";
import raw from "../src/content/lessons.json";
import type { LessonDefinition } from "../src/types";
import { grade } from "../src/grade";
test("真实引擎计算引用公式", async () => {
  const l = raw[1] as LessonDefinition;
  const r = await calculate(applySolution(l));
  expect(cell(r.book, "main", "D2").v).toBe(45);
});
for (const l of raw as LessonDefinition[])
  if (!l.operation)
    test(`${l.id} ${l.title}：参考解法和独立变式`, async () => {
      const r = await grade(l, applySolution(l));
      expect(r.diagnostics).toEqual([]);
      expect(r.status).toBe("passed");
    });
