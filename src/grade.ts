import { inputIssue, calculationAdvice } from "./input-diagnostics";
import type {
  GradeResult,
  CalculationTask,
  WorkbookSnapshot,
  Diagnostic,
} from "./types";
import { calculate } from "./headless";
import { address, cell, equal, put } from "./workbook";
export async function grade(
  l: CalculationTask,
  input: WorkbookSnapshot,
  revision = 0,
): Promise<GradeResult> {
  const start = performance.now();
  const result: GradeResult = {
    revision,
    status: "passed",
    diagnostics: [],
    scenarios: 0,
    duration: 0,
  };
  try {
    const diagnosed = new Set<string>();
    for (const variant of [null, ...l.variants]) {
      const copy = structuredClone(input);
      if (variant)
        for (const c of variant.changes) put(copy, c.sheet, c.cell, c.value);
      const { book, functions } = await calculate(copy);
      result.scenarios++;
      for (const t of l.targets) {
        const key = `${t.sheet}!${t.cell}`,
          raw = cell(book, t.sheet, t.cell),
          actual = raw.t === 3 ? Boolean(raw.v) : (raw.v ?? null);
        const expected =
          variant && key in variant.expected
            ? variant.expected[key]
            : t.expected;
        const original = cell(input, t.sheet, t.cell);
        const { r, c } = address(t.cell);
        const used = functions[`${t.sheet}:${r}:${c}`] ?? [];
        const missing = (t.functions ?? []).filter((f) => !used.includes(f));
        let message = "";
        let code: Diagnostic["code"] = "result-mismatch";
        const issue =
          t.formula &&
          !original.f &&
          original.t !== 4 &&
          typeof original.v === "string"
            ? inputIssue(original.v)
            : undefined;
        const advice = original.f ? calculationAdvice(raw) : undefined;
        if (issue) {
          if (diagnosed.has(key)) continue;
          diagnosed.add(key);
          code = issue.code;
          message = `${t.cell}：${issue.message}`;
        } else if (advice) {
          if (diagnosed.has(`${key}:${actual}`)) continue;
          diagnosed.add(`${key}:${actual}`);
          code = "formula-error";
          message = `${t.cell} 得到 ${actual}。${advice}`;
        } else if (!equal(actual, expected))
          message = `${t.cell} 当前是 ${actual ?? "空白"}，这份数据应得到 ${expected}。${variant ? "数据改变后，检查引用是否仍指向正确位置。" : ""}`;
        else if (t.formula && !original.f)
          message = `${t.cell} 的结果对了，请用公式让它随数据变化。`;
        else if (missing.length)
          message = `这一关请练习 ${missing.join("、")}，再检查 ${t.cell}。`;
        if (message)
          result.diagnostics.push({
            cell: key,
            code,
            action: "locate",
            expected,
            actual,
            message,
            variant: variant?.name,
          });
      }
    }
    const priority = (d: Diagnostic) =>
      d.code === "missing-equals" || d.code === "syntax"
        ? 0
        : d.code === "formula-error"
          ? 1
          : 2;
    result.diagnostics.sort((a, b) => priority(a) - priority(b));
    result.status = result.diagnostics.length ? "incorrect" : "passed";
  } catch (e) {
    result.status = "error";
    result.diagnostics = [
      {
        cell: "",
        actual: null,
        expected: null,
        message: `计算暂未完成，作答已保留。${e instanceof Error ? e.message : "请重新检查。"}`,
      },
    ];
  }
  result.duration = performance.now() - start;
  return result;
}
