import { computed, onBeforeUnmount, ref, shallowReactive } from "vue";
import { SpreadsheetAdapter } from "../adapter";
import { TeachingSession, sessionState } from "../workshop/session";
import { gradeInWorker } from "../workshop/grade-client";
import { makeWorkbook } from "../workbook";
import { sourceError } from "./model";
import type { CaseStage } from "./definition";
import type { WorkbookSnapshot } from "../types";

export function useCaseSession(
  stage: CaseStage,
  draft: WorkbookSnapshot | undefined,
  changed: (draft: WorkbookSnapshot) => void,
  passed: (draft: WorkbookSnapshot) => void,
) {
  const ui = shallowReactive(sessionState());
  const trace = ref<ReturnType<SpreadsheetAdapter["trace"]>>();
  let host: HTMLElement, adapter: SpreadsheetAdapter | undefined;
  const initial = draft
    ? JSON.parse(JSON.stringify(draft))
    : makeWorkbook(stage);
  const session = new TeachingSession(ui, {
    create(snapshot, onChange, selected) {
      return (adapter = new SpreadsheetAdapter(
        host,
        snapshot,
        onChange,
        selected,
      ));
    },
    grade(task, snapshot, revision, signal) {
      const invalid = sourceError(stage, snapshot, revision);
      return invalid
        ? Promise.resolve(invalid)
        : gradeInWorker(task, snapshot, revision, signal);
    },
    changed() {
      trace.value = undefined;
      const b = session.snapshot();
      if (b) changed(b);
    },
    passed() {
      const b = session.snapshot();
      if (b) passed(b);
    },
  });
  const prepare = () =>
    session.prepare(initial, stage.targets[0].sheet, stage.targets[0].cell);
  async function mount(el: HTMLElement) {
    host = el;
    await prepare();
  }
  function traceSelection() {
    trace.value = adapter?.trace(ui.sheet, ui.cell);
  }
  onBeforeUnmount(() => session.dispose());
  return {
    ui,
    session,
    mount,
    prepare,
    traceSelection,
    trace,
    busy: computed(() => ["waiting", "grading"].includes(ui.phase)),
  };
}
