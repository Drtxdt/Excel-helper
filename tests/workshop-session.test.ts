import { test, expect, vi, afterEach } from "vitest";
import {
  TeachingSession,
  sessionState,
  type SessionAdapter,
} from "../src/workshop/session";
import type { EditorState } from "../src/input-diagnostics";
import { lessons } from "../src/content";
import { makeWorkbook } from "../src/workbook";
import type { GradeResult } from "../src/types";
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup() {
  const state = sessionState(),
    passed = vi.fn(),
    changed = vi.fn(),
    grade = vi.fn();
  const adapters: (SessionAdapter & {
    wait: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  })[] = [];
  const create = vi.fn(
    (_book, onChange, onSelect, _editing?: (editor: EditorState) => void) => {
      const a = {
        wait: vi.fn().mockResolvedValue(undefined),
        snapshot: () => makeWorkbook(lessons[1]),
        dispose: vi.fn(),
        focus: (s: string, c: string) => onSelect(s, c, ""),
        write: () => onChange(),
        fillDown: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        operate: vi.fn(),
        operationState: vi.fn(),
      };
      adapters.push(a);
      return a;
    },
  );
  const session = new TeachingSession(state, {
    create,
    grade,
    passed,
    changed,
    waitTimeout: 50,
    gradeTimeout: 100,
  });
  const open = () => session.prepare(makeWorkbook(lessons[1]), "main", "D2");
  const result = (): GradeResult => ({
    revision: state.revision,
    status: "passed",
    diagnostics: [],
    scenarios: 3,
    duration: 0,
  });
  return {
    session,
    state,
    passed,
    changed,
    grade,
    adapters,
    create,
    open,
    result,
    editing(active = true, text = "=0", index = adapters.length - 1) {
      create.mock.calls[index][3]!({
        active,
        text,
        revision: 1,
        sheet: "main",
        cell: "D2",
      });
    },
  };
}
afterEach(() => vi.useRealTimers());
test("旧工作簿尚未完成的操作不阻塞新关检查", async () => {
  const x = setup();
  await x.open();
  const filling = deferred<void>();
  x.adapters[0].fillDown = () => filling.promise;
  const old = x.session.fill("main", "D2:D4");
  await x.open();
  x.grade.mockResolvedValueOnce(x.result());
  await x.session.check(lessons[1]);
  expect(x.passed).toHaveBeenCalledOnce();
  filling.resolve();
  await old;
  expect(x.state.result?.status).toBe("passed");
  x.session.dispose();
});
test("检查等待正在进行的填充，不能先读到未填完的快照", async () => {
  const x = setup();
  await x.open();
  const filling = deferred<void>();
  x.adapters[0].fillDown = () => filling.promise;
  x.grade.mockImplementation(async (_l, _b, revision) => ({
    ...x.result(),
    revision,
  }));
  void x.session.fill("main", "D2:D4");
  const checking = x.session.check(lessons[6]);
  await Promise.resolve();
  expect(x.grade).not.toHaveBeenCalled();
  x.session.changed();
  filling.resolve();
  await checking;
  expect(x.grade).toHaveBeenCalledOnce();
  expect(x.passed).toHaveBeenCalledOnce();
  x.session.dispose();
});
test("切关后旧适配器的修改通知不增加新关修订号", async () => {
  const x = setup();
  await x.open();
  const old = x.adapters[0];
  await x.open();
  const revision = x.state.revision;
  old.write("main", "D2", "旧输入");
  expect(x.state.revision).toBe(revision);
  expect(x.changed).not.toHaveBeenCalled();
  x.session.dispose();
});
test("先提交编辑，再以提交后的修订号取快照判题", async () => {
  const x = setup();
  await x.open();
  const commit = deferred<boolean>();
  x.adapters[0].commit = vi.fn(() => commit.promise);
  x.grade.mockImplementation(async (_l, _b, revision) => ({
    ...x.result(),
    revision,
  }));
  const checking = x.session.check(lessons[1]);
  expect(x.grade).not.toHaveBeenCalled();
  x.session.changed();
  commit.resolve(true);
  await checking;
  expect(x.grade.mock.calls[0][2]).toBe(x.state.revision);
  expect(x.passed).toHaveBeenCalledOnce();
  x.session.dispose();
});
test("提交被输入提示阻止时不检查；旧工作簿的迟到提交不能检查新表", async () => {
  const x = setup();
  await x.open();
  x.adapters[0].commit = vi.fn().mockResolvedValue(false);
  await x.session.check(lessons[1]);
  expect(x.grade).not.toHaveBeenCalled();
  const pending = deferred<boolean>();
  x.adapters[0].commit = () => pending.promise;
  const checking = x.session.check(lessons[1]);
  await x.open();
  pending.resolve(true);
  await checking;
  expect(x.grade).not.toHaveBeenCalled();
  x.session.dispose();
});
test("等待计算后才取快照并进入判题，完成时才写学习记录", async () => {
  const x = setup();
  await x.open();
  const wait = deferred<void>(),
    grade = deferred<GradeResult>();
  x.adapters[0].wait.mockReturnValueOnce(wait.promise);
  x.grade.mockReturnValueOnce(grade.promise);
  const check = x.session.check(lessons[1]);
  expect(x.state.phase).toBe("waiting");
  expect(x.grade).not.toHaveBeenCalled();
  wait.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(x.state.phase).toBe("grading");
  grade.resolve(x.result());
  await check;
  expect(x.state.phase).toBe("feedback");
  expect(x.passed).toHaveBeenCalledOnce();
  x.session.dispose();
});
for (const phase of ["waiting", "grading"] as const)
  test(`${phase} 时编辑取消旧检查，旧通过结果不能写记录`, async () => {
    const x = setup();
    await x.open();
    const wait = deferred<void>(),
      grade = deferred<GradeResult>();
    if (phase === "waiting")
      x.adapters[0].wait.mockReturnValueOnce(wait.promise);
    x.grade.mockReturnValueOnce(grade.promise);
    const old = x.result(),
      check = x.session.check(lessons[1]);
    if (phase === "grading") {
      await Promise.resolve();
      await Promise.resolve();
    }
    x.session.changed();
    wait.resolve();
    grade.resolve(old);
    await check;
    expect(x.state.phase).toBe("editing");
    expect(x.state.result).toBeUndefined();
    expect(x.passed).not.toHaveBeenCalled();
    x.session.dispose();
  });
test("重置或换数据取消旧检查，旧异常不覆盖新工作簿", async () => {
  const x = setup();
  await x.open();
  const grade = deferred<GradeResult>();
  x.grade.mockReturnValueOnce(grade.promise);
  const check = x.session.check(lessons[1]);
  await Promise.resolve();
  await Promise.resolve();
  const signal = x.grade.mock.calls[0][3] as AbortSignal;
  await x.open();
  expect(signal.aborted).toBe(true);
  grade.reject(Error("旧错误"));
  await check;
  expect(x.adapters[0].dispose).toHaveBeenCalledOnce();
  expect(x.state.phase).toBe("editing");
  expect(x.state.error).toBe("");
  expect(x.passed).not.toHaveBeenCalled();
  x.session.dispose();
});
test("初始化未完成时切关或卸载，迟到的就绪不会激活新页面", async () => {
  const x = setup(),
    wait = deferred<void>();
  x.create.mockImplementationOnce((_b, _c, onSelect) => {
    const a = {
      wait: vi.fn(() => wait.promise),
      snapshot: () => makeWorkbook(lessons[1]),
      dispose: vi.fn(),
      focus: (s: string, c: string) => onSelect(s, c, "旧值"),
      write: vi.fn(),
      fillDown: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      operate: vi.fn(),
      operationState: vi.fn(),
    };
    x.adapters.push(a);
    return a;
  });
  const initial = x.open();
  x.session.dispose();
  wait.resolve();
  await initial;
  expect(x.state.ready).toBe(false);
  expect(x.state.value).toBe("");
  expect(x.adapters[0].dispose).toHaveBeenCalledOnce();
});
for (const phase of ["waiting", "grading"] as const)
  test(`${phase} 超时保留快照，终止任务并允许重新检查`, async () => {
    vi.useFakeTimers();
    const x = setup();
    await x.open();
    const never = deferred<any>();
    if (phase === "waiting")
      x.adapters[0].wait.mockReturnValueOnce(never.promise);
    else x.grade.mockReturnValueOnce(never.promise);
    const check = x.session.check(lessons[1]);
    await vi.advanceTimersByTimeAsync(101);
    await check;
    expect(x.state.phase).toBe("error");
    expect(x.state.ready).toBe(true);
    expect(x.state.error).toContain("作答已保留");
    expect(x.session.snapshot()).toBeDefined();
    if (phase === "grading")
      expect((x.grade.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
    x.grade.mockResolvedValueOnce(x.result());
    await x.session.check(lessons[1]);
    expect(x.state.result?.status).toBe("passed");
    x.session.dispose();
  });
test("不接受错误修订号或 Worker 错误，并可在同一份草稿上重试", async () => {
  const x = setup();
  await x.open();
  x.grade.mockResolvedValueOnce({ ...x.result(), revision: -1 });
  await x.session.check(lessons[1]);
  expect(x.state.phase).toBe("error");
  expect(x.passed).not.toHaveBeenCalled();
  x.grade.mockRejectedValueOnce(Error("worker failed"));
  await x.session.check(lessons[1]);
  expect(x.state.error).toBe("worker failed");
  x.grade.mockResolvedValueOnce(x.result());
  await x.session.check(lessons[1]);
  expect(x.passed).toHaveBeenCalledOnce();
  x.session.changed();
  expect(x.state.result).toBeUndefined();
  x.session.dispose();
});
test("同一次检查禁止重复触发，卸载后消费迟到结果并取消 Worker", async () => {
  const x = setup();
  await x.open();
  const grade = deferred<GradeResult>();
  x.grade.mockReturnValueOnce(grade.promise);
  const first = x.session.check(lessons[1]);
  await Promise.resolve();
  await Promise.resolve();
  await x.session.check(lessons[1]);
  expect(x.grade).toHaveBeenCalledOnce();
  x.session.dispose();
  grade.resolve(x.result());
  await first;
  expect(x.passed).not.toHaveBeenCalled();
  expect((x.grade.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
});

test("写入期间选区通知变化也不能改变本次写入和定位的地址", async () => {
  const x = setup();
  await x.open();
  const a = x.adapters[0];
  a.write = vi.fn(() => {
    x.state.cell = "A1";
    x.state.value = "迟到的旧值";
  });
  a.focus = vi.fn();
  x.session.write("main", "D2", "=B2*C2");
  expect(a.write).toHaveBeenCalledWith("main", "D2", "=B2*C2");
  expect(a.focus).toHaveBeenCalledWith("main", "D2");
  x.session.dispose();
});

test("旧初始化比新初始化更晚结束时，不覆盖新选区或就绪状态", async () => {
  const x = setup(),
    wait = deferred<void>();
  const original = x.create.getMockImplementation()!;
  x.create.mockImplementationOnce((book, changed, selected) => {
    const a = original(book, changed, selected);
    a.wait.mockReturnValueOnce(wait.promise);
    return a;
  });
  const old = x.open();
  await x.session.prepare(makeWorkbook(lessons[1]), "main", "C3");
  wait.reject(Error("旧初始化失败"));
  await old;
  expect(x.state.cell).toBe("C3");
  expect(x.state.phase).toBe("editing");
  expect(x.state.error).toBe("");
  x.session.dispose();
});

test("初始化失败后仍保留原始快照，可以重新创建引擎", async () => {
  const x = setup(),
    book = makeWorkbook(lessons[1]);
  const original = x.create.getMockImplementation()!;
  x.create.mockImplementationOnce((b, c, s) => {
    const a = original(b, c, s);
    a.wait.mockRejectedValueOnce(Error("计算失败"));
    return a;
  });
  await x.session.prepare(book, "main", "D2");
  expect(x.state.phase).toBe("error");
  expect(x.state.ready).toBe(false);
  await x.session.prepare(book, "main", "D2");
  expect(x.state.ready).toBe(true);
  expect(x.create.mock.calls[1][0]).toBe(book);
  expect(x.adapters[0].dispose).toHaveBeenCalledOnce();
  x.session.dispose();
});

test("提交已完成但重算尚未完成时，新输入必须取消旧快照检查", async () => {
  const x = setup();
  await x.open();
  x.editing(true, "=B2*C2");
  x.adapters[0].commit = vi.fn(async () => {
    x.session.changed();
    x.editing(false, "=B2*C2");
    return true;
  });
  const wait = deferred<void>();
  x.adapters[0].wait.mockReturnValueOnce(wait.promise);
  x.grade.mockImplementation(async (_l, _b, revision) => ({
    ...x.result(),
    revision,
  }));
  const checking = x.session.check(lessons[1]);
  await vi.waitFor(() => expect(x.adapters[0].wait).toHaveBeenCalledTimes(2));
  x.editing(true, "=0");
  await checking;
  wait.resolve();
  expect(x.state.editor?.active).toBe(true);
  expect(x.state.phase).toBe("editing");
  expect(x.grade).not.toHaveBeenCalled();
  expect(x.passed).not.toHaveBeenCalled();
  x.session.dispose();
});

test("正常提交的变更和结束事件不取消自己的检查，且只等一次重算", async () => {
  const x = setup();
  await x.open();
  x.editing(true, "=B2*C2");
  x.adapters[0].commit = vi.fn(async () => {
    x.session.changed();
    x.editing(false, "=B2*C2");
    return true;
  });
  x.grade.mockImplementation(async (_l, _b, revision) => ({
    ...x.result(),
    revision,
  }));
  await x.session.check(lessons[1]);
  expect(x.adapters[0].wait).toHaveBeenCalledTimes(2); // initial ready + one check
  expect(x.grade.mock.calls[0][2]).toBe(x.state.revision);
  expect(x.passed).toHaveBeenCalledOnce();
  x.session.dispose();
});

for (const phase of ["actions", "commit"] as const)
  test(`${phase} 等待中连点检查不会建立多个任务，新编辑可以立即取消`, async () => {
    const x = setup();
    await x.open();
    const pending = deferred<any>();
    if (phase === "actions") {
      x.adapters[0].fillDown = () => pending.promise;
      void x.session.fill("main", "D2:D4");
    } else x.adapters[0].commit = vi.fn(() => pending.promise);
    const first = x.session.check(lessons[1]);
    await x.session.check(lessons[1]);
    if (phase === "commit") expect(x.adapters[0].commit).toHaveBeenCalledOnce();
    x.editing();
    await first;
    pending.resolve(true);
    expect(x.grade).not.toHaveBeenCalled();
    expect(x.passed).not.toHaveBeenCalled();
    x.session.dispose();
  });

test("判题期间只有未提交输入变化也会取消旧结果", async () => {
  const x = setup();
  await x.open();
  const pending = deferred<GradeResult>();
  x.grade.mockReturnValue(pending.promise);
  const checking = x.session.check(lessons[1]);
  await vi.waitFor(() => expect(x.grade).toHaveBeenCalledOnce());
  const revision = x.state.revision;
  x.editing();
  pending.resolve(x.result());
  await checking;
  expect(x.state.revision).toBe(revision);
  expect(x.passed).not.toHaveBeenCalled();
  x.session.dispose();
});

test("提交接口区分未就绪、被阻止、失败、成功和关闭取消", async () => {
  const x = setup();
  expect((await x.session.commit()).status).toBe("unavailable");
  await x.open();
  x.adapters[0].commit = vi.fn().mockResolvedValue(false);
  expect((await x.session.commit()).status).toBe("unsubmitted");
  x.adapters[0].commit = vi.fn().mockRejectedValue(Error("无法提交"));
  expect((await x.session.commit()).status).toBe("failed");
  expect(x.state.error).toBe("无法提交");
  x.adapters[0].commit = vi.fn().mockResolvedValue(true);
  expect((await x.session.commit()).status).toBe("success");
  x.session.dispose();
  expect((await x.session.commit()).status).toBe("cancelled");
});

test("输入法未确认的提交失败保留输入，不判题", async () => {
  const x = setup();
  await x.open();
  x.editing(true, "选字中");
  x.adapters[0].commit = vi.fn().mockRejectedValue(Error("输入法还在选字"));
  expect((await x.session.commit()).status).toBe("unsubmitted");
  await x.session.check(lessons[1]);
  expect(x.state.editor?.active).toBe(true);
  expect(x.state.error).toContain("还在选字");
  expect(x.passed).not.toHaveBeenCalled();
  expect(x.state.committing).toBe(false);
  x.session.dispose();
});

test("离开前提交等待期间有新输入时，不允许导航使用旧快照", async () => {
  const x = setup();
  await x.open();
  const wait = deferred<void>();
  x.adapters[0].wait.mockReturnValueOnce(wait.promise);
  const committing = x.session.commit();
  await vi.waitFor(() => expect(x.adapters[0].wait).toHaveBeenCalledTimes(2));
  expect(x.state.committing).toBe(true);
  x.editing();
  wait.resolve();
  expect((await committing).status).toBe("cancelled");
  expect(x.state.committing).toBe(false);
  x.session.dispose();
});

test("切关后迟到的提交不会清除新工作簿的提交状态", async () => {
  const x = setup();
  await x.open();
  const old = deferred<boolean>(),
    current = deferred<boolean>();
  x.adapters[0].commit = () => old.promise;
  const first = x.session.commit();
  await x.open();
  x.adapters[1].commit = () => current.promise;
  const second = x.session.commit();
  old.resolve(true);
  expect((await first).status).toBe("cancelled");
  expect(x.state.committing).toBe(true);
  current.resolve(true);
  expect((await second).status).toBe("success");
  expect(x.state.committing).toBe(false);
  x.session.dispose();
});

test("新输入之后迟到的提交异常不能覆盖当前编辑状态", async () => {
  const x = setup();
  await x.open();
  const pending = deferred<boolean>();
  x.adapters[0].commit = () => pending.promise;
  const committing = x.session.commit();
  x.editing(true, "=0");
  pending.reject(Error("旧提交失败"));
  expect((await committing).status).toBe("cancelled");
  expect(x.state.error).toBe("");
  expect(x.state.editor?.text).toBe("=0");
  x.session.dispose();
});
