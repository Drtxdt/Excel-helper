import { z } from "zod";
import { lessonSchema } from "../course-schema";
import raw from "./case-017.json";

const stageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  brief: z.string(),
  goal: z.string(),
  sheets: lessonSchema.shape.sheets,
  targets: lessonSchema.shape.targets,
  variants: lessonSchema.shape.variants,
  solutions: lessonSchema.shape.solutions,
  hints: z.array(z.string()).length(4),
  practice: z.string().regex(/^\d{2}$/),
});
export const caseSchema = z
  .object({
    id: z.string().regex(/^case-[0-9]{3}$/),
    version: z.number().int().positive(),
    title: z.string(),
    brief: z.string(),
    source: z.string().min(1),
    license: z.literal("MIT"),
    stages: z.array(stageSchema).min(1),
    clues: z.array(z.string()),
    evidence: z.array(z.string()),
    conclusion: z.object({
      destination: z.array(z.string()),
      reason: z.array(z.string()),
      action: z.array(z.string()),
      correct: z.object({
        destination: z.string(),
        reason: z.string(),
        action: z.string(),
      }),
    }),
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(c.stages.map((s) => s.id)).size !== c.stages.length)
      fail("案件步骤 ID 重复。");
    if (
      c.clues.length !== c.stages.length ||
      c.evidence.length !== c.stages.length
    )
      fail("线索与证据数量不一致。");
    for (const key of ["destination", "reason", "action"] as const)
      if (!c.conclusion[key].includes(c.conclusion.correct[key]))
        fail("结论缺少正确选项。");
    for (const s of c.stages) {
      if (s.variants.length < 2) fail("计算证据需要至少两个变式。");
      const ids = s.sheets.map((x) => x.id);
      if (new Set(ids).size !== ids.length) fail("工作表 ID 重复。");
      for (const t of [...s.targets, ...s.variants.flatMap((v) => v.changes)])
        if (!ids.includes(t.sheet)) fail("引用了不存在的工作表。");
      for (const solution of s.solutions)
        for (const key of Object.keys(solution.cells))
          if (!ids.includes(key.split("!")[0]))
            fail("解法引用了不存在的工作表。");
    }
  });
export type CaseDefinition = z.infer<typeof caseSchema>;
export type CaseStage = CaseDefinition["stages"][number];
export const case017 = caseSchema.parse(raw);
