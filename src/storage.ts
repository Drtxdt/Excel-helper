import { BACKUP_LIMITS, BackupImportError } from "./backup-limits";
import { validateBackupWorkbooks } from "./backup-validation";
import { openDB, type IDBPDatabase } from "idb";
import { z } from "zod";
import { normalizeRecord } from "./learning";
import type { LearningRecord } from "./types";

import { draftSchema } from "./draft-schema";
export { draftSchema } from "./draft-schema";
import { parseCaseProgress } from "./cases/progress-schema";
import { cases } from "./cases/catalog";
import type { CaseProgress } from "./cases/model";
const recordSchema = z
  .object({
    lessonId: z.string().regex(/^\d{2}$/),
    lessonVersion: z.number().int().positive(),
    completed: z.boolean(),
    mastered: z.boolean(),
    hintsViewed: z.number().int().min(0).max(4),
    draft: draftSchema.optional(),
    updatedAt: z.string(),
    variant: z.number().int().optional(),
  })
  .transform((r) => normalizeRecord(r as LearningRecord));
const legacyBackupSchema = z.object({
  format: z.literal("supply-station"),
  version: z.literal(1),
  exportedAt: z.string(),
  records: z.array(recordSchema).max(40),
});
const caseProgressSchema = z.unknown().transform((input, ctx) => {
  try {
    const id = (input as { caseId?: string })?.caseId;
    const definition = cases.find((c) => c.id === id);
    if (!definition) throw Error("未知案件");
    return parseCaseProgress(definition, input);
  } catch {
    ctx.addIssue({ code: "custom", message: "案件记录无效或版本不匹配。" });
    return z.NEVER;
  }
});
const fullBackupSchema = legacyBackupSchema.extend({
  version: z.literal(2),
  cases: z.array(caseProgressSchema).max(100),
});
export const backupSchema = z.union([legacyBackupSchema, fullBackupSchema]);
export function backup(
  records: LearningRecord[],
  caseRecords: CaseProgress[] = [],
) {
  return {
    format: "supply-station" as const,
    version: 2 as const,
    exportedAt: new Date().toISOString(),
    records: records.map(normalizeRecord),
    cases: caseRecords,
  };
}
export function parseBackup(text: string) {
  if (text.length > BACKUP_LIMITS.characters)
    throw new BackupImportError(
      "备份超过 20,000,000 字符，请保留原文件并拆分备份。",
    );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupImportError(
      "文件不是完整有效的 JSON，请保留原文件并检查内容。",
    );
  }
  validateBackupWorkbooks(raw);
  const version = (raw as { version?: unknown }).version;
  if (version !== 1 && version !== 2)
    throw new BackupImportError("不支持这份备份的版本，请保留原文件。");
  const parsed = (
    version === 1 ? legacyBackupSchema : fullBackupSchema
  ).safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BackupImportError(
      `备份结构无效（${issue.path.join(".") || "格式或版本"}），请检查记录字段与版本。`,
    );
  }
  const data = parsed.data;
  if (new Set(data.records.map((r) => r.lessonId)).size !== data.records.length)
    throw new BackupImportError("备份包含重复关卡。");
  if (
    data.records.some((r) => Number(r.lessonId) < 1 || Number(r.lessonId) > 40)
  )
    throw new BackupImportError("未知关卡。");
  if (
    data.version === 2 &&
    new Set(data.cases.map((c) => c.caseId)).size !== data.cases.length
  )
    throw new BackupImportError("备份包含重复案件。");
  return data;
}

interface Stamp {
  revision: number;
  writer: string;
  sequence: number;
}
interface Metadata {
  generation: number;
  stamps: Record<string, Stamp>;
}
const emptyMetadata = (): Metadata => ({ generation: 0, stamps: {} });
const journalSchema = z.object({
  session: z.string(),
  sequence: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  baseRevision: z.number().int().nonnegative(),
  record: recordSchema,
});
type Journal = z.infer<typeof journalSchema>;
export class StorageConflict extends Error {
  constructor() {
    super(
      "已保存的学习记录有更新。当前作答仍在本页，请先导出备份，再重新载入。",
    );
  }
}
export interface StorageOptions {
  name?: string;
  journal?: Storage;
  session?: string;
  /** Also allows tests to gate connection opening without suspending IDB transactions. */
  connect?: () => Promise<IDBPDatabase>;
  onConflict?: () => void;
  onCommit?: () => void;
  legacyCaseName?: string;
}

export function createStorage(options: StorageOptions = {}) {
  const name = options.name ?? "supply-station";
  const prefix = `${name}-pending:`;
  const legacyKey = `${name}-pending`;
  const session = options.session ?? crypto.randomUUID();
  const journal = options.journal;
  let connection: Promise<IDBPDatabase> | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  let known: Metadata | undefined;
  let sequence = 0;
  let importVersion = 0;
  let conflicted = false;
  const database = () =>
    (connection ??= (
      options.connect?.() ??
      openDB(name, 1, {
        upgrade(db) {
          db.createObjectStore("records", { keyPath: "lessonId" });
          db.createObjectStore("settings");
        },
      })
    ).catch((error) => {
      connection = undefined;
      throw error;
    }));
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work);
    tail = next.catch(() => {});
    return next;
  }
  function conflict(): never {
    conflicted = true;
    options.onConflict?.();
    throw new StorageConflict();
  }
  const keyOf = (entry: Journal) =>
    `${prefix}${entry.session}:${entry.record.lessonId}:${entry.sequence}`;
  function putJournal(entry: Journal) {
    try {
      journal?.setItem(keyOf(entry), JSON.stringify(entry));
    } catch {
      /* IDB is still available. */
    }
  }
  function readLegacyJournal() {
    try {
      return journal?.getItem(legacyKey);
    } catch {
      return null;
    }
  }
  function clearJournal(entry: Journal) {
    try {
      const key = keyOf(entry);
      const current = JSON.parse(journal?.getItem(key) ?? "null");
      if (
        current?.session === entry.session &&
        current?.sequence === entry.sequence
      )
        journal?.removeItem(key);
    } catch {
      /* Never remove a journal we cannot identify. */
    }
  }
  function entries(): Journal[] {
    const result: Journal[] = [];
    try {
      for (let i = 0; i < (journal?.length ?? 0); i++) {
        const key = journal!.key(i);
        if (!key?.startsWith(prefix)) continue;
        try {
          const parsed = journalSchema.safeParse(
            JSON.parse(journal!.getItem(key)!),
          );
          if (parsed.success && keyOf(parsed.data) === key)
            result.push(parsed.data);
        } catch {
          /* Isolate a damaged entry from the other lessons. */
        }
      }
    } catch {
      /* Malformed/unavailable journal must not prevent reading IDB. */
    }
    return result.sort(
      (a, b) => a.session.localeCompare(b.session) || a.sequence - b.sequence,
    );
  }
  async function metadata() {
    return (await database()).get("settings", "revision-state") as Promise<
      Metadata | undefined
    >;
  }
  async function initialize() {
    known ??= (await metadata()) ?? emptyMetadata();
    const db = await database();
    if (await db.get("settings", "cases-migrated")) return;
    const legacy = await openDB(
      options.legacyCaseName ??
        (name === "supply-station"
          ? "supply-station-cases"
          : name + "-legacy-cases"),
      1,
      {
        upgrade(d) {
          d.createObjectStore("cases");
        },
      },
    );
    let raw: unknown[];
    try {
      raw = await legacy.getAll("cases");
    } finally {
      legacy.close();
    }
    // Validate everything before starting the atomic copy. Keep the old DB intact.
    const imported = raw.map((r) =>
      caseProgressSchema.parse((r as { progress: unknown }).progress),
    );
    const tx = db.transaction(["records", "settings"], "readwrite");
    void tx.done.catch(() => {});
    const settings = tx.objectStore("settings");
    if (!(await settings.get("cases-migrated"))) {
      const records = (await tx.objectStore("records").getAll()).map((r) =>
        recordSchema.parse(r),
      );
      await settings.put(backup(records, imported), "before-upgrade");
      for (const progress of imported)
        await settings.put(
          { revision: 1, progress },
          "case:" + progress.caseId,
        );
      await settings.put(true, "cases-migrated");
    }
    await tx.done;
  }
  async function caseRecords(store: {
    getAll(query?: IDBKeyRange): Promise<any[]>;
  }) {
    // Select by key, not by payload shape: a damaged case must not disappear from exports.
    return (await store.getAll(IDBKeyRange.bound("case:", "case:\uffff"))).map(
      (value) => caseProgressSchema.parse(value?.progress),
    );
  }

  async function write(entry: Journal, recovering = false) {
    const db = await database();
    const tx = db.transaction(["records", "settings"], "readwrite");
    void tx.done.catch(() => {});
    try {
      const settings = tx.objectStore("settings");
      const current: Metadata =
        (await settings.get("revision-state")) ?? emptyMetadata();
      const stamp = current.stamps[entry.record.lessonId];
      const revision = stamp?.revision ?? 0;
      const expected = recovering
        ? entry.baseRevision
        : (known?.stamps[entry.record.lessonId]?.revision ?? 0);
      const applied =
        stamp?.writer === entry.session && stamp.sequence >= entry.sequence;
      const canRecover =
        stamp?.writer === entry.session && stamp.sequence < entry.sequence;
      if (applied && current.generation === entry.generation) {
        await tx.done;
        known ??= emptyMetadata();
        known.stamps[entry.record.lessonId] = stamp!;
        clearJournal(entry);
        return;
      }
      if (
        current.generation !== entry.generation ||
        applied ||
        (revision !== expected && !(recovering && canRecover))
      ) {
        await tx.done;
        if (applied || current.generation > entry.generation)
          clearJournal(entry);
        if (recovering) return;
        return conflict();
      }
      current.stamps[entry.record.lessonId] = {
        revision: revision + 1,
        writer: entry.session,
        sequence: entry.sequence,
      };
      await tx.objectStore("records").put(entry.record);
      await settings.put(current, "revision-state");
      await tx.done;
      // Only adopt our own lesson revision: unrelated stale records must not be silently rebased.
      known ??= emptyMetadata();
      known.generation = current.generation;
      known.stamps[entry.record.lessonId] =
        current.stamps[entry.record.lessonId];
      clearJournal(entry);
      options.onCommit?.();
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already completed or aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }

  return {
    readRecords() {
      return enqueue(async () => {
        await initialize();
        // Legacy journals have no revision: only migrate them before the first import,
        // and only when their timestamp is newer than the stored record.
        try {
          const raw = readLegacyJournal();
          if (raw) {
            const record = recordSchema.parse(JSON.parse(raw));
            const old = await (
              await database()
            ).get("records", record.lessonId);
            if (
              known!.generation === 0 &&
              (!old || record.updatedAt > old.updatedAt)
            ) {
              const entry = {
                session,
                sequence: ++sequence,
                generation: 0,
                baseRevision: known!.stamps[record.lessonId]?.revision ?? 0,
                record,
              };
              putJournal(entry);
              await write(entry, true);
            }
            if (journal?.getItem(legacyKey) === raw)
              journal.removeItem(legacyKey);
          }
        } catch (error) {
          if (!(error instanceof SyntaxError || error instanceof z.ZodError))
            throw error;
        }
        for (const entry of entries()) await write(entry, true);
        const db = await database();
        const tx = db.transaction(["records", "settings"], "readonly");
        const records = await tx.objectStore("records").getAll();
        known =
          (await tx.objectStore("settings").get("revision-state")) ??
          emptyMetadata();
        await tx.done;
        conflicted = false;
        return records.map((r) => recordSchema.parse(r));
      });
    },
    async saveRecord(record: LearningRecord) {
      // Parse/clone before any await; JSON also unwraps Vue's reactive record proxies.
      const snapshot = recordSchema.parse(JSON.parse(JSON.stringify(record)));
      const generation = known?.generation;
      const importAtCall = importVersion;
      const entry: Journal = {
        session,
        sequence: ++sequence,
        generation: generation ?? 0,
        baseRevision: known?.stamps[snapshot.lessonId]?.revision ?? 0,
        record: snapshot,
      };
      if (known && !conflicted) putJournal(entry);
      return enqueue(async () => {
        await initialize();
        if (
          conflicted ||
          importAtCall !== importVersion ||
          (generation !== undefined && known!.generation !== generation)
        )
          return conflict();
        if (generation === undefined) {
          entry.generation = known!.generation;
          putJournal(entry);
        }
        await write(entry);
      });
    },
    async restore(text: string) {
      const data = parseBackup(text); // Invalid input never enters the write queue.
      const generation = known?.generation;
      const importAtCall = importVersion;
      return enqueue(async () => {
        await initialize();
        if (
          conflicted ||
          importAtCall !== importVersion ||
          (generation !== undefined && generation !== known!.generation)
        )
          return conflict();
        const db = await database();
        const tx = db.transaction(["records", "settings"], "readwrite");
        void tx.done.catch(() => {});
        try {
          const settings = tx.objectStore("settings");
          const current: Metadata =
            (await settings.get("revision-state")) ?? emptyMetadata();
          if (JSON.stringify(current) !== JSON.stringify(known)) {
            await tx.done;
            return conflict();
          }
          const store = tx.objectStore("records");
          const previous = (await store.getAll()).map((r) =>
            recordSchema.parse(r),
          );
          await settings.put(
            backup(previous, await caseRecords(settings)),
            "before-import",
          );
          // v1 is course-only: preserve cases. v2 is a complete replacement.
          if (data.version === 2) {
            for (const key of await settings.getAllKeys())
              if (typeof key === "string" && key.startsWith("case:"))
                await settings.delete(key);
            for (const progress of data.cases)
              await settings.put(
                { revision: 1, progress },
                "case:" + progress.caseId,
              );
          }
          await store.clear();
          for (const record of data.records) await store.put(record);
          const next = { generation: current.generation + 1, stamps: {} };
          await settings.put(next, "revision-state");
          await tx.done;
          known = next;
          importVersion++;
          for (const entry of entries())
            if (entry.generation < next.generation) clearJournal(entry);
          try {
            journal?.removeItem(legacyKey);
          } catch {}
          options.onCommit?.();
          return data.records;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* Already completed or aborted. */
          }
          await tx.done.catch(() => {});
          throw error;
        }
      });
    },
    readCases() {
      return enqueue(async () => {
        await initialize();
        return caseRecords((await database()).transaction("settings").store);
      });
    },
    readCase(id: string) {
      return enqueue(async () => {
        await initialize();
        const tx = (await database()).transaction("settings");
        const saved = await tx.store.get("case:" + id);
        const meta: Metadata =
          (await tx.store.get("revision-state")) ?? emptyMetadata();
        await tx.done;
        return {
          progress: saved
            ? caseProgressSchema.parse(saved.progress)
            : undefined,
          revision: saved?.revision ?? 0,
          generation: meta.generation,
        };
      });
    },
    saveCase(
      progress: CaseProgress,
      expected: { revision: number; generation: number },
    ) {
      const snapshot = caseProgressSchema.parse(
        JSON.parse(JSON.stringify(progress)),
      );
      return enqueue(async () => {
        await initialize();
        const tx = (await database()).transaction("settings", "readwrite");
        void tx.done.catch(() => {});
        const saved = await tx.store.get("case:" + snapshot.caseId);
        const meta: Metadata =
          (await tx.store.get("revision-state")) ?? emptyMetadata();
        if (
          (saved?.revision ?? 0) !== expected.revision ||
          meta.generation !== expected.generation
        ) {
          await tx.done;
          throw Error(
            "另一页面更新了案件。当前作答已保留，请导出后重新载入；不会自动覆盖。",
          );
        }
        const revision = expected.revision + 1;
        await tx.store.put(
          { revision, progress: snapshot },
          "case:" + snapshot.caseId,
        );
        const key = "case:" + snapshot.caseId;
        meta.stamps[key] = { revision, writer: session, sequence: ++sequence };
        await tx.store.put(meta, "revision-state");
        await tx.done;
        known!.stamps[key] = meta.stamps[key];
        options.onCommit?.();
        Object.assign(expected, { revision, generation: meta.generation });
        return { revision, generation: meta.generation };
      });
    },
    exportBackup(records?: LearningRecord[]) {
      const captured = records && JSON.parse(JSON.stringify(records));
      return enqueue(async () => {
        await initialize();
        const tx = (await database()).transaction(["records", "settings"]);
        const courses =
          captured ??
          (await tx.objectStore("records").getAll()).map((r) =>
            recordSchema.parse(r),
          );
        const investigations = await caseRecords(tx.objectStore("settings"));
        await tx.done;
        return backup(courses, investigations);
      });
    },
    upgradeBackup() {
      return enqueue(async () => {
        await initialize();
        return (await database()).get("settings", "before-upgrade");
      });
    },
    previousBackup() {
      return enqueue(async () =>
        (await database()).get("settings", "before-import"),
      );
    },
    checkExternal() {
      return enqueue(async () => {
        if (!known || conflicted) return;
        const current = (await metadata()) ?? emptyMetadata();
        if (JSON.stringify(current) !== JSON.stringify(known)) conflict();
      });
    },
    async close() {
      await tail;
      (await connection)?.close();
    },
  };
}

let localJournal: Storage | undefined;
try {
  localJournal = globalThis.localStorage;
} catch {}
const conflictListeners = new Set<() => void>();
const signalKey = "supply-station-storage-change";
let channel: BroadcastChannel | undefined;
try {
  if (typeof window !== "undefined") channel = new BroadcastChannel(signalKey);
} catch {
  /* Storage events and focus checks remain available. */
}
export const service = createStorage({
  journal: localJournal,
  onConflict: () => conflictListeners.forEach((listener) => listener()),
  onCommit: () => {
    try {
      channel?.postMessage("changed");
    } catch {}
    try {
      localJournal?.setItem(signalKey, crypto.randomUUID());
    } catch {}
  },
});
export const readRecords = service.readRecords;
export const saveRecord = service.saveRecord;
export const restore = service.restore;
export const previousBackup = service.previousBackup;
export function onStorageConflict(listener: () => void) {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}
if (typeof window !== "undefined") {
  const check = () => {
    void service.checkExternal().catch(() => {});
  };
  if (channel) channel.onmessage = check;
  window.addEventListener("storage", (event) => {
    if (event.key === signalKey) check();
  });
  window.addEventListener("focus", check);
}

export const exportBackup = service.exportBackup;
export const upgradeBackup = service.upgradeBackup;
export const readCases = service.readCases;
