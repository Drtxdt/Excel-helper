import { reactive, watch } from "vue";
import {
  readRecords,
  saveRecord,
  restore,
  onStorageConflict,
  StorageConflict,
} from "./storage";
import { normalizeRecord } from "./learning";
import type { LearningRecord } from "./types";
export const state = reactive({
  records: {} as Record<string, LearningRecord>,
  storageError: "",
  storageConflict: false,
  loaded: false,
  motion: true,
});
function reportConflict() {
  state.storageConflict = true;
  state.storageError = new StorageConflict().message;
}
onStorageConflict(reportConflict);
try {
  state.motion = localStorage.getItem("supply-station-motion") !== "off";
} catch {}
watch(
  () => state.motion,
  (value) => {
    try {
      localStorage.setItem("supply-station-motion", value ? "on" : "off");
    } catch {}
  },
);
let loading: Promise<void> | undefined;
let memoryRevision = 0;
export function load(): Promise<void> {
  if (state.loaded) return Promise.resolve();
  return (loading ??= (async () => {
    const revision = memoryRevision;
    try {
      const records = await readRecords();
      if (revision === memoryRevision)
        state.records = Object.fromEntries(records.map((r) => [r.lessonId, r]));
    } catch {
      state.storageError = "浏览器暂时无法保存进度。离开前请导出备份。";
    } finally {
      state.loaded = true;
    }
  })());
}
export async function save(r: LearningRecord) {
  const revision = ++memoryRevision;
  state.records[r.lessonId] = normalizeRecord(r);
  try {
    await saveRecord(r);
    if (revision === memoryRevision && !state.storageConflict)
      state.storageError = "";
  } catch (error) {
    if (error instanceof StorageConflict) reportConflict();
    else if (!state.storageConflict)
      state.storageError =
        "保存未成功，当前作答仍在页面里。请导出备份后再关闭。";
  }
}
export async function importRecords(text: string) {
  const records = await restore(text);
  memoryRevision++;
  state.records = Object.fromEntries(records.map((r) => [r.lessonId, r]));
  state.storageError = "";
  state.loaded = true;
}
export function reloadRecords() {
  window.location.reload();
}
void load();
