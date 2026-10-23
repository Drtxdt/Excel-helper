import { z } from "zod";
import { bounds } from "./operations";
const value = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const a1 = z.string().regex(/^[A-Z]+[1-9]\d*$/);
const operationBase = {
  sheet: z.string().min(1),
  range: z.string().regex(/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/),
};
export const operationSchema = z
  .discriminatedUnion("kind", [
    z.object({
      ...operationBase,
      kind: z.literal("sort-filter"),
      filter: z.object({
        column: z.number().int().nonnegative(),
        values: z.array(z.string()).min(1),
        choices: z.array(z.string()).min(1),
        label: z.string().min(1),
      }),
      sort: z.object({
        column: z.number().int().nonnegative(),
        ascending: z.boolean(),
        label: z.string().min(1),
      }),
    }),
    z.object({
      ...operationBase,
      kind: z.literal("format"),
      operator: z.literal("lessThan"),
      threshold: z.number(),
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
    z.object({
      ...operationBase,
      kind: z.literal("validation"),
      values: z.array(z.string()).min(1),
      rejectInvalid: z.boolean(),
    }),
  ])
  .superRefine((goal, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    try {
      const area = bounds(goal.range);
      if (area.endRow > 1048575 || area.endColumn > 16383)
        issue("操作范围超出工作表边界。");
      if (goal.kind === "sort-filter") {
        if (area.startRow === area.endRow)
          issue("筛选范围必须包含表头和记录。");
        for (const col of [goal.filter.column, goal.sort.column])
          if (col < area.startColumn || col > area.endColumn)
            issue("筛选或排序列不在操作范围内。");
        if (goal.filter.values.some((v) => !goal.filter.choices.includes(v)))
          issue("筛选目标缺少可选项。");
        if (new Set(goal.filter.values).size !== goal.filter.values.length)
          issue("筛选值不能重复。");
      }
      if (
        goal.kind === "validation" &&
        new Set(goal.values).size !== goal.values.length
      )
        issue("验证列表不能重复。");
    } catch {
      issue("操作范围无效。");
    }
  });
export const lessonSchema = z
  .object({
    id: z.string().regex(/^\d{2}$/),
    number: z.number().int().min(1).max(40),
    chapter: z.number().int().min(1).max(8),
    title: z.string().min(1),
    subtitle: z.string(),
    brief: z.string().min(1),
    goal: z.string().min(1),
    version: z.number().int().positive(),
    prerequisites: z.array(z.string()),
    skills: z.array(z.string()),
    sheets: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          rows: z.array(z.array(value)),
        }),
      )
      .min(1),
    targets: z.array(
      z.object({
        sheet: z.string(),
        cell: a1,
        expected: value,
        formula: z.boolean().optional(),
        functions: z.array(z.string()).optional(),
      }),
    ),
    variants: z.array(
      z.object({
        name: z.string(),
        changes: z.array(z.object({ sheet: z.string(), cell: a1, value })),
        expected: z.record(z.string(), value),
      }),
    ),
    solutions: z
      .array(
        z.object({
          title: z.string(),
          cells: z.record(z.string(), z.string()),
          explanation: z.string(),
        }),
      )
      .min(1),
    hints: z.array(z.string().min(1)).length(4),
    explanation: z.string(),
    success: z.string(),
    source: z.string(),
    operation: operationSchema.optional(),
  })
  .superRefine((lesson, ctx) => {
    if (!lesson.operation) return;
    const sheet = lesson.sheets.find((s) => s.id === lesson.operation!.sheet);
    if (!sheet)
      ctx.addIssue({ code: "custom", message: "操作引用的工作表不存在。" });
  });
