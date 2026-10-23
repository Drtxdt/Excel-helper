<script setup lang="ts">
import FocusDialog from "./FocusDialog.vue";
import type { LessonDefinition } from "../../types";
import type { SpreadsheetAdapter } from "../../adapter";
defineProps<{
  returnFocus?: HTMLElement;
  lesson: LessonDefinition;
  tab: string;
  hintCount: number;
  solutionOpen: boolean;
  variant: number;
  traceData?: ReturnType<SpreadsheetAdapter["trace"]>;
}>();
const traceSheet = defineModel<string>("traceSheet", { required: true });
const traceCell = defineModel<string>("traceCell", { required: true });
defineEmits<{ close: []; hint: []; solution: []; trace: [] }>();
</script>
<template>
  <FocusDialog
    kind="drawer"
    :return-focus="returnFocus"
    :title="tab === 'trace' ? '结果从哪里来' : '卡住了？一起拆开看'"
    close-label="关闭侧栏"
    @close="$emit('close')"
  >
    <template v-if="tab === 'hint'"
      ><p class="muted">提示不会扣分。先看一个线索，再回表格试试。</p>
      <article
        v-for="(h, i) in lesson.hints.slice(0, hintCount)"
        :key="i"
        class="hint"
      >
        <span class="mini-label">提示 {{ i + 1 }}</span>
        <p>{{ h }}</p>
      </article>
      <button v-if="hintCount < 4" class="button subtle" @click="$emit('hint')">
        {{ hintCount ? "再给一个提示" : "看第一个提示" }}</button
      ><button class="text-button solution-toggle" @click="$emit('solution')">
        {{ solutionOpen ? "收起解法" : "查看完整解法与说明" }}
      </button>
      <div v-if="solutionOpen">
        <article v-for="s in lesson.solutions" class="solution">
          <h3>{{ s.title }}</h3>
          <div v-for="(formula, key) in s.cells">
            <small>{{ key }}</small
            ><code>{{ formula }}</code>
          </div>
          <p>{{ s.explanation }}</p>
        </article>
        <p v-if="lesson.operation">
          {{ lesson.goal }} 使用表格下方的设置，应用后观察表格，再点击检查。
        </p>
        <p v-if="variant >= 0" class="muted">
          以上是原始任务的解法，请根据这份数据检查引用。
        </p>
      </div></template
    ><template v-else
      ><p>选择结果单元格，查看公式里实际引用的区域。</p>
      <label
        >工作表<select v-model="traceSheet">
          <option v-for="s in lesson.sheets" :value="s.id">
            {{ s.name }}
          </option>
        </select></label
      ><label>单元格<input v-model="traceCell" /></label
      ><button class="button subtle" @click="$emit('trace')">追踪结果</button
      ><template v-if="traceData"
        ><code class="trace-formula">{{
          traceData.formula || "这里没有公式。"
        }}</code>
        <div
          v-for="(n, i) in traceData.references"
          :key="i"
          class="reference-chip"
        >
          ↳ {{ n.token
          }}<small>{{
            n.values
              .flat()
              .map((v: any) => v ?? "空白")
              .join("、")
          }}</small>
        </div>
        <div v-if="traceData.rows.length" class="match-rows">
          <strong>哪些行参与了结果</strong>
          <p v-for="r in traceData.rows">
            第 {{ r.row }} 行 · {{ r.included ? "计入" : "未计入" }} ·
            {{ r.value }}
          </p>
        </div>
        <p class="tiny muted">
          这里列出引擎解析到的直接引用；嵌套函数的计算过程请结合公式和表格查看。
        </p></template
      ></template
    >
  </FocusDialog>
</template>
