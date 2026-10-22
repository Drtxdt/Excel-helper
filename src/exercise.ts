import type { LessonDefinition, Change } from "./types";
import { cell, makeWorkbook } from "./workbook";
export function exerciseLesson(
  lesson: LessonDefinition,
  index: number,
): LessonDefinition {
  const l = structuredClone(lesson);
  if (index < 0) return l;
  const selected = l.variants[index];
  if (!selected) return l;
  const original = makeWorkbook(lesson);
  const keys = new Map<string, Change>();
  for (const v of lesson.variants)
    for (const change of v.changes)
      keys.set(`${change.sheet}!${change.cell}`, {
        ...change,
        value: cell(original, change.sheet, change.cell).v ?? null,
      });
  const baseline = Object.fromEntries(
    lesson.targets.map((t) => [`${t.sheet}!${t.cell}`, t.expected]),
  );
  l.targets = l.targets.map((t) => ({
    ...t,
    expected: selected.expected[`${t.sheet}!${t.cell}`] ?? t.expected,
  }));
  l.variants = [
    { name: "回到原始数据", changes: [...keys.values()], expected: baseline },
    ...lesson.variants
      .filter((_, i) => i !== index)
      .map((v) => ({
        ...v,
        changes: [...keys.values(), ...v.changes],
        expected: { ...baseline, ...v.expected },
      })),
  ];
  return l;
}
