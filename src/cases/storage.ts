import { openDB } from "idb";
import { z } from "zod";
import { draftSchema } from "../storage";
import {
  freshCase,
  invalidate,
  validEvidence,
  type CaseProgress,
} from "./model";
import type { CaseDefinition } from "./definition";

const progressSchema = z.object({
  caseId: z.string(),
  version: z.number().int().positive(),
  active: z.number().int().nonnegative(),
  unlocked: z.number().int().nonnegative(),
  completed: z.boolean(),
  updatedAt: z.string(),
  stages: z.array(
    z.object({
      draft: draftSchema.optional(),
      verified: z.string().optional(),
      hints: z.number().int().min(0).max(4),
    }),
  ),
  answer: z.object({
    destination: z.string(),
    reason: z.string(),
    action: z.string(),
    evidence: z.array(z.number().int().nonnegative()),
  }),
});
export function parseCaseProgress(
  c: CaseDefinition,
  input: unknown,
): CaseProgress {
  const p = progressSchema.parse(input) as CaseProgress;
  if (
    p.caseId !== c.id ||
    p.version !== c.version ||
    p.stages.length !== c.stages.length ||
    p.unlocked >= c.stages.length ||
    p.active > p.unlocked
  )
    throw Error("案件存档版本或步骤不匹配，请保留备份。");
  for (let i = 0; i < p.stages.length; i++)
    if (!validEvidence(p, i)) {
      invalidate(p, i);
      break;
    }
  return p;
}
// A route remount must read after the previous desk's queued writes in this tab.
const queues = new Map<string, Promise<unknown>>();
/** A separate case store keeps course v1 backups unchanged until the unified v2 migration. */
export function createCaseStorage(
  c: CaseDefinition,
  name = "supply-station-cases",
) {
  let db: ReturnType<typeof openDB> | undefined, known: number | undefined;
  const connect = () =>
    (db ??= openDB(name, 1, {
      upgrade(d) {
        d.createObjectStore("cases");
      },
    }));
  const queue = <T>(fn: () => Promise<T>) => {
    const p = (queues.get(name) ?? Promise.resolve()).then(fn);
    queues.set(
      name,
      p.catch(() => {}),
    );
    return p;
  };
  return {
    load: () =>
      queue(async () => {
        const saved = await (await connect()).get("cases", c.id);
        const progress = saved
          ? parseCaseProgress(c, saved.progress)
          : freshCase(c);
        known = saved?.revision ?? 0;
        return progress;
      }),
    save(progress: CaseProgress) {
      // Capture now, before waiting for earlier transactions. Vue proxies never enter IDB.
      const snapshot = parseCaseProgress(
        c,
        JSON.parse(JSON.stringify(progress)),
      );
      return queue(async () => {
        if (known === undefined)
          throw Error("案件存档尚未读取，请先导出当前作答。");
        const tx = (await connect()).transaction("cases", "readwrite");
        const saved = await tx.store.get(c.id);
        if ((saved?.revision ?? 0) !== known) {
          await tx.done;
          throw Error(
            "另一页面更新了案件。当前作答已保留，请导出后重新载入；不会自动覆盖。",
          );
        }
        await tx.store.put({ revision: known + 1, progress: snapshot }, c.id);
        await tx.done;
        known++;
      });
    },
    async close() {
      await queues.get(name);
      (await db)?.close();
    },
  };
}
