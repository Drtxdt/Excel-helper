<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import type { CaseStage } from "../cases/definition";
import type { WorkbookSnapshot } from "../types";
import { useCaseSession } from "../cases/useCaseSession";
import SheetPanel from "./workshop/SheetPanel.vue";
import FocusDialog from "./workshop/FocusDialog.vue";
import "../workshop/workshop.css";
const props = defineProps<{
  stage: CaseStage;
  draft?: WorkbookSnapshot;
  hints: number;
  enabled: boolean;
  caseId: string;
}>();
const emit = defineEmits<{
  changed: [WorkbookSnapshot];
  passed: [WorkbookSnapshot];
  hint: [];
}>();
const { ui, session, mount, prepare, traceSelection, trace, busy } =
  useCaseSession(
    props.stage,
    props.draft,
    (b) => emit("changed", b),
    (b) => emit("passed", b),
  );
const help = ref(false),
  showTrace = ref(false),
  solution = ref(false);
const opener = shallowRef<HTMLElement>();
function openHelp(e: MouseEvent) {
  opener.value = e.currentTarget as HTMLElement;
  help.value = true;
}
function openTrace(e: MouseEvent) {
  opener.value = e.currentTarget as HTMLElement;
  traceSelection();
  showTrace.value = true;
}
defineExpose({
  commit: () => session.commit(),
  editing: computed(() => !!ui.editor?.active),
});
</script>
<template>
  <section class="case-stage" :aria-label="stage.title">
    <div class="case-toolbar">
      <button
        class="button primary"
        :disabled="!ui.ready || busy || !enabled"
        @click="session.check(stage)"
      >
        {{ busy ? "正在核验…" : "核验这份证据" }}
      </button>
      <button class="button subtle" @click="openHelp">调查提示</button>
      <span role="status" aria-live="polite">{{
        !enabled
          ? "先重新核验前一份证据"
          : ui.phase === "preparing"
            ? "正在打开单据"
            : ui.phase === "waiting"
              ? "正在等待计算"
              : ui.phase === "grading"
                ? "正在用不同数据复核"
                : "可使用任意公式和辅助列"
      }}</span>
    </div>
    <p v-if="ui.error" role="alert" class="case-message">{{ ui.error }}</p>
    <div v-if="ui.result" class="case-message" role="status" aria-live="polite">
      <strong>{{
        ui.result.status === "passed"
          ? "计算已核验，可以查看证据栏。"
          : ui.result.status === "error"
            ? "计算未完成，作答保留。可以重试。"
            : "还有差异，一起看具体单元格。"
      }}</strong>
      <ul v-if="ui.result.diagnostics.length">
        <li v-for="(d, i) in ui.result.diagnostics.slice(0, 4)" :key="i">
          {{ d.variant ? d.variant + "：" : "" }}{{ d.message }}
          <button
            v-if="d.action === 'locate'"
            class="text-button"
            @click="session.focus(d.cell.split('!')[0], d.cell.split('!')[1])"
          >
            定位到 {{ d.cell }}
          </button>
        </li>
      </ul>
      <span v-else
        >原始数据与
        {{ stage.variants.length }} 组变式均通过；测试没有修改你的表格。</span
      >
    </div>
    <SheetPanel
      :lesson="stage"
      :allow-fill="true"
      :ready="ui.ready"
      :committing="ui.committing"
      :variant="-1"
      :failed="ui.phase === 'error'"
      v-model:cell="ui.cell"
      v-model:value="ui.value"
      v-model:sheet="ui.sheet"
      @mount="mount"
      @write="session.commit()"
      :editor="ui.editor"
      :calculation-error="ui.calculationError"
      @resolve="(action, revision) => session.resolveInput(action, revision)"
      @fill="(s, r) => session.fill(s, r)"
      @focus="(s, c) => session.focus(s, c)"
      @undo="session.undo()"
      @redo="session.redo()"
      @retry="prepare"
      @help="openHelp"
      @trace="openTrace"
    />
    <FocusDialog
      v-if="help && ui.ready"
      title="先找一个突破口"
      kind="drawer"
      :return-focus="opener"
      @close="help = false"
    >
      <p>提示不扣分。你也可以先去练习，再回这张调查桌。</p>
      <p
        v-for="(hint, i) in stage.hints.slice(0, hints)"
        :key="i"
        class="case-note"
      >
        {{ hint }}
      </p>
      <button v-if="hints < 4" class="button subtle" @click="emit('hint')">
        {{ hints ? "再看一个提示" : "查看第一个提示" }}
      </button>
      <p>
        <RouterLink
          :to="{
            path: '/lesson/' + stage.practice,
            query: { fromCase: caseId },
          }"
          >去练习相关公式 →</RouterLink
        >
      </p>
      <button
        class="text-button"
        @click="
          solution = true;
          emit('hint');
        "
      >
        查看 {{ stage.solutions.length }} 种参考解法
      </button>
      <div
        v-if="solution"
        v-for="answer in stage.solutions"
        :key="answer.title"
        class="case-note"
      >
        <h3>{{ answer.title }}</h3>
        <p>{{ answer.explanation }}</p>
        <details>
          <summary>展开公式</summary>
          <p v-for="(formula, cell) in answer.cells" :key="cell">
            <b>{{ cell }}</b
            ><code class="case-formula">{{ formula }}</code>
          </p>
        </details>
      </div>
    </FocusDialog>
    <FocusDialog
      v-if="showTrace && ui.ready"
      title="这格引用了哪里"
      kind="drawer"
      :return-focus="opener"
      @close="showTrace = false"
    >
      <template v-if="trace"
        ><code class="case-formula">{{
          trace.formula || "这里没有公式。"
        }}</code>
        <p v-for="(r, i) in trace.references" :key="i">
          <strong>{{ r.token }}</strong
          ><span class="case-formula">{{
            r.values
              .flat()
              .map((v: unknown) => v ?? "空白")
              .join("、")
          }}</span>
        </p>
        <p>
          这里列出公式里的直接引用。嵌套计算可以结合表格逐步检查。
        </p></template
      >
    </FocusDialog>
  </section>
</template>
