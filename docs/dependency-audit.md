# 生产依赖漏洞核验

核验日期：2026-10-28。对应锁文件 SHA-256：`4d07d82b0be62a9e21427c76c88ad6fc53b43c801437be016b186207557f905a`。

环境：Node 24.18.0、pnpm 10.33.0；registry 为 `https://registry.npmjs.org`。

执行 `pnpm audit --prod --json`，退出码 0，报告 172 个生产依赖项，info / low / moderate / high / critical 均为 0，`advisories` 为空，`muted` 为空。没有使用忽略漏洞、忽略 registry 错误或自动修复参数。本次没有漏洞条目需要进一步判断可达路径，也没有为追求审计数字升级 Univer 或变动锁文件。

这项检查查询已知漏洞，不是安全认证。它不覆盖未披露漏洞、业务逻辑、所有引擎资源行为或部署响应头。开发依赖不属于本次 `--prod` 范围。复核时重新运行同一命令；发现条目后记录包版本、公告、生产调用路径、可利用条件和修复方案，再决定升级或限制功能。

已核对本轮输入路径：备份通过有界 UTF-8 读取、JSON 解析、工作簿预检与 schema 校验后才进入存储事务；教学 Markdown 来自内置课程，`TaskPanel.vue` 的渲染设置 `html: false`，本轮没有把导入字符串转成教学 HTML。以上是具体入口核对，不代表所有第三方代码已完成安全审计。

命令范围依据：[pnpm 官方 audit 文档](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/cli/audit.md)。在线报告只反映核验时刻的 registry 结果，未来部署前应重新核验。
