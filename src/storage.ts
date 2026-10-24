import { openDB, type IDBPDatabase } from "idb";
import { z } from "zod";
import { normalizeRecord } from "./learning";
import type { LearningRecord } from "./types";

export const draftSchema = z
  .object({
    id: z.string(),
    sheetOrder: z.array(z.string()),
    sheets: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          name: z.string(),
          cellData: z.record(
            z.string(),
            z.record(
              z.string(),
              z
                .object({
                  v: z
                    .union([z.string(), z.number(), z.boolean(), z.null()])
                    .optional(),
                  f: z.string().optional(),
                  t: z.number().optional(),
                })
                .passthrough(),
            ),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();
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
export const backupSchema = z.object({
  format: z.literal("supply-station"),
  version: z.literal(1),
  exportedAt: z.string(),
  records: z.array(recordSchema).max(40),
});
export function backup(records: LearningRecord[]) {
  return {
    format: "supply-station" as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    records: records.map(normalizeRecord),
  };
}
export function parseBackup(text: string) {
  if (text.length > 20_000_000) throw Error("备份超过 20 MB，请检查文件。");
  const data = backupSchema.parse(JSON.parse(text));
  if (new Set(data.records.map((r) => r.lessonId)).size !== data.records.length)
    throw Error("备份包含重复关卡。");
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
          await settings.put(backup(previous), "before-import");
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
const service = createStorage({
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
