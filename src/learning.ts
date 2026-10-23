import type { LearningRecord } from "./types";

export function normalizeRecord(record: LearningRecord): LearningRecord {
  return { ...record, completed: record.completed || record.mastered };
}

export function passedRecord(
  record: LearningRecord,
  variant: number,
  usedHelp: boolean,
): LearningRecord {
  return normalizeRecord({
    ...record,
    completed: true,
    mastered: record.mastered || (variant >= 0 && !usedHelp),
  });
}
