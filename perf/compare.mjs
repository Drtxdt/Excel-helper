import { readFile, writeFile } from "node:fs/promises";
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath)
  throw Error("用法：node perf/compare.mjs baseline.json current.json");
const before = JSON.parse(await readFile(beforePath)),
  after = JSON.parse(await readFile(afterPath));
for (const key of ["node", "platform", "cpu", "browser", "viewport", "samples"])
  if (before.environment[key] !== after.environment[key])
    throw Error(`测量环境不同：${key}`);
const growth = after.bytes / before.bytes - 1;
const regressions = after.summary.flatMap((a) => {
  const b = before.summary.find((b) => b.key === a.key);
  return b && a.p95 > b.p95 * 1.2
    ? [{ key: a.key, before: b.p95, after: a.p95, increase: a.p95 / b.p95 - 1 }]
    : [];
});
const report = {
  bundle: {
    before: before.bytes,
    after: after.bytes,
    growth,
    budget: 0.1,
    passed: growth <= 0.1,
  },
  regressions,
  targets: after.summary
    .filter((x) => /recalculate|check\/warm/.test(x.key))
    .map((x) => ({
      ...x,
      target: x.key.includes("recalculate") ? 100 : 1000,
      passed: x.p95 <= (x.key.includes("recalculate") ? 100 : 1000),
    })),
  resourcesReleased: after.resources.every(
    (x) => x.workers === 0 && x.canvases === 0,
  ),
};
await writeFile(
  "outputs/pr06/comparison.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (growth > 0.1 || regressions.length || !report.resourcesReleased)
  process.exitCode = 1;
