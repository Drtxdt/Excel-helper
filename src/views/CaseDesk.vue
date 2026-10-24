<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { case017 as definition } from "../cases/definition";
import {
  freshCase,
  invalidate,
  verifyEvidence,
  validEvidence,
  conclude,
} from "../cases/model";
import { createCaseStorage } from "../cases/storage";
import type { WorkbookSnapshot } from "../types";
import CaseStagePanel from "../components/CaseStagePanel.vue";
import "../cases/case.css";
const progress = ref(freshCase(definition)),
  loaded = ref(false),
  saved = ref(""),
  error = ref(""),
  feedback = ref("");
const store = createCaseStorage(definition);
let alive = true,
  saveSequence = 0;
onMounted(async () => {
  try {
    const p = await store.load();
    if (alive) progress.value = p;
  } catch {
    error.value = "案件存档暂时无法读取。可以继续调查，离开前请导出案件备份。";
  } finally {
    if (alive) loaded.value = true;
  }
});
onBeforeUnmount(() => {
  alive = false;
  void store.close();
});
const stage = computed(() => definition.stages[progress.value.active]);
const verified = (i: number) => validEvidence(progress.value, i);
const enabled = computed(() =>
  progress.value.stages
    .slice(0, progress.value.active)
    .every((_, i) => verified(i)),
);
async function save() {
  progress.value.updatedAt = new Date().toISOString();
  const seq = ++saveSequence;
  saved.value = "正在保存案件…";
  try {
    await store.save(progress.value);
    if (alive && seq === saveSequence) {
      saved.value = "案件已保存到本机";
      error.value = "";
    }
  } catch (e) {
    if (alive) {
      saved.value = "保存未成功";
      error.value =
        e instanceof Error ? e.message : "案件未能保存，请导出备份。";
    }
  }
}
function changed(i: number, b: WorkbookSnapshot) {
  progress.value.stages[i].draft = b;
  invalidate(progress.value, i);
  feedback.value = "";
  void save();
}
function passed(i: number, b: WorkbookSnapshot) {
  verifyEvidence(progress.value, i, b);
  feedback.value = "";
  void save();
}
function select(i: number) {
  if (i <= progress.value.unlocked) {
    progress.value.active = i;
    void save();
  }
}
function hint() {
  const p = progress.value.stages[progress.value.active];
  p.hints = Math.min(4, p.hints + 1);
  void save();
}
function submit() {
  feedback.value = conclude(definition, progress.value);
  void save();
}
function exportCase() {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: "supply-station-case", version: 1, progress: progress.value },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "表格补给站-案件017.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <main class="case-desk">
    <header class="case-heading">
      <div>
        <RouterLink to="/">← 返回补给站</RouterLink>
        <p class="eyebrow">调查档案 · 017</p>
        <h1>{{ definition.title }}</h1>
      </div>
      <div class="case-save">
        <span role="status">{{ saved || "本机保存调查进度" }}</span
        ><button class="button subtle" @click="exportCase">导出案件备份</button>
      </div>
    </header>
    <p v-if="error" class="case-message" role="alert">{{ error }}</p>
    <p v-if="!loaded" role="status">正在取出调查记录…</p>
    <div v-else class="case-layout">
      <aside class="case-notes" aria-label="调查任务与证据">
        <p class="case-opening">{{ definition.brief }}</p>
        <nav class="case-tabs" aria-label="调查步骤">
          <button
            v-for="(s, i) in definition.stages"
            :key="s.id"
            :disabled="i > progress.unlocked"
            :aria-pressed="progress.active === i"
            @click="select(i)"
          >
            {{ i + 1 }}. {{ s.title }} {{ verified(i) ? "✓" : "" }}
          </button>
        </nav>
        <h2>{{ stage.title }}</h2>
        <p>{{ stage.brief }}</p>
        <p class="case-goal">{{ stage.goal }}</p>
        <details open class="case-note">
          <summary>桌上的便条</summary>
          <p
            v-for="(clue, i) in definition.clues.slice(
              0,
              progress.unlocked + 1,
            )"
            :key="i"
          >
            {{ clue }}
          </p>
        </details>
        <section class="case-evidence" aria-label="证据栏">
          <h2>证据栏</h2>
          <p v-for="(s, i) in definition.stages" :key="s.id" :data-evidence="i">
            <strong
              >{{ verified(i) ? "已核验" : "待核验" }} · {{ s.title }}</strong
            ><span v-if="verified(i)">{{ definition.evidence[i] }}</span
            ><span v-else>表格有改动时，需要重新核验这条证据。</span>
          </p>
        </section>
        <details
          class="case-conclusion"
          :open="progress.completed || undefined"
        >
          <summary>填写交接结论</summary>
          <p>选择结论，并绑定两条已核验的证据。猜对选项还不能交班。</p>
          <form @submit.prevent="submit">
            <label
              v-for="(label, key) in {
                destination: '去向',
                reason: '原因',
                action: '处理建议',
              }"
              :key="key"
              >{{ label
              }}<select
                v-model="progress.answer[key]"
                @change="
                  progress.completed = false;
                  save();
                "
              >
                <option value="">请选择</option>
                <option v-for="v in definition.conclusion[key]" :key="v">
                  {{ v }}
                </option>
              </select></label
            >
            <label
              v-for="(s, i) in definition.stages"
              :key="s.id"
              class="case-binding"
              ><input
                type="checkbox"
                v-model="progress.answer.evidence"
                :value="i"
                :disabled="!verified(i)"
                @change="
                  progress.completed = false;
                  save();
                "
              />绑定：{{ s.title }}</label
            >
            <button class="button primary" type="submit">提交交接</button>
          </form>
          <p v-if="feedback" class="case-message" role="alert">
            {{ feedback }}
          </p>
          <div v-if="progress.completed" class="case-solved" role="status">
            <h3>第 17 箱，找到了。</h3>
            <p>
              货物已送到河湾卫生站。补录临时调拨，关联新旧标签，再保留撤回记录，这笔账就能交清楚。
            </p>
            <p>
              已结案 ·
              {{
                progress.stages.some((s) => s.hints)
                  ? "使用过提示"
                  : "未查看提示"
              }}
            </p>
          </div>
        </details>
      </aside>
      <CaseStagePanel
        :key="stage.id"
        :stage="stage"
        :case-id="definition.id"
        :draft="progress.stages[progress.active].draft"
        :hints="progress.stages[progress.active].hints"
        :enabled="enabled"
        @changed="changed(progress.active, $event)"
        @passed="passed(progress.active, $event)"
        @hint="hint"
      />
    </div>
  </main>
</template>
