import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, expect, test, vi } from "vitest";
import {
  createStorage,
  backup,
  parseBackup,
  StorageConflict,
} from "../src/storage";
import { passedRecord } from "../src/learning";
import type { LearningRecord } from "../src/types";

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
const services: ReturnType<typeof createStorage>[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
});
function fixture() {
  const name = `test-${crypto.randomUUID()}`;
  const journal = new MemoryStorage();
  const connection = () =>
    openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore("records", { keyPath: "lessonId" });
        db.createObjectStore("settings");
      },
    });
  function client(extra: Parameters<typeof createStorage>[0] = {}) {
    const service = createStorage({ name, journal, ...extra });
    services.push(service);
    return service;
  }
  return { name, journal, connection, client };
}
const record = (lessonId = "01", hintsViewed = 0): LearningRecord => ({
  lessonId,
  lessonVersion: 1,
  completed: false,
  mastered: false,
  hintsViewed,
  updatedAt: "2026-10-23T12:00:00.000Z",
});
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
}

test("保存调用立即捕获快照，连接等待期间的修改不混入请求", async () => {
  const f = fixture(),
    g = gate();
  const service = f.client({
    connect: async () => {
      await g.wait;
      return f.connection();
    },
  });
  const source = record();
  const saving = service.saveRecord(source);
  source.hintsViewed = 4;
  g.release();
  await saving;
  expect((await service.readRecords())[0].hintsViewed).toBe(0);
});

test("连续、跨关卡、同毫秒保存按调用顺序执行，旧写入不清掉新日志", async () => {
  const f = fixture();
  const service = f.client({ session: "writer" });
  await service.readRecords();
  const db = await f.connection();
  // A real transaction is created before the queued writes; no artificial awaits inside it.
  const tx = db.transaction("records", "readwrite");
  const writes = [
    service.saveRecord(record("01", 1)),
    service.saveRecord(record("02", 2)),
    service.saveRecord(record("01", 3)),
  ];
  expect(f.journal.length).toBe(3);
  expect(
    JSON.parse(f.journal.getItem(`${f.name}-pending:writer:01:3`)!).record
      .hintsViewed,
  ).toBe(3);
  await tx.done;
  await Promise.all(writes);
  expect(
    (await service.readRecords()).map((r) => [r.lessonId, r.hintsViewed]),
  ).toEqual([
    ["01", 3],
    ["02", 2],
  ]);
  expect(f.journal.length).toBe(0);
  db.close();
});

test("导入排在已有保存后，原子保留最新备份，并拒绝导入期间的旧请求", async () => {
  const f = fixture(),
    service = f.client();
  await service.readRecords();
  const first = service.saveRecord(record("01", 1));
  const imported = service.restore(JSON.stringify(backup([record("02", 2)])));
  const stale = service.saveRecord(record("01", 4));
  const rejected = expect(stale).rejects.toBeInstanceOf(StorageConflict);
  await first;
  await imported;
  await rejected;
  expect((await service.previousBackup()).records).toEqual([record("01", 1)]);
  expect(await service.readRecords()).toEqual([record("02", 2)]);
  expect(f.journal.length).toBe(0);
});

test("两标签页相同关卡写入做事务内修订检查，旧标签页保留内存作答", async () => {
  const f = fixture(),
    onConflict = vi.fn(),
    a = f.client(),
    b = f.client({ onConflict });
  await Promise.all([a.readRecords(), b.readRecords()]);
  await a.saveRecord(record("01", 1));
  const answer = record("01", 4);
  await expect(b.saveRecord(answer)).rejects.toBeInstanceOf(StorageConflict);
  expect(answer.hintsViewed).toBe(4);
  expect(onConflict).toHaveBeenCalled();
  expect(await a.readRecords()).toEqual([record("01", 1)]);
});

test("另一页导入使旧代次失效，包括从未保存过的关卡", async () => {
  const f = fixture(),
    a = f.client(),
    b = f.client();
  await Promise.all([a.readRecords(), b.readRecords()]);
  await a.restore(JSON.stringify(backup([record("02")])));
  await expect(b.saveRecord(record("03"))).rejects.toBeInstanceOf(
    StorageConflict,
  );
  expect(await a.readRecords()).toEqual([record("02")]);
});

test("外部更新通知不自动刷新记录，明确读取后才采用新版本", async () => {
  const f = fixture(),
    onConflict = vi.fn(),
    a = f.client(),
    b = f.client({ onConflict });
  await Promise.all([a.readRecords(), b.readRecords()]);
  await a.saveRecord(record());
  await expect(b.checkExternal()).rejects.toBeInstanceOf(StorageConflict);
  expect(onConflict).toHaveBeenCalledOnce();
  expect(await b.readRecords()).toEqual([record()]);
  await b.saveRecord(record("01", 2));
});

test("损坏备份和重复关卡不进入写队列、不替换导入前备份", async () => {
  const f = fixture(),
    s = f.client();
  await s.saveRecord(record());
  await expect(s.restore("{broken")).rejects.toThrow();
  await expect(
    s.restore(JSON.stringify(backup([record(), record()]))),
  ).rejects.toThrow();
  expect(await s.readRecords()).toEqual([record()]);
  expect(await s.previousBackup()).toBeUndefined();
});

test("读取旧矛盾状态保留掌握记录并补齐完成状态", async () => {
  const old = { ...record(), mastered: true };
  expect(parseBackup(JSON.stringify(backup([old]))).records[0].completed).toBe(
    true,
  );
  const f = fixture(),
    db = await f.connection();
  await db.put("records", old);
  db.close();
  expect((await f.client().readRecords())[0]).toMatchObject({
    completed: true,
    mastered: true,
  });
});

test("任何通过均完成，只有未用提示的变式新增掌握标记", () => {
  expect(passedRecord(record(), 0, false)).toMatchObject({
    completed: true,
    mastered: true,
  });
  expect(passedRecord(record(), 0, true)).toMatchObject({
    completed: true,
    mastered: false,
  });
  expect(passedRecord(record(), -1, false)).toMatchObject({
    completed: true,
    mastered: false,
  });
  expect(passedRecord({ ...record(), mastered: true }, -1, true).mastered).toBe(
    true,
  );
});

test("刷新恢复按关卡和会话隔离的日志，重复恢复幂等", async () => {
  const f = fixture();
  for (const id of ["01", "02"])
    f.journal.setItem(
      `${f.name}-pending:closed:${id}:${Number(id)}`,
      JSON.stringify({
        session: "closed",
        sequence: Number(id),
        generation: 0,
        baseRevision: 0,
        record: record(id),
      }),
    );
  const s = f.client();
  expect(await s.readRecords()).toEqual([record("01"), record("02")]);
  expect(await s.readRecords()).toEqual([record("01"), record("02")]);
  expect(f.journal.length).toBe(0);
});

test("旧待保存键迁移一次，导入后旧日志不能复活", async () => {
  const f = fixture(),
    s = f.client();
  f.journal.setItem(
    `${f.name}-pending`,
    JSON.stringify({ ...record(), mastered: true }),
  );
  expect((await s.readRecords())[0].completed).toBe(true);
  await s.restore(JSON.stringify(backup([])));
  f.journal.setItem(`${f.name}-pending`, JSON.stringify(record()));
  expect(await s.readRecords()).toEqual([]);
  expect(f.journal.length).toBe(0);
});

test("存储日志不可用时仍保存到 IndexedDB", async () => {
  const f = fixture();
  vi.spyOn(f.journal, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  const s = f.client();
  await s.saveRecord(record());
  expect(await s.readRecords()).toEqual([record()]);
});

test("导入写入失败回滚清空、备份和代次，队列还能继续使用", async () => {
  const f = fixture(),
    s = f.client();
  await s.saveRecord(record("01", 1));
  await s.restore(JSON.stringify(backup([record("01", 2)])));
  const previous = await s.previousBackup();
  const original = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "records" && value.lessonId === "02")
        throw new DOMException("full", "QuotaExceededError");
      return original.call(this, value, key);
    });
  await expect(
    s.restore(JSON.stringify(backup([record("02")]))),
  ).rejects.toThrow("full");
  spy.mockRestore();
  expect(await s.readRecords()).toEqual([record("01", 2)]);
  expect(await s.previousBackup()).toEqual(previous);
  await s.saveRecord(record("01", 3));
  expect(await s.readRecords()).toEqual([record("01", 3)]);
});

test("保存事务失败保留日志，下一次打开可以恢复", async () => {
  const f = fixture(),
    s = f.client();
  await s.readRecords();
  const original = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "records")
        throw new DOMException("full", "QuotaExceededError");
      return original.call(this, value, key);
    });
  await expect(s.saveRecord(record())).rejects.toThrow("full");
  expect(f.journal.length).toBe(1);
  spy.mockRestore();
  expect(await f.client().readRecords()).toEqual([record()]);
  expect(f.journal.length).toBe(0);
});

test("先完成的同毫秒保存不能清掉排队中新快照的日志", async () => {
  const f = fixture();
  const observations: number[] = [];
  const s = f.client({
    session: "writer",
    onCommit: () => {
      const value = f.journal.getItem(`${f.name}-pending:writer:01:2`);
      observations.push(value ? JSON.parse(value).record.hintsViewed : -1);
    },
  });
  await s.readRecords();
  await Promise.all([
    s.saveRecord(record("01", 1)),
    s.saveRecord(record("01", 2)),
  ]);
  expect(observations).toEqual([2, -1]);
});

test("旧会话的冲突日志不覆盖另一标签页的新修订", async () => {
  const f = fixture(),
    a = f.client(),
    b = f.client();
  await Promise.all([a.readRecords(), b.readRecords()]);
  await a.saveRecord(record("01", 1));
  await expect(b.saveRecord(record("01", 4))).rejects.toBeInstanceOf(
    StorageConflict,
  );
  expect(await f.client().readRecords()).toEqual([record("01", 1)]);
});

test("恢复已提交日志不会重复增加修订，连接在服务内复用", async () => {
  const f = fixture(),
    connect = vi.fn(f.connection);
  let savedJournal = "";
  const s = f.client({ connect, session: "writer" });
  await s.readRecords();
  const saving = s.saveRecord(record());
  savedJournal = f.journal.getItem(`${f.name}-pending:writer:01:1`)!;
  await saving;
  f.journal.setItem(`${f.name}-pending:writer:01:1`, savedJournal);
  expect(await s.readRecords()).toEqual([record()]);
  const db = await f.connection();
  expect(
    (await db.get("settings", "revision-state")).stamps["01"].revision,
  ).toBe(1);
  db.close();
  expect(connect).toHaveBeenCalledOnce();
});

test("原生事务中止不会留下半条记录，日志仍可恢复", async () => {
  const f = fixture(),
    s = f.client();
  await s.readRecords();
  const original = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = original.call(this, value, key);
      if (this.name === "records") this.transaction.abort();
      return request;
    });
  await expect(s.saveRecord(record())).rejects.toMatchObject({
    name: "AbortError",
  });
  spy.mockRestore();
  const db = await f.connection();
  expect(await db.getAll("records")).toEqual([]);
  db.close();
  expect(await f.client().readRecords()).toEqual([record()]);
});

test("一条损坏日志不阻止其他关卡恢复，禁用日志存储不阻止数据库读取", async () => {
  const f = fixture();
  f.journal.setItem(`${f.name}-pending:bad`, "{broken");
  f.journal.setItem(
    `${f.name}-pending:closed:01:1`,
    JSON.stringify({
      session: "closed",
      sequence: 1,
      generation: 0,
      baseRevision: 0,
      record: record(),
    }),
  );
  const s = f.client();
  expect(await s.readRecords()).toEqual([record()]);
  vi.spyOn(f.journal, "getItem").mockImplementation(() => {
    throw new DOMException("disabled", "SecurityError");
  });
  expect(await s.readRecords()).toEqual([record()]);
});

test("连接尚未打开时排队的旧保存也不能跨过导入", async () => {
  const f = fixture(),
    g = gate();
  const s = f.client({
    connect: async () => {
      await g.wait;
      return f.connection();
    },
  });
  const importing = s.restore(JSON.stringify(backup([record("02")])));
  const stale = expect(s.saveRecord(record("01"))).rejects.toBeInstanceOf(
    StorageConflict,
  );
  g.release();
  await importing;
  await stale;
  expect(await s.readRecords()).toEqual([record("02")]);
});
