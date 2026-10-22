import fs from "node:fs";
const lessons = JSON.parse(fs.readFileSync("src/content/lessons.json", "utf8"));
const checks = lessons
  .filter((l) => !l.operation)
  .map((l) => ({
    lessonId: l.id,
    topic: l.subtitle,
    excelStatus: "待验证",
    excelVersion: null,
    verifiedAt: null,
    sheets: l.sheets,
    formulas: l.solutions[0].cells,
    expected: l.targets.map((t) => ({
      sheet: t.sheet,
      cell: t.cell,
      value: t.expected,
    })),
    variants: l.variants,
  }));
fs.writeFileSync(
  "docs/excel-compatibility.json",
  JSON.stringify(
    {
      note: "本文件为待执行的真实 Excel 对照样例。引擎测试不等于 Excel 实测。请在 Excel 中按 sheets 写入原始数据，再输入 formulas，核对 expected 和各组 variants。",
      dateSystem: "1900",
      engine: "Univer 1.2.0",
      checks,
    },
    null,
    2,
  ),
);
