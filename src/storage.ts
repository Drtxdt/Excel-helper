import { openDB } from "idb";
import { z } from "zod";
import type { LearningRecord } from "./types";
const draftSchema = z
  .object({
    id: z.string(),
    sheetOrder: z.array(z.string()),
    sheets: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          name: z.string(),
          cellData: z.record(
            z.string(),
            z.record(
              z.string(),
              z
                .object({
                  v: z
                    .union([z.string(), z.number(), z.boolean(), z.null()])
                    .optional(),
                  f: z.string().optional(),
                  t: z.number().optional(),
                })
                .passthrough(),
            ),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const recordSchema = z.object({
  lessonId: z.string().regex(/^\d{2}$/),
  lessonVersion: z.number().int().positive(),
  completed: z.boolean(),
  mastered: z.boolean(),
  hintsViewed: z.number().int().min(0).max(4),
  draft: draftSchema.optional(),
  updatedAt: z.string(),
  variant: z.number().int().optional(),
});
export const backupSchema = z.object({
  format: z.literal("supply-station"),
  version: z.literal(1),
  exportedAt: z.string(),
  records: z.array(recordSchema).max(40),
});
const database = () =>
  openDB("supply-station", 1, {
    upgrade(db) {
      db.createObjectStore("records", { keyPath: "lessonId" });
      db.createObjectStore("settings");
    },
  });
export async function readRecords(): Promise<LearningRecord[]> {
  const records: LearningRecord[] = await (await database()).getAll("records");
  try {
    const pending = recordSchema.parse(
      JSON.parse(localStorage.getItem("supply-station-pending") ?? "null"),
    ) as LearningRecord;
    const old = records.find((r) => r.lessonId === pending.lessonId);
    if (!old || pending.updatedAt > old.updatedAt) {
      await saveRecord(pending);
      return [
        ...records.filter((r) => r.lessonId !== pending.lessonId),
        pending,
      ];
    }
  } catch {}
  return records;
}
export async function saveRecord(record: LearningRecord) {
  // A synchronous journal survives a refresh before the IndexedDB transaction completes.
  try {
    localStorage.setItem("supply-station-pending", JSON.stringify(record));
  } catch {}
  await (await database()).put("records", structuredClone(record));
  try {
    const pending = JSON.parse(
      localStorage.getItem("supply-station-pending") ?? "null",
    );
    if (
      pending?.updatedAt === record.updatedAt &&
      pending?.lessonId === record.lessonId
    )
      localStorage.removeItem("supply-station-pending");
  } catch {}
}
export function backup(records: LearningRecord[]) {
  return {
    format: "supply-station" as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    records,
  };
}
export function parseBackup(text: string) {
  if (text.length > 20_000_000) throw Error("备份超过 20 MB，请检查文件。");
  const parsed = backupSchema.parse(JSON.parse(text));
  if (
    new Set(parsed.records.map((r) => r.lessonId)).size !==
    parsed.records.length
  )
    throw Error("备份包含重复关卡。");
  return parsed;
}
export async function restore(text: string) {
  const data = parseBackup(text);
  const db = await database();
  const tx = db.transaction(["records", "settings"], "readwrite");
  const previous = await tx.objectStore("records").getAll();
  await tx.objectStore("settings").put(backup(previous), "before-import");
  await tx.objectStore("records").clear();
  for (const r of data.records) await tx.objectStore("records").put(r);
  await tx.done;
  try {
    localStorage.removeItem("supply-station-pending");
  } catch {}
  return data.records as LearningRecord[];
}
export async function previousBackup() {
  return (await database()).get("settings", "before-import");
}
