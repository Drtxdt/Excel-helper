<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import { Download, Upload, Check } from "lucide-vue-next";
import { state, importRecords } from "../state";
import {
  backup,
  exportBackup,
  previousBackup,
  upgradeBackup,
  readCases,
} from "../storage";
import { lessons } from "../content";
import { cases } from "../cases/catalog";
import type { CaseProgress } from "../cases/model";
import { readBackupFile, BackupImportError } from "../backup-limits";
const importing = ref<"" | "reading" | "writing">("");
let reading: AbortController | undefined;
onBeforeUnmount(() => reading?.abort());
const investigations = ref<CaseProgress[]>([]);
async function refreshCases() {
  investigations.value = await readCases();
}
onMounted(() => {
  void refreshCases().catch(() => {
    message.value = "案件记录暂时无法读取，请保留原备份。";
  });
});
async function exportAll() {
  try {
    download(await exportBackup(records.value), "表格补给站-学习备份.json");
  } catch {
    download(
      { ...backup(records.value), version: 1, cases: undefined },
      "表格补给站-课程应急备份.json",
    );
    message.value =
      "完整备份未能读取，已导出当前课程记录。案件请在调查桌单独导出。";
  }
}
async function beforeUpgrade() {
  try {
    const data = await upgradeBackup();
    if (data) download(data, "表格补给站-升级前备份.json");
  } catch {
    message.value = "暂时无法读取升级前备份。";
  }
}
const message = ref(""),
  file = ref<HTMLInputElement>();
const records = computed(() => Object.values(state.records));
const complete = computed(
    () => records.value.filter((r) => r.completed).length,
  ),
  mastered = computed(() => records.value.filter((r) => r.mastered).length);
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f || importing.value) return;
  const controller = new AbortController();
  reading = controller;
  importing.value = "reading";
  message.value = "正在读取备份，可以取消。";
  try {
    const text = await readBackupFile(f, controller.signal);
    if (controller.signal.aborted)
      throw new BackupImportError("已取消读取，原有记录保留。");
    importing.value = "writing";
    message.value = "正在校验并恢复备份，请稍等。";
    await importRecords(text);
    message.value = "备份已恢复。导入前的记录已另存，可用下方按钮下载。";
    try {
      await refreshCases();
    } catch {
      message.value =
        "备份已恢复，但案件列表暂时无法读取。请刷新后查看；导入前副本已保留。";
    }
  } catch (error) {
    message.value =
      error instanceof BackupImportError
        ? `没有导入：${error.message} 原有记录保留。`
        : "没有导入：存储空间或记录版本需要检查，原有记录保留。";
  } finally {
    importing.value = "";
    reading = undefined;
    (e.target as HTMLInputElement).value = "";
  }
}
async function oldBackup() {
  try {
    const data = await previousBackup();
    if (data) download(data, "表格补给站-导入前备份.json");
    else message.value = "还没有导入前备份。";
  } catch {
    message.value = "暂时无法读取备份。";
  }
}
</script>
<template>
  <main class="page-width records-page">
    <p class="eyebrow">每一份做过的表，都留个记录</p>
    <h1>学习记录与备份</h1>
    <div class="records-summary">
      <div>
        <strong>{{ complete }}<small> / 40</small></strong
        ><span>已完成任务</span>
      </div>
      <div>
        <strong>{{ mastered }}</strong
        ><span>独立完成变式</span>
      </div>
      <p>
        完成一次，说明这份表算对了。<br />换一份数据，不看提示再做一次，才更接近真正掌握。
      </p>
    </div>
    <section class="backup-panel">
      <div>
        <h2>进度存在这台电脑里</h2>
        <p>
          清理浏览器数据或更换电脑前，请导出备份。新版备份包含课程和案件；导入会替换这两类记录，并保留导入前副本。旧版课程备份只替换课程。
        </p>
      </div>
      <div class="backup-buttons">
        <button class="button primary" @click="exportAll">
          <Download :size="17" />导出备份</button
        ><button
          class="button subtle"
          :disabled="!!importing"
          @click="file?.click()"
        >
          <Upload :size="17" />导入备份</button
        ><input
          ref="file"
          type="file"
          accept="application/json,.json"
          hidden
          @change="importFile"
        /><button
          v-if="importing === 'reading'"
          class="text-button"
          @click="reading?.abort()"
        >
          取消读取
        </button>
        <button class="text-button" @click="oldBackup">下载导入前备份</button>
        <button class="text-button" @click="beforeUpgrade">
          下载升级前备份
        </button>
      </div>
    </section>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <label class="motion-switch"
      ><input type="checkbox" v-model="state.motion" />启用短动画</label
    >
    <section aria-label="案件记录">
      <h2>案件调查</h2>
      <p v-for="c in cases" :key="c.id">
        <RouterLink :to="'/case/' + c.id">{{ c.title }}</RouterLink> ·
        {{
          investigations.find((p) => p.caseId === c.id)?.completed
            ? "已结案"
            : investigations.some((p) => p.caseId === c.id)
              ? "调查中"
              : "还没开始"
        }}
      </p>
    </section>
    <div class="record-list">
      <RouterLink v-for="l in lessons" :to="'/lesson/' + l.id"
        ><span class="record-id">{{ l.id }}</span
        ><span>{{ l.title }}</span
        ><span
          v-if="state.records[l.id]?.mastered"
          class="record-status mastered"
          ><Check :size="15" />独立完成变式</span
        ><span v-else-if="state.records[l.id]?.completed" class="record-status"
          >已完成</span
        ><span v-else class="muted">{{
          state.records[l.id]?.draft ? "正在练习" : "还没开始"
        }}</span></RouterLink
      >
    </div>
  </main>
</template>
