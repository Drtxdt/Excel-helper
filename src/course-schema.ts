import { z } from "zod";
const value = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const a1 = z.string().regex(/^[A-Z]+[1-9]\d*$/);
export const lessonSchema = z.object({
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
  operation: z
    .object({
      kind: z.enum(["sort-filter", "format", "validation"]),
      sheet: z.string(),
      range: z.string(),
    })
    .optional(),
});
