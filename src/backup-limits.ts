/** Product import limits, not guarantees about spreadsheet engine performance. */
export const BACKUP_LIMITS = {
  characters: 20_000_000,
  bytes: 60_000_000,
  sheets: 16,
  rows: 2_000,
  columns: 128,
  workbookCells: 10_000,
  backupCells: 100_000,
  formulaCharacters: 8_192,
} as const;
export class BackupImportError extends Error {}

/** Read bounded slices so neither a large file nor cancellation needs a full allocation. */
export async function readBackupFile(
  file: Blob,
  signal?: AbortSignal,
): Promise<string> {
  if (file.size > BACKUP_LIMITS.bytes)
    throw new BackupImportError(
      "文件超过 60,000,000 字节，未读取；请保留原文件并拆分备份。",
    );
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let length = 0;
  const checkAbort = () => {
    if (signal?.aborted)
      throw new BackupImportError("已取消读取，原有记录保留。");
  };
  const append = (part: string) => {
    length += part.length;
    if (length > BACKUP_LIMITS.characters)
      throw new BackupImportError(
        "备份超过 20,000,000 字符，未导入；请保留原文件并拆分备份。",
      );
    parts.push(part);
  };
  try {
    checkAbort();
    for (let offset = 0; offset < file.size; offset += 65_536) {
      checkAbort();
      const buffer = await file.slice(offset, offset + 65_536).arrayBuffer();
      checkAbort();
      append(decoder.decode(buffer, { stream: true }));
    }
    append(decoder.decode());
    checkAbort();
    return parts.join("");
  } catch (error) {
    if (error instanceof BackupImportError) throw error;
    throw new BackupImportError(
      "文件无法按 UTF-8 读取，请检查文件是否完整，并保留原文件。",
    );
  }
}
