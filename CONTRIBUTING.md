# 开发与提交

使用 Node 24、pnpm 10.33.0。首次运行 `pnpm install --frozen-lockfile`。

## 一个 PR 解决一件事

从最新 main 创建功能分支，完成并检查后提交 PR。不要直接推送 main、自动合并或重写已有历史。当前六阶段按顺序交付；前一个 PR 由所有者合并后，再从最新 main 开始下一项。

使用 Conventional Commits，英文类型与范围，中文说明。例如 `fix(storage): 防止旧草稿覆盖导入后的记录`。标题不超过 72 字符，不写 WIP、表情或句号结尾。修复与对应测试同一提交；每次提交应可独立验证。正文解释原因与验证结果，PR 标题遵循同一格式。

可用类型：feat、fix、refactor、perf、test、ci、build、docs、style、chore、revert。不要夹带无关格式化，不提交私人 PDF、译文、聊天记录、学习存档、凭据、构建产物或测试输出。

## 本地检查

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm check:commits
```

`pnpm check` 保留课程校验、Vitest、类型检查与生产构建。E2E 通过 HTTP 启动该生产构建；测试前需要先构建。浏览器用例通过实际界面作答，不调用应用内部接口注入答案。每个用例使用独立上下文，备份只用测试生成的数据。

`check:commits` 在本地检查 origin/main 到 HEAD 的新增提交；在 PR 中检查 base..head 及 PR 标题，在 main 推送中检查本次新增范围。首版 33f7c6c 不追溯修改。GitHub PR 流程不能依赖可跳过的本地 hook。

## CI 与截图

三个必需检查为 quality、e2e、commit-policy。CI 使用 Ubuntu 24.04、Playwright 1.64.1（容器按 digest 固定）、Chromium 1248，中文字体固定为 fonts-noto-cjk 1:20230817+repack1-3。`quality` 执行 pnpm check；`e2e` 测试生产构建并比较 1366×768 与 1920×1080 截图；`commit-policy` 检查提交信息。重试仍不允许将 flaky 测试算作通过。

Linux 截图保存在 e2e/__screenshots__/，只接受 CI Linux 环境生成并人工查看的基线，不用 Windows 截图替换。首次缺失基线时，Playwright 会生成候选图并让用例失败；从该运行的 screenshot-candidates artifact 下载候选图，检查后提交，再等待正常比较通过。更新已有基线时，可在独立 PR 中删除需要更新的特定基线，沿用这一流程；不能在正常 CI 中添加 --update-snapshots，也不能放宽断言掩盖回归。

失败时查看 playwright-report 和 trace；输出作为短期 artifact 保留 7 天，不提交 test-results 或用户备份。截图掩盖必须有明确理由，不遮住判题反馈或关键表格内容。

首次三个检查成功后再绑定 main 分支保护：要求 PR、必需检查、最新基线和解决讨论；批准人数 0，管理员同样受约束，禁止强推和删除。检查通过不代表自动合并，仍由仓库所有者验收。

## 分阶段验证记录

PR 01 建立门禁，PR 02 修复存档与学习状态一致性。PR 03 强化操作判题并建立真实 Excel 固定结果对照。新增公式或改动课程数据时，按 [Excel 对照记录](docs/excel-compatibility.md) 重新采集受影响的证据；CI 不能代替桌面 Excel 实测。
