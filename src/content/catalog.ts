import { z } from "zod";
import rawKnowledge from "./knowledge.json";
import rawManifest from "./manifest.json";
import { lessonSchema } from "../course-schema";
import { caseSchema } from "../cases/definition";

const reference = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
});
const provenance = {
  source: z.string().min(1),
  license: z.enum(["MIT", "CC-BY-4.0", "CC0-1.0"]),
};
export const knowledgeSchema = reference.extend({
  id: z.string().regex(/^fn-[a-z0-9-]+$/),
  name: z.string().min(1),
  title: z.string().min(1),
  syntax: z.string().min(1),
  example: z.string().min(1),
  note: z.string().min(1),
  ...provenance,
});
export const knowledgeCards = knowledgeSchema.array().parse(rawKnowledge);
export const manifestSchema = z.object({
  version: z.literal(1),
  courses: z.array(
    reference.extend({ ...provenance, knowledge: z.array(reference) }),
  ),
  cases: z.array(reference.extend({ practice: z.array(reference) })),
});
export const manifest = manifestSchema.parse(rawManifest);
export const contentPackSchema = z
  .object({
    format: z.literal("supply-station-content"),
    version: z.literal(1),
    ...provenance,
    author: z.string().min(1),
    authorization: z.string().min(1),
    publicDistribution: z.literal(true),
    lessons: z.array(lessonSchema).max(40),
    knowledge: z.array(knowledgeSchema),
    cases: z.array(caseSchema),
    manifest: manifestSchema,
  })
  .superRefine((pack, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const unique = (items: { id: string }[]) => {
      if (new Set(items.map((x) => x.id)).size !== items.length)
        fail("内容 ID 重复。");
    };
    for (const items of [
      pack.lessons,
      pack.cases,
      pack.knowledge,
      pack.manifest.courses,
      pack.manifest.cases,
    ])
      unique(items);
    const exists = (
      r: { id: string; version: number },
      items: { id: string; version: number }[],
    ) => {
      if (!items.some((x) => x.id === r.id && x.version === r.version))
        fail(`引用不存在或版本不匹配：${r.id}@${r.version}`);
    };
    for (const item of pack.manifest.courses) {
      exists(item, pack.lessons);
      item.knowledge.forEach((r) => exists(r, pack.knowledge));
    }
    for (const item of pack.manifest.cases) {
      exists(item, pack.cases);
      item.practice.forEach((r) => exists(r, pack.lessons));
      const c = pack.cases.find((c) => c.id === item.id);
      if (
        c?.stages.some((s) => !item.practice.some((r) => r.id === s.practice))
      )
        fail("案件练习入口缺少版本引用。");
    }
    pack.lessons.forEach((l) => {
      exists(l, pack.manifest.courses);
      for (const id of l.prerequisites)
        if (!pack.lessons.some((x) => x.id === id))
          fail(`前置课程不存在：${id}`);
    });
    pack.cases.forEach((c) => exists(c, pack.manifest.cases));
    for (const task of [
      ...pack.lessons,
      ...pack.cases.flatMap((c) => c.stages),
    ]) {
      unique(task.sheets);
      const validAddress = (key: string) => {
        const [sheet, address, extra] = key.split("!");
        const match = /^([A-Z]+)([1-9]\d*)$/.exec(address ?? "");
        const col =
          match?.[1]
            .split("")
            .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) ?? 0;
        if (
          extra ||
          !task.sheets.some((s) => s.id === sheet) ||
          !match ||
          Number(match[2]) > 1048576 ||
          col > 16384
        )
          fail(`工作表或单元格无效：${key}`);
      };
      task.targets.forEach((t) => validAddress(`${t.sheet}!${t.cell}`));
      task.solutions.forEach((s) => Object.keys(s.cells).forEach(validAddress));
      task.variants.forEach((v) => {
        v.changes.forEach((c) => validAddress(`${c.sheet}!${c.cell}`));
        Object.keys(v.expected).forEach((key) => {
          validAddress(key);
          if (!task.targets.some((t) => `${t.sheet}!${t.cell}` === key))
            fail(`变式预期没有对应目标：${key}`);
        });
      });
    }
  });
