import { expect, test } from "vitest";
import { saveStatus } from "../src/workshop/save-status";

test("未确认输入不能显示旧快照已保存，取消编辑后恢复真实存档状态", () => {
  expect(saveStatus({ saved: "已保存到本机", editing: true })).toBe(
    "正在输入，确认后保存",
  );
  expect(saveStatus({ saved: "正在保存…", editing: true })).toBe(
    "正在输入，确认后保存",
  );
  expect(saveStatus({ saved: "正在保存…", editing: false })).toBe("正在保存…");
  expect(saveStatus({ saved: "已保存到本机", editing: false })).toBe(
    "已保存到本机",
  );
});
test("保存失败和跨标签冲突优先显示，输入状态不能掩盖故障", () => {
  expect(
    saveStatus({ saved: "已保存到本机", editing: true, error: true }),
  ).toBe("保存未成功");
  expect(
    saveStatus({
      saved: "已保存到本机",
      editing: true,
      error: true,
      conflict: true,
    }),
  ).toContain("存档有更新");
});
