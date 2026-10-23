import type { Change, CellValue, SheetSeed } from "../src/types";
export interface ExcelCase {
  id: string;
  lessonId?: string;
  lessonVersion?: number;
  solution?: number;
  variant?: number;
  input: {
    dateSystem: "1900" | "1904";
    sheets: SheetSeed[];
    formulas: Record<string, string>;
    changes: Change[];
    fills: { sheet: string; range: string; direction: "down" | "right" }[];
  };
  targets: { sheet: string; cell: string; expected?: CellValue }[];
}
export function buildExcelCases(): ExcelCase[];
export function excelInputText(): string;
