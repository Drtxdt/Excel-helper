import type { CellValue, LessonDefinition, WorkbookSnapshot } from "./types";
export function address(a: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(a.replaceAll("$", ""));
  if (!m) throw Error("单元格地址无效");
  return {
    r: Number(m[2]) - 1,
    c: [...m[1]].reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0) - 1,
  };
}
export function cell(book: WorkbookSnapshot, s: string, a: string) {
  const { r, c } = address(a);
  return book.sheets[s]?.cellData[r]?.[c] ?? {};
}
export function put(
  book: WorkbookSnapshot,
  s: string,
  a: string,
  v: CellValue,
) {
  const { r, c } = address(a);
  const rows = book.sheets[s].cellData;
  rows[r] ??= {};
  rows[r][c] =
    typeof v === "string" && v.startsWith("=")
      ? { f: v }
      : {
          v,
          t:
            typeof v === "string"
              ? 1
              : typeof v === "number"
                ? 2
                : typeof v === "boolean"
                  ? 3
                  : undefined,
        };
}
export function makeWorkbook(l: LessonDefinition): WorkbookSnapshot {
  const b: WorkbookSnapshot = {
    id: `lesson-${l.id}`,
    name: l.title,
    appVersion: "1.2.0",
    locale: "zhCN",
    sheetOrder: l.sheets.map((s) => s.id),
    sheets: {},
    styles: {
      header: { bg: { rgb: "#e7efe9" }, cl: { rgb: "#254b3c" }, bl: 1 },
      answer: { bg: { rgb: "#fff3cf" } },
      body: { cl: { rgb: "#253a32" } },
    },
  };
  for (const s of l.sheets) {
    b.sheets[s.id] = {
      id: s.id,
      name: s.name,
      rowCount: 50,
      columnCount: 18,
      defaultColumnWidth: 118,
      defaultRowHeight: 32,
      cellData: {},
      freeze: { startRow: 1, startColumn: -1, xSplit: 0, ySplit: 1 },
    };
    s.rows.forEach((row, r) =>
      row.forEach((v, c) => {
        let n = c + 1,
          a = "";
        while (n) {
          n--;
          a = String.fromCharCode(65 + (n % 26)) + a;
          n = Math.floor(n / 26);
        }
        put(b, s.id, a + (r + 1), v);
        b.sheets[s.id].cellData[r][c].s = r === 0 ? "header" : "body";
      }),
    );
  }
  for (const t of l.targets) {
    const { r, c } = address(t.cell);
    b.sheets[t.sheet].cellData[r] ??= {};
    b.sheets[t.sheet].cellData[r][c] = {
      ...cell(b, t.sheet, t.cell),
      s: "answer",
    };
  }
  return b;
}
export function applySolution(
  l: LessonDefinition,
  b = makeWorkbook(l),
  index = 0,
) {
  for (const [key, v] of Object.entries(l.solutions[index].cells)) {
    const [s, a] = key.split("!");
    put(b, s, a, v);
  }
  return b;
}
export function equal(a: unknown, b: unknown) {
  return typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < 1e-8
    : a === b;
}
