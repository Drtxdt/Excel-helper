import { CellValueType } from "@univerjs/core";
import { ERROR_TYPE_SET, type ErrorType } from "@univerjs/engine-formula";
import type { CellData } from "./types";

/** Teaching diagnostics only. Formula parsing and calculation remain in Univer. */
export interface InputIssue {
  code: "missing-equals" | "syntax";
  message: string;
}
export interface EditorState {
  active: boolean;
  sheet: string;
  cell: string;
  text: string;
  revision: number;
  issue?: InputIssue;
}
export function inputIssue(text: string): InputIssue | undefined {
  if (text.startsWith("'")) return;
  const value = text.trim();
  if (!value.startsWith("=")) {
    if (
      /^[A-Z_][A-Z0-9_.]*\s*\(/i.test(value) ||
      /^\$?[A-Z]{1,3}\$?[1-9]\d*\s*[+*/^&<>=-]/i.test(value) ||
      /^\d+(?:\.\d+)?\s*[*\/^]\s*(?:\d|\$?[A-Z])/i.test(value)
    )
      return {
        code: "missing-equals",
        message: "这段内容会被当作文字。要让它计算，需要在开头加上 =。",
      };
    return;
  }
  let quote = "",
    depth = 0;
  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) {
        if (value[i + 1] === quote) i++;
        else quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (/[（），“”]/.test(ch))
      return {
        code: "syntax",
        message: "公式符号请用英文括号、逗号和双引号；文字内容可以保留中文。",
      };
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0)
      return { code: "syntax", message: "右括号多了一个，检查对应的左括号。" };
  }
  if (quote)
    return {
      code: "syntax",
      message: "引号还没有成对，检查文字或工作表名称的末尾。",
    };
  if (depth)
    return {
      code: "syntax",
      message: "括号还没有配对，写完参数后记得补上右括号。",
    };
}
/** Univer 1.2 marks error-looking string results as FORCE_STRING, not errors.
 * Pass the calculated cell: an input snapshot may still contain stale metadata.
 */
export function calculationAdvice(
  cell: Pick<CellData, "v" | "t"> | null | undefined,
): string | undefined {
  if (
    !cell ||
    cell.t === CellValueType.FORCE_STRING ||
    typeof cell.v !== "string" ||
    !ERROR_TYPE_SET.has(cell.v as ErrorType)
  )
    return;
  const value = cell.v;
  return (
    (
      {
        "#NAME?":
          "有名称未被识别。检查函数拼写，以及文字是否放在英文双引号里。",
        "#VALUE!": "参与计算的值类型不合适。检查引用里是否混入文字或文本数字。",
        "#REF!": "有引用已经无效。检查工作表名称、单元格地址及被删除的区域。",
        "#DIV/0!": "除数是零或空白。检查分母引用的单元格。",
        "#N/A": "没有找到匹配项。检查查找值、匹配范围和未匹配时的处理。",
        "#NUM!": "数值超出了这次计算允许的范围。检查参数和计算范围。",
        "#SPILL!": "结果需要更多单元格。检查结果区域是否被其他内容占用。",
      } as Record<string, string>
    )[value] ?? "计算返回了错误。检查引用和函数参数，再重新计算。"
  );
}
