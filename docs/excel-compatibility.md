# 真实 Excel 对照记录

2026-10-23 已使用 Windows 桌面 Microsoft Excel 16.0（Build 17932，文件版本 16.0.17932.21056，CalculationVersion 191029）执行实测。使用独立 Excel 进程，每组输入创建一份临时工作簿，写入 `Formula2`，调用 `CalculateFullRebuild` 后读取结果。没有连接用户已打开的工作簿，也没有修改或关闭它们。

## 覆盖与结论

共 121 组输入、340 个结果单元格：

- 全部 37 个公式关卡的原始数据与全部变式，共 109 组；第 2 关的另一种 PRODUCT 解法另有 3 组。
- 9 组边界样例：ROUND 正负数与舍入位数；真空白、空字符串、文本数字；精确查找的重复键、未匹配及数字/文本键；条件统计通配符与转义；错误类型与看起来像错误的普通文本；1900/1904 日期；相对、绝对、混合与跨表引用填充。
- 课程预期答案与 Excel 实测一致。1900 系统下的样例在 Univer 1.2.0 的计算结果与值类型也与 Excel 一致；引用填充比较使用 Excel 的 FillDown/FillRight 与 Univer 自身的引用移动接口。
- 1904 系统的 4 个 Excel 日期值比对应 1900 日期值小 1462。本课程仍使用 1900 系统；此项只记录 Excel 的差异，不表示 Univer 或课程支持 1904 系统。

完整输入、实际公式、结果、值类型、错误类型、每组实测时间和环境保存在 `tests/fixtures/excel-golden.json`。`docs/excel-compatibility.json` 是按关卡汇总的索引。以上是列出的样例与版本的验证结果，不是对所有 Excel 函数、版本或任意公式的兼容承诺。

## CI 怎样复核

`tests/excel-oracle.test.ts` 重新生成当前课程输入并检查 SHA-256，防止课程修改后悄悄沿用旧样例。CI 在独立 Univer 工作簿中计算，将结果与已实测的固定 Excel 值比较；课程题面预期值也单独与 Excel 值比较。CI 不安装或模拟 Microsoft Excel。

快照中的错误值可能表现为字符串。测试使用引擎的 `ISERROR` 与 `ERROR.TYPE` 识别语义类型，明确区分公式错误 `#N/A` 与公式返回的普通文本 `"#N/A"`，不按字符串外观猜错误。

出现差异时先保留 Excel 结果和失败输入，分别排查课程答案、适配层数据类型及引擎行为。不能自动改预期结果来迁就引擎。

## 如何重新实测

需要 Windows、PowerShell 7 和支持本课程函数的已授权桌面 Excel。命令在仓库根目录运行：

```powershell
node scripts/compatibility-fixtures.mjs
pwsh -NoProfile -File scripts/verify-excel.ps1
# 上一步必须成功；先审阅输出，再更新固定证据。
Copy-Item outputs/pr03/excel-capture.json tests/fixtures/excel-golden.json
pnpm exec vitest run tests/excel-oracle.test.ts
pnpm check
```

生成输入不等于完成验证。采集脚本只在全部样例成功后写出结果，失败时不会覆盖已提交证据。重新采集后同步更新汇总 JSON 的版本、时间、输入哈希及计数。输入或计算过程发生变化时重新运行 Excel，不手工修订黄金结果。

脚本创建 COM 实例后先核对进程是否独立，再打开本次工作簿；最终只关闭自己创建的实例。没有可用 Excel、函数不支持或计算超时时应报告失败，不能退回 Univer 生成“Excel 结果”。临时工作簿不落盘，公开证据只含原创课程和测试数据。中文 Excel 的通用数字格式名称来自新单元格，避免硬编码英文 General 导致写入失败。

## 操作课的独立验收

36—38 关不属于公式黄金样例。它们由声明式规则检查实际筛选、整行数据、条件格式和逐格数据验证状态，并有错误范围、错误颜色、冲突规则、遗漏行、字段错位及允许非法输入等反例测试。浏览器回归操作真实 Univer 界面，检查失败后修正、通过、刷新恢复，并验证非法列表值被拒绝。

## 依据与边界

- [Microsoft CalculateFullRebuild](https://learn.microsoft.com/en-us/office/vba/api/excel.application.calculatefullrebuild)：完整重算并重建依赖。
- [Microsoft 日期系统说明](https://support.microsoft.com/en-us/excel/date-systems-in-excel)：1900 与 1904 系统的区别。
- 本次没有实测其他 Excel 发行版本、macOS Excel、Web Excel 或真实平板。后续新增课程函数和边界仍需新增实测证据。
