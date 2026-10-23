import { computed, onBeforeUnmount, ref, shallowReactive } from "vue";
import { SpreadsheetAdapter } from "../adapter";
import { state, load, save } from "../state";
import { passedRecord } from "../learning";
import { exerciseLesson } from "../exercise";
import { makeWorkbook, put } from "../workbook";
import { TeachingSession, sessionState } from "./session";
import { gradeInWorker } from "./grade-client";
import type { LessonDefinition, WorkbookSnapshot } from "../types";
export function useTeachingSession(lesson: LessonDefinition) {
  const ui = shallowReactive(sessionState());
  const saved = ref(""),
    variant = ref(-1),
    hintCount = ref(0),
    usedHelp = ref(false),
    solutionOpen = ref(false);
  const traceData = ref<ReturnType<SpreadsheetAdapter["trace"]>>();
  const traceSheet = ref(lesson.sheets[0].id),
    traceCell = ref(lesson.targets[0]?.cell ?? "A2");
  let adapter: SpreadsheetAdapter | undefined,
    host: HTMLElement | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false,
    saveSerial = 0;
  const record = computed(() => state.records[lesson.id]);
  const current = computed(() => exerciseLesson(lesson, variant.value));
  const busy = computed(() => ui.phase === "waiting" || ui.phase === "grading");
  const session = new TeachingSession(ui, {
    create(snapshot, changed, selected) {
      if (!host) throw Error("表格容器尚未准备好。");
      return (adapter = new SpreadsheetAdapter(
        host,
        snapshot,
        changed,
        selected,
      ));
    },
    grade: gradeInWorker,
    changed() {
      traceData.value = undefined;
      saved.value = "正在保存…";
      clearTimeout(timer);
      timer = setTimeout(() => void persist(), 600);
    },
    passed() {
      state.records[lesson.id] = passedRecord(
        {
          lessonId: lesson.id,
          lessonVersion: lesson.version,
          completed: !!record.value?.completed,
          mastered: !!record.value?.mastered,
          hintsViewed: hintCount.value,
          updatedAt: new Date().toISOString(),
        },
        variant.value,
        usedHelp.value,
      );
      void persist();
    },
  });
  async function persist() {
    if (disposed || !ui.ready) return;
    const draft = session.snapshot();
    if (!draft) return;
    const serial = ++saveSerial;
    await save({
      lessonId: lesson.id,
      lessonVersion: lesson.version,
      completed: !!record.value?.completed,
      mastered: !!record.value?.mastered,
      hintsViewed: hintCount.value,
      draft,
      variant: variant.value,
      updatedAt: new Date().toISOString(),
    });
    if (!disposed && serial === saveSerial)
      saved.value = state.storageError ? "保存未成功" : "已保存到本机";
  }
  function fresh() {
    const book = makeWorkbook(lesson);
    if (variant.value >= 0)
      for (const c of lesson.variants[variant.value].changes)
        put(book, c.sheet, c.cell, c.value);
    return book;
  }
  let pendingSnapshot: WorkbookSnapshot | undefined;
  async function prepare(snapshot: WorkbookSnapshot) {
    clearTimeout(timer);
    saveSerial++;
    saved.value = "";
    traceData.value = undefined;
    pendingSnapshot = snapshot;
    await session.prepare(
      snapshot,
      lesson.targets[0]?.sheet ?? lesson.sheets[0].id,
      lesson.targets[0]?.cell ?? "A2",
    );
  }
  async function mount(element: HTMLElement) {
    host = element;
    window.addEventListener("pagehide", flush);
    if (!state.loaded) await load();
    if (disposed) return;
    const r = record.value;
    hintCount.value = r?.hintsViewed ?? 0;
    usedHelp.value = hintCount.value > 0;
    variant.value =
      r &&
      r.variant !== undefined &&
      r.variant >= -1 &&
      r.variant < lesson.variants.length
        ? r.variant
        : -1;
    await prepare(
      r?.lessonVersion === lesson.version && r.draft ? r.draft : fresh(),
    );
    if (r && r.lessonVersion !== lesson.version)
      saved.value = "课程已更新，完成记录保留，本关从新数据开始。";
  }
  function flush() {
    void persist();
  }
  function showHint() {
    hintCount.value = Math.min(4, hintCount.value + 1);
    usedHelp.value = true;
    void persist();
  }
  function showSolution() {
    solutionOpen.value = !solutionOpen.value;
    usedHelp.value = true;
    hintCount.value = 4;
    void persist();
  }
  async function reset() {
    await prepare(fresh());
    await persist();
  }
  async function changeData() {
    if (!lesson.variants.length) return;
    variant.value = (variant.value + 1) % lesson.variants.length;
    hintCount.value = 0;
    usedHelp.value = false;
    solutionOpen.value = false;
    await reset();
  }
  async function returnOriginal() {
    variant.value = -1;
    await reset();
  }
  function trace() {
    if (!ui.ready) return;
    try {
      traceData.value = adapter?.trace(traceSheet.value, traceCell.value);
      session.focus(traceSheet.value, traceCell.value);
    } catch {
      ui.error = "请输入有效的单元格地址，例如 D2。";
    }
  }
  onBeforeUnmount(() => {
    window.removeEventListener("pagehide", flush);
    clearTimeout(timer);
    void persist();
    disposed = true;
    session.dispose();
    adapter = undefined;
  });
  return {
    ui,
    saved,
    variant,
    hintCount,
    usedHelp,
    solutionOpen,
    traceData,
    traceSheet,
    traceCell,
    busy,
    session,
    mount,
    showHint,
    showSolution,
    reset,
    changeData,
    returnOriginal,
    trace,
    check: () => session.check(current.value),
    retry: () => pendingSnapshot && prepare(pendingSnapshot),
  };
}
