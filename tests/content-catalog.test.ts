import { test, expect } from "vitest";
import {
  contentPackSchema,
  knowledgeCards,
  manifest,
} from "../src/content/catalog";
import { lessons } from "../src/content";
import { cases } from "../src/cases/catalog";
const pack = () =>
  structuredClone({
    format: "supply-station-content",
    version: 1,
    source: "表格补给站原创",
    license: "MIT",
    author: "表格补给站",
    authorization: "仓库 MIT 许可",
    publicDistribution: true,
    lessons,
    knowledge: knowledgeCards,
    cases,
    manifest,
  });
test("all 40 courses, knowledge cards and cases have valid versioned references", () => {
  expect(contentPackSchema.parse(pack()).lessons).toHaveLength(40);
});
test.each([
  "version",
  "range",
  "reference",
  "license",
  "private",
  "duplicate",
  "expected",
])("reject invalid offline content: %s", (kind) => {
  const p = pack();
  if (kind === "version") p.manifest.courses[0].version = 99;
  if (kind === "range") p.lessons[0].targets[0].cell = "XFE1048577";
  if (kind === "reference") p.manifest.cases[0].practice[0].id = "99";
  if (kind === "license") p.license = "unknown";
  if (kind === "private") p.publicDistribution = false;
  if (kind === "duplicate") p.knowledge.push(p.knowledge[0]);
  if (kind === "expected") p.lessons[1].variants[0].expected["missing!A1"] = 1;
  expect(contentPackSchema.safeParse(p).success).toBe(false);
});
