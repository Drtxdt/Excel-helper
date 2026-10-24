import "fake-indexeddb/auto";
import { test, expect } from "vitest";
import { createCaseStorage } from "../src/cases/storage";
import { case017 } from "../src/cases/definition";
import { openDB } from "idb";
test("案件存档排队保存调用时的快照；重新打开恢复最后一笔", async () => {
  const name = "case-test-" + crypto.randomUUID(),
    s = createCaseStorage(case017, name),
    p = await s.load();
  p.stages[0].hints = 1;
  const first = s.save(p);
  p.stages[0].hints = 2;
  const second = s.save(p);
  p.stages[0].hints = 3;
  await Promise.all([first, second]);
  await s.close();
  const next = createCaseStorage(case017, name);
  expect((await next.load()).stages[0].hints).toBe(2);
  await next.close();
});
test("损坏的案件记录不被新作答静默覆盖", async () => {
  const name = "case-test-" + crypto.randomUUID(),
    store = createCaseStorage(case017, name);
  await store.load();
  await store.close();
  const db = await openDB(name, 1);
  await db.put(
    "cases",
    { revision: 4, progress: { caseId: "broken" } },
    case017.id,
  );
  const next = createCaseStorage(case017, name);
  await expect(next.load()).rejects.toThrow();
  const clean = createCaseStorage(case017, name + "-fresh");
  await expect(next.save(await clean.load())).rejects.toThrow("尚未读取");
  expect((await db.get("cases", case017.id)).revision).toBe(4);
  db.close();
  await next.close();
  await clean.close();
});
test("另一标签页的旧版本不能覆盖案件", async () => {
  const name = "case-test-" + crypto.randomUUID(),
    a = createCaseStorage(case017, name),
    b = createCaseStorage(case017, name);
  const pa = await a.load(),
    pb = await b.load();
  pa.stages[0].hints = 1;
  await a.save(pa);
  await expect(b.save(pb)).rejects.toThrow("另一页面");
  expect(pb.stages[0].hints).toBe(0);
  await a.close();
  await b.close();
});
test("路由返回读取会等待上一个调查桌的排队写入", async () => {
  const name = "case-test-" + crypto.randomUUID(),
    old = createCaseStorage(case017, name),
    p = await old.load();
  p.stages[0].hints = 1;
  const first = old.save(p);
  p.stages[0].hints = 2;
  const second = old.save(p);
  const next = createCaseStorage(case017, name);
  expect((await next.load()).stages[0].hints).toBe(2);
  await Promise.all([first, second]);
  await old.close();
  await next.close();
});
