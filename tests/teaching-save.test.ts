import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  leave: undefined as undefined | (() => Promise<boolean>),
  changed: undefined as undefined | (() => void),
  cleanup: undefined as undefined | (() => void),
}));
vi.mock("vue-router", () => ({
  onBeforeRouteLeave: (fn: () => Promise<boolean>) => {
    mock.leave = fn;
  },
  onBeforeRouteUpdate: vi.fn(),
}));
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onBeforeUnmount: (fn: () => void) => {
    mock.cleanup = fn;
  },
}));
vi.mock("../src/state", async () => {
  const { reactive } = await import("vue");
  return {
    state: reactive({
      records: {},
      loaded: true,
      storageError: "",
      storageConflict: false,
    }),
    load: vi.fn(),
    save: mock.save,
  };
});
vi.mock("../src/adapter", () => ({
  SpreadsheetAdapter: class {
    constructor(
      _host: unknown,
      private book: unknown,
      changed: () => void,
    ) {
      mock.changed = changed;
    }
    async ready() {}
    async wait() {}
    focus() {}
    snapshot() {
      return this.book;
    }
    dispose() {}
  },
}));
vi.mock("../src/workshop/grade-client", () => ({
  gradeInWorker: vi.fn(),
  disposeGradeWorker: vi.fn(),
}));
import { useTeachingSession } from "../src/workshop/useTeachingSession";
import { lessons } from "../src/content";
import { state } from "../src/state";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  mock.save.mockReset().mockResolvedValue(undefined);
  state.storageError = "";
  state.storageConflict = false;
});
afterEach(() => {
  mock.cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("旧快照保存完成不能覆盖新编辑等待保存的状态", async () => {
  const finished: (() => void)[] = [];
  mock.save.mockImplementation(
    () => new Promise<void>((resolve) => finished.push(resolve)),
  );
  const x = useTeachingSession(lessons[1]);
  await x.mount({} as HTMLElement);
  mock.changed!();
  await vi.advanceTimersByTimeAsync(600);
  expect(finished).toHaveLength(1);
  mock.changed!();
  finished[0]();
  await Promise.resolve();
  expect(x.saved.value).toBe("正在保存…");
  await vi.advanceTimersByTimeAsync(600);
  expect(finished).toHaveLength(2);
  finished[1]();
  await Promise.resolve();
  expect(x.saved.value).toBe("已保存到本机");
});
test("保存失败和外部存档冲突不能被未提交编辑的提示遮住", async () => {
  const x = useTeachingSession(lessons[1]);
  await x.mount({} as HTMLElement);
  x.ui.editor = {
    active: true,
    text: "=0",
    cell: "D2",
    sheet: "main",
    revision: 1,
  };
  expect(x.saved.value).toBe("正在输入，确认后保存");
  state.storageError = "quota";
  expect(x.saved.value).toBe("保存未成功");
  state.storageConflict = true;
  expect(x.saved.value).toContain("存档有更新");
});

test("导航等待保存时继续输入，必须留在当前练习", async () => {
  let finish!: () => void;
  mock.save.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const x = useTeachingSession(lessons[1]);
  await x.mount({} as HTMLElement);
  const leaving = mock.leave!();
  await vi.waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
  x.ui.editor = {
    active: true,
    text: "=0",
    cell: "D2",
    sheet: "main",
    revision: 1,
  };
  finish();
  expect(await leaving).toBe(false);
  expect(x.saved.value).toBe("正在输入，确认后保存");
});
