import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("@commitlint/cli/package.json");
const cliPackage = JSON.parse(readFileSync(packagePath, "utf8"));
const cli = path.resolve(path.dirname(packagePath), cliPackage.bin.commitlint);
const bootstrap = "33f7c6c9eaf48b1db61866a8c1875bc87de0e524";
const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  : {};
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const head =
  event.pull_request?.head.sha ??
  process.env.GITHUB_SHA ??
  git("rev-parse", "HEAD");
const base =
  event.pull_request?.base.sha ??
  (event.before && !/^0+$/.test(event.before)
    ? event.before
    : process.env.GITHUB_EVENT_PATH
      ? bootstrap
      : git("merge-base", "origin/main", "HEAD"));
for (const sha of [base, head]) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw Error("提交范围必须使用完整 SHA。");
  git("cat-file", "-e", `${sha}^{commit}`);
}
function check(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (event.pull_request) {
  if (typeof event.pull_request.title !== "string")
    throw Error("缺少 PR 标题。");
  check([], event.pull_request.title + "\n");
}
if (base !== head) check(["--from", base, "--to", head, "--verbose"]);
console.log(`提交规范检查通过：${base.slice(0, 7)}..${head.slice(0, 7)}`);
