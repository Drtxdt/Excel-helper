import type { CommitResult } from "../workshop/session";
/** Only unavailable engines may fall back to the last loaded/submitted progress.
 * Never turn a rejected active edit into a silently incomplete download.
 */
export function caseExportDecision(result: CommitResult, editing: boolean) {
  if (result.status === "success")
    return { allowed: true, message: "案件备份已导出。" };
  if (result.status === "unavailable" && !editing)
    return {
      allowed: true,
      message: "表格暂时不可用，已导出已有案件进度；备份不包含尚未提交的输入。",
    };
  return {
    allowed: false,
    message: `尚未导出：${result.message} 当前输入保留，请确认或取消输入后再导出。`,
  };
}
