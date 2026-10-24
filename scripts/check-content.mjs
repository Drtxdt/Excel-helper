import fs from "node:fs";
import assert from "node:assert/strict";
const lessons = JSON.parse(fs.readFileSync("src/content/lessons.json", "utf8"));
assert.equal(lessons.length, 40);
assert.equal(new Set(lessons.map((l) => l.id)).size, 40);
for (let chapter = 1; chapter <= 8; chapter++)
  assert.equal(lessons.filter((l) => l.chapter === chapter).length, 5);
for (const l of lessons) {
  for (const key of ["title", "brief", "goal", "explanation", "source"])
    assert.ok(l[key]?.length, `${l.id}: missing ${key}`);
  assert.equal(l.hints.length, 4);
  assert.ok(l.sheets.length);
  assert.ok(l.solutions.length);
  if (l.number > 1 && !l.operation)
    assert.ok(l.variants.length >= 2, `${l.id}: two variants required`);
  for (const p of l.prerequisites) assert.ok(Number(p) < l.number);
  for (const t of l.targets) assert.ok(l.sheets.some((s) => s.id === t.sheet));
  assert.ok(
    !/(在当今数字化时代|激动人心的探索之旅|敬请期待|原型占位|不仅.{0,20}更是)/.test(
      JSON.stringify(l),
    ),
  );
}
const deps = JSON.parse(fs.readFileSync("package.json", "utf8")).dependencies;
const investigation = JSON.parse(fs.readFileSync("src/cases/case-017.json", "utf8"));
assert.equal(investigation.id, "case-017");
assert.ok(investigation.source && investigation.license);
assert.ok(!/(在当今数字化时代|激动人心的探索之旅|敬请期待|原型占位)/.test(JSON.stringify(investigation)));
assert.ok(!Object.keys(deps).some((k) => k.includes("univerjs-pro")));
assert.ok(
  Object.entries(deps)
    .filter(([k]) => k.startsWith("@univerjs/"))
    .every(([, v]) => v === "1.2.0"),
);
console.log(
  "课程检查通过：8 章、40 关、来源、提示、前置关系、变式与开源依赖。",
);
