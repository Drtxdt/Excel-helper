import { z } from "zod";
import { draftSchema } from "../draft-schema";
import {
  invalidate,
  validEvidence,
  conclude,
  type CaseProgress,
} from "./model";
import type { CaseDefinition } from "./definition";
const progressSchema = z.object({
  caseId: z.string(),
  version: z.number().int().positive(),
  active: z.number().int().nonnegative(),
  unlocked: z.number().int().nonnegative(),
  completed: z.boolean(),
  updatedAt: z.string(),
  stages: z.array(
    z.object({
      draft: draftSchema.optional(),
      verified: z.string().optional(),
      hints: z.number().int().min(0).max(4),
    }),
  ),
  answer: z.object({
    destination: z.string(),
    reason: z.string(),
    action: z.string(),
    evidence: z.array(z.number().int().nonnegative()),
  }),
});
export function parseCaseProgress(
  c: CaseDefinition,
  input: unknown,
): CaseProgress {
  const p = progressSchema.parse(input) as CaseProgress;
  if (
    p.caseId !== c.id ||
    p.version !== c.version ||
    p.stages.length !== c.stages.length ||
    p.unlocked >= c.stages.length ||
    p.active > p.unlocked
  )
    throw Error("案件存档版本或步骤不匹配，请保留备份。");
  for (let i = 0; i < p.stages.length; i++)
    if (!validEvidence(p, i)) {
      invalidate(p, i);
      break;
    }
  if (p.completed && conclude(c, p)) p.completed = false;
  return p;
}
