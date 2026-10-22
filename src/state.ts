import { reactive, watch } from "vue";
import { readRecords, saveRecord } from "./storage";
import type { LearningRecord } from "./types";
export const state = reactive({
  records: {} as Record<string, LearningRecord>,
  storageError: "",
  loaded: false,
  motion: true,
});
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
export async function load() {
  try {
    state.records = Object.fromEntries(
      (await readRecords()).map((r) => [r.lessonId, r]),
    );
  } catch {
    state.storageError = "浏览器暂时无法保存进度。离开前请导出备份。";
  } finally {
    state.loaded = true;
  }
}
export async function save(r: LearningRecord) {
  state.records[r.lessonId] = r;
  try {
    await saveRecord(r);
    state.storageError = "";
  } catch {
    state.storageError = "保存未成功，当前作答仍在页面里。请导出备份后再关闭。";
  }
}
void load();
