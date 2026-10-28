/** Pending native input is not part of the persisted workbook snapshot. */
export function saveStatus(state: {
  saved: string;
  editing: boolean;
  error?: boolean;
  conflict?: boolean;
}): string {
  if (state.conflict) return "存档有更新，当前作答尚未保存";
  if (state.error) return "保存未成功";
  if (state.editing) return "正在输入，确认后保存";
  return state.saved;
}
