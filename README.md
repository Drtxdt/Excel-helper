# 表格补给站

面向函数初学者的中文表格练习网站。8 章 40 关，原创订单、库存、对账数据。无账号、无运行时 AI、无服务器计算。

## 运行

需要 Node.js 22+、pnpm 10。首次运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开终端打印的本地地址。正式静态构建和完整检查：

```sh
pnpm check
pnpm preview
```

`dist/` 可部署到普通静态托管，Hash 路由无需重写规则。通过 HTTP(S) 打开，不能直接双击 `index.html`：ES 模块和 Worker 需要同源服务。没有远程字体或学习 API；首次加载需要下载静态资源。IndexedDB 存档按站点域名隔离，迁移地址前从学习记录页导出 JSON。

## 内容与实现

- `src/content/lessons.json`：40 关的数据、任务、提示、变式、预期值、参考解法。`scripts/seed-course.mjs` 是当前内容的编写源，修改后运行 `node scripts/seed-course.mjs`。
- `src/course-schema.ts`：课程结构校验。新增常规课程只需内容与测试，不需改工作台。
- `src/workshop/` 与 `src/components/workshop/`：教学会话、检查取消、表格操作区与任务/帮助组件。维护与平板验收见 [工作台说明](docs/workshop.md)。
- `src/adapter.ts`：Univer 的浏览器边界。实例不进入 Vue 响应式对象；恢复的快照先脱离代理。
- `src/formula.worker.ts`：编辑中的公式计算。
- `src/headless.ts`、`src/grade.ts`、`src/grade.worker.ts`：每次判题都用独立工作簿，逐份变式运行实际引擎，等结果应用后读取。预期值来自课程中独立确定的常量。
- `src/operations.ts`：读取引擎实际筛选行、条件格式规则、验证规则进行判定。没有“点击过就算完成”的标记。
- `src/trace.ts`：直接引用和简单条件汇总的教学解释。复杂条件不猜测中间过程，不影响实际公式判题。
- `src/storage.ts`：IndexedDB、Zod 备份校验、事务导入、导入前副本。
- `docs/copy-policy.md`：文案约束。

`pnpm check` 依次验证课程数量与依赖、运行测试、TypeScript 检查和生产构建。不要把引擎测试通过写成 Excel 兼容性通过；真实 Excel 对照情况见 [对照记录](docs/excel-compatibility.md) 与 `docs/excel-compatibility.json`。

## 维护注意

Univer 包统一锁定 1.2.0，只用 Apache-2.0 开源核心和插件，没有 Pro。升级时先跑公式、判题与存档回归，再做浏览器操作验证。`pnpm-lock.yaml` 固定完整依赖树。

教学要求指定函数时，题目明确说明，判题读取引擎解析出的函数节点；综合关按结果接受等价公式。第一关允许常量算式，后续相关关卡用独立变式识别写死结果。独立变式模式从空答案开始，查看提示后仍可完成，但不新增独立掌握标记。

课程升级提高 lesson.version。旧完成记录保留，版本不符的草稿不直接载入；导入前备份保留恢复入口。浏览器存储失败会提示导出当前内存记录。

本项目不包含私人 PDF、译文、聊天记录和学习存档。公开发布应在体验验收之后进行。

## 案件调查

首案《消失的第 17 箱货物》可从首页进入，独立于 40 关课程。案件机制、存档边界和真实新手试用脚本见 [案件维护说明](docs/case-017.md)。
