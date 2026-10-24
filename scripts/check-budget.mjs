import { readdir, stat, readFile } from "node:fs/promises";
const baseline = JSON.parse(
  await readFile(process.argv[2] || "perf/budget.json", "utf8"),
);
let bytes = 0;
for (const file of await readdir("dist/assets"))
  bytes += (await stat(`dist/assets/${file}`)).size;
const limit = Math.floor(baseline.bytes * (1 + baseline.allowedGrowth));
console.log(
  `静态资源 ${bytes} bytes；预算 ${limit} bytes（基线 +${baseline.allowedGrowth * 100}%）。`,
);
if (bytes > limit)
  throw Error("资源体积超过预算，请检查变化并提供对照测量，不要自动抬高基线。");
