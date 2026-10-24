import { test, expect } from "vitest";
import { case017, caseSchema } from "../src/cases/definition";
import { makeWorkbook, put } from "../src/workbook";
import { grade } from "../src/grade";
import {
  freshCase,
  invalidate,
  verifyEvidence,
  validEvidence,
  conclude,
  sourceError,
} from "../src/cases/model";
import { parseCaseProgress } from "../src/cases/storage";

for (const stage of case017.stages)
  for (const solution of stage.solutions)
    test(`${stage.id} ${solution.title} 原始数据与两组独立变式`, async () => {
      const b = makeWorkbook(stage);
      for (const [key, f] of Object.entries(solution.cells)) {
        const [s, a] = key.split("!");
        put(b, s, a, f);
      }
      const before = JSON.stringify(b);
      expect(sourceError(stage, b, 0)).toBeUndefined();
      const result = await grade(stage, b);
      expect(result.diagnostics).toEqual([]);
      expect(result.scenarios).toBe(3);
      expect(JSON.stringify(b)).toBe(before);
    });
for (const stage of case017.stages)
  test(`${stage.id} 固定结果不能成为证据`, async () => {
    const b = makeWorkbook(stage);
    for (const t of stage.targets)
      put(
        b,
        t.sheet,
        t.cell,
        typeof t.expected === "string" ? `="${t.expected}"` : `=${t.expected}`,
      );
    const r = await grade(stage, b);
    expect(r.status).toBe("incorrect");
    expect(r.diagnostics.some((d) => d.variant)).toBe(true);
  });
test("结案需要两份当前证据及绑定；编辑前一份会使后续结论失效", () => {
  const p = freshCase(case017);
  p.answer = { ...case017.conclusion.correct, evidence: [0, 1] };
  expect(conclude(case017, p)).toContain("没核验");
  expect(verifyEvidence(p, 1, makeWorkbook(case017.stages[1]))).toBe(false);
  expect(verifyEvidence(p, 0, makeWorkbook(case017.stages[0]))).toBe(true);
  verifyEvidence(p, 1, makeWorkbook(case017.stages[1]));
  p.answer.evidence = [];
  expect(conclude(case017, p)).toContain("绑定");
  p.answer.evidence = [0, 1];
  p.answer.destination = "河湾学校";
  expect(conclude(case017, p)).toContain("状态");
  p.answer.destination = "河湾卫生站";
  expect(conclude(case017, p)).toBe("");
  expect(p.completed).toBe(true);
  invalidate(p, 0);
  expect(p.completed).toBe(false);
  expect(validEvidence(p, 1)).toBe(false);
  expect(p.unlocked).toBe(1);
});
test("修改持久化草稿后，旧证据不能在刷新时复活", () => {
  const p = freshCase(case017);
  verifyEvidence(p, 0, makeWorkbook(case017.stages[0]));
  put(p.stages[0].draft!, "dispatch", "D2", "=99");
  const restored = parseCaseProgress(case017, p);
  expect(validEvidence(restored, 0)).toBe(false);
});
test("修改原始单据不能过关，辅助列允许", () => {
  const s = case017.stages[0],
    b = makeWorkbook(s);
  put(b, "dispatch", "F2", "=1");
  expect(sourceError(s, b, 0)).toBeUndefined();
  put(b, "dispatch", "B2", 0);
  expect(sourceError(s, b, 0)?.status).toBe("incorrect");
});
test("案件配置拒绝缺少变式与不存在的工作表", () => {
  const bad = structuredClone(case017);
  bad.stages[0].variants = [];
  expect(caseSchema.safeParse(bad).success).toBe(false);
  bad.stages[0].targets[0].sheet = "missing";
  expect(caseSchema.safeParse(bad).success).toBe(false);
});
