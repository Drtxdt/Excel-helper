import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { contentPackSchema } from "../src/content/catalog";
const input = process.argv[2];
if (!input) throw Error("用法：pnpm content:validate <本地内容包.json>");
const text = readFileSync(input, "utf8");
if (text.length > 5_000_000) throw Error("内容包超过 5 MB。");
const pack = contentPackSchema.parse(JSON.parse(text));
const folder = resolve("private/content-review");
mkdirSync(folder, { recursive: true });
const output = resolve(folder, `validated-${Date.now()}.json`);
writeFileSync(output, JSON.stringify(pack, null, 2), { flag: "wx" });
console.log(
  `结构校验通过，已保存到 ${output}。尚未执行公式测试、授权人工复核或发布。`,
);
