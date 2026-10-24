# 内容维护与离线审阅

课程仍使用 `src/content/lessons.json`，知识卡位于 `src/content/knowledge.json`，案件位于 `src/cases/` 并在 `catalog.ts` 注册。`manifest.json` 记录课程、案件、练习入口与知识卡的稳定 ID 和版本引用。修改数据语义时递增相应版本并更新引用；不能把旧 ID 改成另一道题。

普通课程沿用 LessonDefinition；同类案件沿用 CaseDefinition。新增同类案件只需内容、目录注册、版本引用和测试，工作台从路由 ID 查找内容。增加新的交互种类才需要扩展组件。

`pnpm check` 中的内容测试使用 Zod 检查全部内容及引用：ID 唯一、版本一致、合法来源与许可、工作表、单元格边界、变式目标和案件练习入口。原有 40 关完整性检查继续保留。公式答案仍由独立固定预期与引擎回归验证，结构校验不能代替计算测试。

## Dot 原创练习离线入口

准备 JSON 内容包：`format: supply-station-content`、`version: 1`、`source`、`author`、`license`、`authorization`、`publicDistribution: true`，以及 `lessons`、`knowledge`、`cases`、`manifest`。许可仅接受 MIT、CC-BY-4.0、CC0-1.0。包内包含所引用内容的确切版本，不联网补全缺失项。可参考仓库 JSON 与 `tests/content-catalog.test.ts` 的组合样例。

执行 `pnpm content:validate <本地内容包.json>`。文件上限 5 MB，输出到被 Git 忽略的 `private/content-review/`；不自动改课程、不发布、不执行内容脚本。

结构通过之后仍需人工核实原创性、作者授权、署名和许可范围，编写答案/反例测试并在浏览器完成任务。`publicDistribution: true` 是提交者的声明，不是授权核验结论。只有完成审阅的原创内容才从私有目录复制到公开内容目录。私人 PDF、译文、聊天记录和学习记录不进入内容包。
