export type CellValue = string | number | boolean | null;
export interface SheetSeed {
  id: string;
  name: string;
  rows: CellValue[][];
}
export interface Target {
  sheet: string;
  cell: string;
  expected: CellValue;
  formula?: boolean;
  functions?: string[];
}
export interface Change {
  sheet: string;
  cell: string;
  value: CellValue;
}
export interface Variant {
  name: string;
  changes: Change[];
  expected: Record<string, CellValue>;
}
export interface Solution {
  title: string;
  cells: Record<string, string>;
  explanation: string;
}
export type OperationGoal = { sheet: string; range: string } & (
  | {
      kind: "sort-filter";
      filter: {
        column: number;
        values: string[];
        choices: string[];
        label: string;
      };
      sort: { column: number; ascending: boolean; label: string };
    }
  | {
      kind: "format";
      operator: "lessThan";
      threshold: number;
      background: string;
    }
  | { kind: "validation"; values: string[]; rejectInvalid: boolean }
);
export interface LessonDefinition {
  id: string;
  number: number;
  chapter: number;
  title: string;
  subtitle: string;
  brief: string;
  goal: string;
  version: number;
  prerequisites: string[];
  skills: string[];
  sheets: SheetSeed[];
  targets: Target[];
  variants: Variant[];
  solutions: Solution[];
  hints: string[];
  explanation: string;
  success: string;
  operation?: OperationGoal;
  source: string;
}
export interface Chapter {
  number: number;
  name: string;
  subtitle: string;
  icon: string;
}
export interface CellData {
  v?: CellValue;
  f?: string;
  t?: number;
  s?: unknown;
}
export interface SheetSnapshot {
  id: string;
  name: string;
  cellData: Record<string, Record<string, CellData>>;
  [key: string]: any;
}
export interface WorkbookSnapshot {
  id: string;
  sheets: Record<string, SheetSnapshot>;
  sheetOrder: string[];
  resources?: { name: string; data: string }[];
  [key: string]: any;
}
export interface Diagnostic {
  cell: string;
  expected: CellValue;
  actual: CellValue;
  message: string;
  variant?: string;
}
export interface GradeResult {
  revision: number;
  status: "passed" | "incorrect" | "error";
  diagnostics: Diagnostic[];
  scenarios: number;
  duration: number;
}
export interface LearningRecord {
  lessonId: string;
  lessonVersion: number;
  completed: boolean;
  mastered: boolean;
  hintsViewed: number;
  draft?: WorkbookSnapshot;
  updatedAt: string;
  variant?: number;
}
export interface Preferences {
  motion: boolean;
  lastLesson: string;
}
