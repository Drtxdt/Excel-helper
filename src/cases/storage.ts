import { service, createStorage } from "../storage";
import { freshCase, type CaseProgress } from "./model";
import { parseCaseProgress } from "./progress-schema";
import type { CaseDefinition } from "./definition";
export { parseCaseProgress } from "./progress-schema";
// The app shares one queue/connection with courses and imports. Isolated names are for tests.
const stores = new Map<string, ReturnType<typeof createStorage>>();
export function createCaseStorage(c: CaseDefinition, name?: string) {
  if (name && !stores.has(name)) stores.set(name, createStorage({ name }));
  const storage = name ? stores.get(name)! : service;
  let known: { revision: number; generation: number } | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  return {
    load: async () => {
      const saved = await storage.readCase(c.id);
      const progress = saved.progress
        ? parseCaseProgress(c, saved.progress)
        : freshCase(c);
      known = { revision: saved.revision, generation: saved.generation };
      return progress;
    },
    save(progress: CaseProgress) {
      const snapshot = parseCaseProgress(
        c,
        JSON.parse(JSON.stringify(progress)),
      );
      if (!known)
        return Promise.reject(Error("案件存档尚未读取，请先导出当前作答。"));
      const saving = storage.saveCase(snapshot, known);
      pending = saving.catch(() => {});
      return saving;
    },
    async close() {
      await pending;
    },
  };
}
