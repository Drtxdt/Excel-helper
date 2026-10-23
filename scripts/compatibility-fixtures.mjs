import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function buildExcelCases() {
  const lessons = JSON.parse(
    fs.readFileSync(path.join(root, "src/content/lessons.json"), "utf8"),
  );
  const cases = [];
  for (const lesson of lessons.filter((l) => !l.operation)) {
    for (let solution = 0; solution < lesson.solutions.length; solution++) {
      for (let variant = -1; variant < lesson.variants.length; variant++) {
        cases.push({
          id: `lesson-${lesson.id}-solution-${solution}-variant-${variant + 1}`,
          lessonId: lesson.id,
          lessonVersion: lesson.version,
          solution,
          variant,
          input: {
            dateSystem: "1900",
            sheets: lesson.sheets,
            formulas: lesson.solutions[solution].cells,
            changes: variant < 0 ? [] : lesson.variants[variant].changes,
            fills: [],
          },
          targets: lesson.targets.map((t) => ({
            sheet: t.sheet,
            cell: t.cell,
            expected:
              variant < 0 ||
              !Object.hasOwn(
                lesson.variants[variant].expected,
                `${t.sheet}!${t.cell}`,
              )
                ? t.expected
                : lesson.variants[variant].expected[`${t.sheet}!${t.cell}`],
          })),
        });
      }
    }
  }
  const edge = (
    id,
    rows,
    formulas,
    { sheets, fills = [], dateSystem = "1900" } = {},
  ) =>
    cases.push({
      id: `edge-${id}`,
      input: {
        dateSystem,
        sheets: sheets ?? [{ id: "main", name: "边界", rows }],
        formulas,
        changes: [],
        fills,
      },
      targets: Object.keys(formulas).map((key) => {
        const [sheet, cell] = key.split("!");
        return { sheet, cell };
      }),
    });
  edge(
    "round",
    [
      ["输入", "两位", "整数"],
      [1.005],
      [2.675],
      [-1.005],
      [-2.675],
      [0],
      [15.5],
    ],
    {
      "main!B2": "=ROUND(A2,2)",
      "main!B3": "=ROUND(A3,2)",
      "main!B4": "=ROUND(A4,2)",
      "main!B5": "=ROUND(A5,2)",
      "main!B6": "=ROUND(A6,2)",
      "main!B7": "=ROUND(A7,-1)",
      "main!C2": "=ROUND(2.5,0)",
      "main!C3": "=ROUND(-2.5,0)",
    },
  );
  edge("blank-text", [["值", "检查"], [null], ['=""'], ["12"], [12], [" "]], {
    "main!B2": "=ISBLANK(A2)",
    "main!B3": "=ISBLANK(A3)",
    "main!B4": "=ISNUMBER(A4)",
    "main!B5": "=ISNUMBER(A5)",
    "main!C2": "=COUNT(A2:A6)",
    "main!C3": "=COUNTA(A2:A6)",
    "main!C4": "=SUM(A2:A6)",
    "main!C5": "=AVERAGE(A2:A6)",
    "main!D2": "=VALUE(A4)",
    "main!D3": '=IF(A2="","空","非空")',
    "main!D4": '=IF(A3="","空","非空")',
    "main!D5": '=IFERROR(VALUE("坏数据"),"核对")',
    "main!D6": '=TRIM("  甲  乙  ")',
    "main!E2": "=COUNTBLANK(A2:A6)",
    "main!E3": '=COUNTIF(A2:A6,"")',
  });
  edge(
    "lookup",
    [
      ["货号", "金额"],
      ["A", 10],
      ["B", 20],
      ["A", 30],
      ["12", 40],
      [12, 50],
    ],
    {
      "main!D2": '=XLOOKUP("A",A2:A6,B2:B6,"缺失",0)',
      "main!D3": '=XLOOKUP("A",A2:A6,B2:B6,"缺失",0,-1)',
      "main!D4": '=XLOOKUP("Z",A2:A6,B2:B6,"缺失",0)',
      "main!D5": '=XLOOKUP("Z",A2:A6,B2:B6)',
      "main!E2": '=VLOOKUP("A",A2:B6,2,FALSE)',
      "main!E3": '=VLOOKUP("Z",A2:B6,2,FALSE)',
      "main!E4": '=XLOOKUP("12",A2:A6,B2:B6,"缺失",0)',
      "main!E5": '=XLOOKUP(12,A2:A6,B2:B6,"缺失",0)',
      "main!F2": '=COUNTIF(A2:A6,"A")',
      "main!F3": '=SUMIF(A2:A6,"A",B2:B6)',
    },
  );
  edge(
    "wildcards",
    [
      ["物资", "数量", "状态"],
      ["胶带", 1, "有效"],
      ["胶带大", 2, "有效"],
      ["胶*带", 3, "撤回"],
      ["胶?带", 4, "有效"],
      ["胶~带", 5, "有效"],
    ],
    {
      "main!E2": '=COUNTIF(A2:A6,"胶*")',
      "main!E3": '=COUNTIF(A2:A6,"胶?带")',
      "main!E4": '=COUNTIF(A2:A6,"胶~*带")',
      "main!E5": '=COUNTIF(A2:A6,"胶~?带")',
      "main!E6": '=COUNTIF(A2:A6,"胶~~带")',
      "main!F2": '=SUMIF(A2:A6,"胶*",B2:B6)',
      "main!F3": '=SUMIFS(B2:B6,A2:A6,"胶*",C2:C6,"有效")',
      "main!F4": '=COUNTIFS(A2:A6,"胶*",C2:C6,"有效")',
      "main!F5": '=SUMIFS(B2:B6,B2:B6,">=2",B2:B6,"<=4")',
    },
  );
  edge("errors", [["错误值"]], {
    "main!A2": "=1/0",
    "main!A3": '=VALUE("abc")',
    "main!A4": "=NA()",
    "main!A5": "=SQRT(-1)",
    "main!A6": "=#REF!",
    "main!A8": '="#N/A"',
    "main!A9": '="#DIV/0!"',
    "main!B2": '=IFERROR(A2,"核对")',
  });
  const dates = {
    "main!A2": "=DATE(2024,1,1)",
    "main!A3": "=DATE(2024,2,29)",
    "main!A4": "=DATE(2024,13,1)",
    "main!A5": "=DATE(1904,1,1)",
  };
  edge("dates-1900", [["日期序号"]], dates);
  edge("dates-1904", [["日期序号"]], dates, { dateSystem: "1904" });
  edge(
    "reference-fill",
    [],
    {
      "main!D2": "=B2*C2",
      "main!E2": "=B2*$G$2",
      "main!F2": "='价格 表'!$B$2*B2",
    },
    {
      sheets: [
        {
          id: "main",
          name: "填充",
          rows: [
            ["货号", "数量", "单价", "相对", "绝对", "跨表", "费率"],
            ["A", 3, 15, null, null, null, 0.1],
            ["B", 4, 8],
            ["C", 6, 3],
          ],
        },
        {
          id: "price",
          name: "价格 表",
          rows: [
            ["物资", "价格"],
            ["箱", 12],
          ],
        },
      ],
      fills: [
        { sheet: "main", range: "D2:D4", direction: "down" },
        { sheet: "main", range: "E2:E4", direction: "down" },
        { sheet: "main", range: "F2:F4", direction: "down" },
      ],
    },
  );
  edge(
    "mixed-fill",
    [[null, 10, 20], [2], [3]],
    { "main!B2": "=$A2*B$1" },
    {
      fills: [
        { sheet: "main", range: "B2:C2", direction: "right" },
        { sheet: "main", range: "B2:C3", direction: "down" },
      ],
    },
  );
  return cases;
}
export function excelInputText() {
  return (
    JSON.stringify({ format: 1, cases: buildExcelCases() }, null, 2) + "\n"
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv[2] ?? "outputs/pr03/excel-input.json";
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, excelInputText());
  console.log(
    `已生成 ${buildExcelCases().length} 组 Excel 输入，尚未执行计算：${output}`,
  );
}
