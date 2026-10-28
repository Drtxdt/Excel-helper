import { BACKUP_LIMITS as limits, BackupImportError } from "./backup-limits";
import { lessons } from "./content";
import { cases } from "./cases/catalog";

type ObjectData = Record<string, unknown>;
function object(value: unknown, where: string): ObjectData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BackupImportError(`${where} 应为对象。`);
  return value as ObjectData;
}
function fail(where: string, reason: string): never {
  throw new BackupImportError(`${where}：${reason}`);
}
function coordinate(key: string, size: number, where: string) {
  if (
    !/^(0|[1-9]\d*)$/.test(key) ||
    !Number.isSafeInteger(Number(key)) ||
    Number(key) >= size
  )
    fail(where, `坐标 ${key} 超出声明范围或不是非负整数。`);
}
function dimension(value: unknown, max: number, where: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    fail(where, `必须是 1–${max.toLocaleString("en-US")} 的整数。`);
  return value;
}

/** Validate raw JSON before Zod copies drafts or case evidence traverses cells.
 * Unknown engine fields are retained; validation never trims or rewrites a workbook.
 */
export function validateWorkbook(
  input: unknown,
  required: string[],
  where: string,
): number {
  const book = object(input, where);
  if (typeof book.id !== "string" || !book.id.trim())
    fail(where, "工作簿 ID 为空。");
  const sheets = object(book.sheets, `${where} 工作表`);
  const ids = Object.keys(sheets);
  if (!ids.length || ids.length > limits.sheets)
    fail(where, "每工作簿须有 1–16 张工作表。");
  if (
    !Array.isArray(book.sheetOrder) ||
    book.sheetOrder.length !== ids.length ||
    book.sheetOrder.some(
      (id) => typeof id !== "string" || !Object.hasOwn(sheets, id),
    ) ||
    new Set(book.sheetOrder).size !== ids.length
  )
    fail(where, "工作表顺序必须包含每张表且只包含一次。");
  for (const id of required)
    if (!Object.hasOwn(sheets, id)) fail(where, `缺少任务需要的工作表 ${id}。`);
  const names = new Set<string>();
  let count = 0;
  for (const id of ids) {
    const label = `${where} 工作表 ${id}`;
    const sheet = object(sheets[id], label);
    if (!id.trim() || sheet.id !== id) fail(label, "工作表 ID 与索引不一致。");
    if (
      typeof sheet.name !== "string" ||
      !sheet.name.trim() ||
      names.has(sheet.name.toLowerCase())
    )
      fail(label, "工作表名称为空或重复。");
    names.add(sheet.name.toLowerCase());
    const rows = dimension(sheet.rowCount, limits.rows, `${label} 行数`);
    const columns = dimension(
      sheet.columnCount,
      limits.columns,
      `${label} 列数`,
    );
    const data = object(sheet.cellData, `${label} 单元格数据`);
    for (const [row, value] of Object.entries(data)) {
      coordinate(row, rows, label);
      for (const [column, raw] of Object.entries(
        object(value, `${label} 第 ${row} 行`),
      )) {
        coordinate(column, columns, label);
        if (++count > limits.workbookCells)
          fail(where, "存储单元格超过 10,000 个（包含仅有样式的格子）。");
        const cell = object(raw, `${label} [${row},${column}]`);
        if (
          typeof cell.f === "string" &&
          cell.f.length > limits.formulaCharacters
        )
          fail(`${label} [${row},${column}]`, "公式超过 8,192 字符。");
      }
    }
    for (const [key, size] of [
      ["rowData", rows],
      ["columnData", columns],
    ] as const) {
      if (sheet[key] != null)
        for (const index of Object.keys(object(sheet[key], `${label} ${key}`)))
          coordinate(index, size, label);
    }
    if (sheet.mergeData != null) {
      if (!Array.isArray(sheet.mergeData)) fail(label, "合并区域须为数组。");
      for (const raw of sheet.mergeData) {
        const range = object(raw, `${label} 合并区域`);
        for (const [start, end, size] of [
          ["startRow", "endRow", rows],
          ["startColumn", "endColumn", columns],
        ] as const) {
          const a = range[start],
            b = range[end];
          if (
            typeof a !== "number" ||
            typeof b !== "number" ||
            !Number.isInteger(a) ||
            !Number.isInteger(b) ||
            a < 0 ||
            b < a ||
            b >= size
          )
            fail(label, "合并区域超出声明范围或起止顺序无效。");
        }
      }
    }
  }
  return count;
}

export function validateBackupWorkbooks(input: unknown) {
  const data = object(input, "备份");
  let cells = 0;
  const inspect = (draft: unknown, required: string[], label: string) => {
    if (draft === undefined) return;
    cells += validateWorkbook(draft, required, label);
    if (cells > limits.backupCells)
      fail("整份备份", "存储单元格超过 100,000 个（包含课程和案件）。");
  };
  if (Array.isArray(data.records)) {
    if (data.records.length > 40) fail("备份", "课程记录超过 40 条。");
    for (const raw of data.records) {
      const record = object(raw, "课程记录");
      const lesson = lessons.find((l) => l.id === record.lessonId);
      if (!lesson) fail("课程记录", "未知关卡。");
      inspect(
        record.draft,
        lesson.sheets.map((s) => s.id),
        `关卡 ${lesson.id}`,
      );
    }
  }
  const investigations =
    data.format === "supply-station-case"
      ? [data.progress]
      : data.version === 2 && Array.isArray(data.cases)
        ? data.cases
        : [];
  if (investigations.length) {
    if (investigations.length > 100) fail("备份", "案件记录超过 100 条。");
    for (const raw of investigations) {
      const progress = object(raw, "案件记录");
      const definition = cases.find((c) => c.id === progress.caseId);
      if (!definition) fail("案件记录", "未知案件。");
      if (
        !Array.isArray(progress.stages) ||
        progress.stages.length !== definition.stages.length
      )
        fail(definition.title, "案件步骤数量不匹配。");
      progress.stages.forEach((raw, i) => {
        const stage = object(raw, "案件步骤");
        inspect(
          stage.draft,
          definition.stages[i].sheets.map((s) => s.id),
          `${definition.title} 步骤 ${i + 1}`,
        );
      });
    }
  }
}
