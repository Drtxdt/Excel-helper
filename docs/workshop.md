# 工作台维护与验收

PR 04 将工作台按职责拆分；课程、判题规则和存档格式保持原有边界。新增普通关卡仍修改课程配置，不修改这些组件。

## 模块边界

| 文件 | 职责 |
| --- | --- |
| `views/Workshop.vue` | 按路由选择课程 |
| `components/workshop/WorkshopSession.vue` | 组合任务、表格、帮助、引导与重置入口 |
| `workshop/session.ts` | 管理引擎生命周期、检查阶段、取消和超时；可注入适配器与判题器做竞态测试 |
| `workshop/useTeachingSession.ts` | 连接课程、学习记录、自动保存、变式与提示使用记录 |
| `workshop/grade-client.ts` | 创建独立检查 Worker；完成、错误、取消时释放资源 |
| `components/workshop/SheetPanel.vue` | 表格容器、公式栏、键盘确认、填充与工作表按钮 |
| `TaskPanel.vue` / `GradeFeedback.vue` | 任务与具体检查差异 |
| `HelpDrawer.vue` / `FocusDialog.vue` | 提示、解法、引用追踪与对话框焦点管理 |
| `OperationTools.vue` | 读取操作课配置并发出设置请求 |
| `OperationGuide.vue` | 首次操作引导，可跳过、可重开 |

会话与 Univer 实例不进入 Vue 深层响应式代理。UI 通过浅层响应式状态读取准备、编辑、等待计算、判题、反馈、错误六种阶段。修改表格取消当前检查并清除旧反馈；重置、换数据和卸载取消旧生命周期。计算等待与判题各自有超时，保留当前作答并允许重试。判题继续在独立副本内运行，没有加入答案字符串比对或共享判题工作簿。

## 操作与可访问性

- 正文以 16px 为基准，应用自己的常规说明、按钮和弱化信息至少 14px；没有覆写第三方菜单的全部字号。表格为主体，任务栏可收起，帮助抽屉覆盖在右侧，不继续挤窄网格。
- 平板横屏支持轻点选格、公式栏输入与写入、地址区域加填充按钮、撤销重做和工作表切换。竖屏显示转横屏提示，转回来保留作答。手机工作台不在验收范围。
- 原生 modal dialog 负责背景不可交互，补充 Tab / Shift+Tab 循环、Escape 关闭与焦点返回。引导偏好只保存在本机；即使存储不可用，也能关闭本次引导。
- 表格修改后的反馈会失效；检查阶段使用 live region，错误使用 alert。反馈同时含文字与图标，不只靠颜色。

## 可重复检查

```sh
pnpm check
pnpm exec playwright install chromium webkit
pnpm exec playwright test --project=chromium --project=chromium-tablet --project=webkit-tablet
```

桌面实际测试覆盖 1024×768、1366×768、1920×1080，另有 Chromium / WebKit 的 1024×768 触摸仿真。触摸用例先点 B2，再点 D2，验证实际选区改变；没有用应用内部接口代填答案。选网格时排除 Univer 隐藏的文本编辑器画布。

`tests/workshop-session.test.ts` 用可控 Promise 和计时器覆盖计算等待、判题、编辑取消、重置、切关/卸载、迟到错误、修订号、超时与重试。原有课程、Excel 黄金样例、存档和浏览器回归继续执行。

Linux 截图仍按固定容器、Chromium 与字体运行。此次布局和字号有意变化，需要在 Linux 生成并人工审阅新的 1024、1366、1920 基线；不使用 Windows 截图覆盖，不放宽差异阈值。

## 本地验收记录

2026-10-23，Windows、Node 24、pnpm 10.33.0、Playwright 1.64.1：237 项测试与生产构建通过；20 项浏览器回归通过（桌面 14 项、Chromium 触摸 3 项、WebKit 触摸 3 项）。WebKit 为 Playwright 安装的 Windows WebKit 27.2 / 2370；不等同于 iPad Safari。Linux 的独立结果以 PR 的 quality、e2e、commit-policy 检查与报告为准。

新增回归实际发现并修复了两类问题：WebKit 轻点按钮不会必然转移焦点，抽屉需要记录明确的触发按钮；迟到的表格选区通知不能覆盖地址栏正在输入的填充范围，因此输入草稿与当前选区分开保存。

## 验证边界

自动化触摸仿真不等于真实设备实测。真实 iPad / Android、系统软键盘遮挡、原生中文输入法组合输入及屏幕阅读器人工验收仍待验证。Enter 写入会忽略正在组合输入的键盘事件，但不能据此宣称所有输入法已测过。真实设备验收时依次操作：引导 → 轻点 B2/D2 → 公式栏输入 → 写入 → 提示与返回 → 检查 → 第 7 关填充 → 第 10 关切表 → 刷新恢复，并记录设备、系统、浏览器和失败步骤。

参考：[Playwright 设备仿真](https://playwright.dev/docs/emulation)、[HTML dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)。
