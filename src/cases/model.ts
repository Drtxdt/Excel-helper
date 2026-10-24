import type { WorkbookSnapshot, GradeResult } from "../types";
import type { CaseDefinition, CaseStage } from "./definition";
import { makeWorkbook, equal } from "../workbook";

export interface CaseProgress {
  caseId: string;
  version: number;
  active: number;
  unlocked: number;
  stages: { draft?: WorkbookSnapshot; verified?: string; hints: number }[];
  answer: {
    destination: string;
    reason: string;
    action: string;
    evidence: number[];
  };
  completed: boolean;
  updatedAt: string;
}
export const freshCase = (c: CaseDefinition): CaseProgress => ({
  caseId: c.id,
  version: c.version,
  active: 0,
  unlocked: 0,
  stages: c.stages.map(() => ({ hints: 0 })),
  answer: { destination: "", reason: "", action: "", evidence: [] },
  completed: false,
  updatedAt: new Date().toISOString(),
});
// Ignore calculated caches and presentation; all entered formulas/values contribute.
export function fingerprint(b: WorkbookSnapshot) {
  return JSON.stringify(
    Object.keys(b.sheets)
      .sort()
      .map((id) => [
        id,
        b.sheets[id].name,
        Object.keys(b.sheets[id].cellData)
          .sort()
          .flatMap((r) =>
            Object.keys(b.sheets[id].cellData[r])
              .sort()
              .flatMap((col) => {
                const c = b.sheets[id].cellData[r][col];
                return c.f || c.v != null
                  ? [[r, col, c.f ? ["f", c.f] : ["v", c.v]]]
                  : [];
              }),
          ),
      ]),
  );
}
export function validEvidence(p: CaseProgress, i: number) {
  const s = p.stages[i];
  return !!s?.draft && !!s.verified && s.verified === fingerprint(s.draft);
}
export function invalidate(p: CaseProgress, i: number) {
  for (let n = i; n < p.stages.length; n++) p.stages[n].verified = undefined;
  p.answer.evidence = p.answer.evidence.filter((n) => n < i);
  p.completed = false;
}
export function verifyEvidence(
  p: CaseProgress,
  i: number,
  draft: WorkbookSnapshot,
) {
  if (i > 0 && !p.stages.slice(0, i).every((_, n) => validEvidence(p, n)))
    return false;
  p.stages[i].draft = structuredClone(draft);
  p.stages[i].verified = fingerprint(draft);
  p.unlocked = Math.max(p.unlocked, Math.min(i + 1, p.stages.length - 1));
  return true;
}
export function conclude(c: CaseDefinition, p: CaseProgress): string {
  if (!p.stages.every((_, i) => validEvidence(p, i)))
    return "计算证据还没核验完整，先检查两份工作簿。";
  if (!p.stages.every((_, i) => p.answer.evidence.includes(i)))
    return "请把两条已核验的证据绑定到交接结论。";
  for (const k of ["destination", "reason", "action"] as const)
    if (p.answer[k] !== c.conclusion.correct[k])
      return {
        destination: "去向与有效签收记录不一致。学校那条是什么状态？",
        reason: "原因与两份表的差额不一致。临时调拨有没有进入常规汇总？",
        action: "处理建议还没解决账目缺口。货物已有有效签收，需要补发吗？",
      }[k];
  p.completed = true;
  return "";
}
/** Source records are evidence. Auxiliary columns are allowed; changing original documents is not. */
export function sourceError(
  stage: CaseStage,
  b: WorkbookSnapshot,
  revision: number,
): GradeResult | undefined {
  const original = makeWorkbook(stage);
  for (const [sid, s] of Object.entries(original.sheets)) {
    if (b.sheets[sid]?.name !== s.name)
      return failure(`${s.name} 工作表名称改变了，请恢复原始单据。`);
    for (const [r, row] of Object.entries(s.cellData))
      for (const [col, v] of Object.entries(row)) {
        if (v.v == null && !v.f) continue;
        const actual = b.sheets[sid]?.cellData[r]?.[col];
        if (!actual || actual.f !== v.f || !equal(actual.v, v.v))
          return failure(
            `${s.name} 第 ${Number(r) + 1} 行的原始记录改变了。请撤销修改，在黄色格或辅助列计算。`,
          );
      }
  }
  function failure(message: string): GradeResult {
    return {
      revision,
      status: "incorrect",
      diagnostics: [
        { cell: "原始单据", actual: null, expected: null, message },
      ],
      scenarios: 0,
      duration: 0,
    };
  }
}
