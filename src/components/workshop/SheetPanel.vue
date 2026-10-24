<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { Search } from "lucide-vue-next";
import type { LessonDefinition } from "../../types";
import type { OperationInput } from "../../operations";
import type { EditorState } from "../../input-diagnostics";
import { knowledgeCards } from "../../content/catalog";
import OperationTools from "./OperationTools.vue";
const props = defineProps<{
  lesson: Pick<LessonDefinition, "sheets" | "operation"> & { number?: number };
  allowFill?: boolean;
  editor?: EditorState;
  calculationError?: string;
  ready: boolean;
  committing?: boolean;
  variant: number;
  failed: boolean;
}>();
const cell = defineModel<string>("cell", { required: true }),
  value = defineModel<string>("value", { required: true }),
  sheet = defineModel<string>("sheet", { required: true });
const emit = defineEmits<{
  mount: [element: HTMLElement];
  write: [];
  resolve: [action: "equals" | "text" | "edit", revision: number];
  fill: [sheet: string, range: string];
  undo: [];
  redo: [];
  focus: [sheet: string, cell: string];
  trace: [event: MouseEvent];
  help: [event: MouseEvent];
  retry: [];
  operate: [input: OperationInput];
}>();
const inputCards = computed(() => {
  if (!props.editor?.active || !props.editor.text.startsWith("=")) return [];
  const text = props.editor.text.replace(/"(?:[^"]|"")*"/g, "");
  const names = [...text.matchAll(/\b([A-Z][A-Z0-9.]*)\s*\(/gi)].map((m) =>
    m[1].toUpperCase(),
  );
  return knowledgeCards.filter((card) => names.includes(card.name));
});
const draftCell = ref(cell.value);
const addressEditing = ref(false);
watch([cell, sheet], () => {
  if (!addressEditing.value) draftCell.value = cell.value;
});
let fillRange: string | undefined;
function keepEditorFocus(event: PointerEvent) {
  // WebKit suppresses the following click when touch pointerdown is cancelled.
  if (event.pointerType === "mouse") event.preventDefault();
}
function captureFill(event: PointerEvent) {
  fillRange = draftCell.value;
  keepEditorFocus(event);
}
function fill() {
  const range = fillRange ?? draftCell.value;
  fillRange = undefined;
  addressEditing.value = false;
  emit("fill", sheet.value, range);
}
function history(kind: "undo" | "redo") {
  if (kind === "undo") emit("undo");
  else emit("redo");
}
const host = ref<HTMLElement>();
onMounted(() => {
  if (host.value) emit("mount", host.value);
});
</script>
<template>
  <section class="sheet-panel" aria-label="表格操作区">
    <div class="sheet-heading">
      <span class="sheet-title"
        ><i />{{ variant >= 0 ? "换一批数据 · " : ""
        }}{{
          lesson.sheets.find((s) => s.id === sheet)?.name ??
          lesson.sheets[0].name
        }}</span
      ><span class="muted">浅黄色单元格是本次填写位置</span
      ><button class="icon-label" @click="$emit('trace', $event)">
        <Search :size="16" />结果追踪
      </button>
    </div>
    <div class="entry-bar">
      <label
        >单元格<input
          v-model="draftCell"
          aria-label="单元格地址"
          class="address-input"
          @focus="addressEditing = true"
          @blur="addressEditing = false"
          @keydown.enter.stop.prevent="emit('focus', sheet, draftCell)"
          :disabled="!ready || committing"
      /></label>
      <span class="muted">在下方公式栏或单元格中输入</span>
      <button
        @pointerdown="keepEditorFocus"
        @click="emit('write')"
        :disabled="!ready || committing"
      >
        写入
      </button>
    </div>
    <div class="learning-toolbar">
      <button @click="history('undo')" :disabled="!ready || committing">
        ↶ 撤销</button
      ><button @click="history('redo')" :disabled="!ready || committing">
        ↷ 重做</button
      ><template v-if="allowFill || (lesson.number ?? 0) >= 7"
        ><span class="fill-instruction">地址栏可输入区域</span
        ><button
          @pointerdown="captureFill"
          @click="fill"
          :disabled="!ready || committing"
        >
          ↓ 向下填充
        </button></template
      ><span
        class="toolbar-note"
        :data-value="editor?.active ? editor.text : value"
        >{{ editor?.active ? editor.cell : cell
        }}<template v-if="editor?.active ? editor.text : value">
          · {{ editor?.active ? editor.text : value }}</template
        ></span
      >
    </div>
    <div
      v-if="editor?.active && editor.issue"
      class="input-advice"
      role="status"
      aria-live="polite"
    >
      <p>
        <strong>{{ editor.cell }}</strong> · {{ editor.issue.message }}
      </p>
      <template v-if="editor.issue.code === 'missing-equals'">
        <button
          @pointerdown="keepEditorFocus"
          @click="emit('resolve', 'equals', editor.revision)"
        >
          补上 =
        </button>
        <button
          @pointerdown="keepEditorFocus"
          @click="emit('resolve', 'text', editor.revision)"
        >
          按文字写入
        </button>
      </template>
      <button
        @pointerdown="keepEditorFocus"
        @click="emit('resolve', 'edit', editor.revision)"
      >
        继续修改
      </button>
    </div>
    <p
      v-if="!editor?.active && calculationError"
      class="input-advice"
      role="status"
    >
      {{ cell }}：{{ calculationError }}
    </p>
    <div ref="host" class="spreadsheet" aria-label="可编辑工作簿" />
    <div v-if="!ready" class="sheet-loading" role="status">
      <template v-if="failed"
        >工作簿未能打开。<button class="button subtle" @click="$emit('retry')">
          重试打开工作簿
        </button></template
      ><template v-else>正在打开工作簿…</template>
    </div>
    <div class="sheet-footer">
      <div class="worksheet-switch" role="group" aria-label="切换工作表">
        <button
          v-for="s in lesson.sheets"
          :key="s.id"
          :aria-pressed="sheet === s.id"
          :disabled="!ready || committing"
          @pointerdown="keepEditorFocus"
          @click="emit('focus', s.id, 'A2')"
        >
          {{ s.name }}
        </button>
      </div>
      <span class="edit-note">选格 → 输入 → Enter 或写入</span
      ><button class="text-button" @click="$emit('help', $event)">
        提示与解法
      </button>
    </div>
    <details v-if="inputCards.length" class="input-function-help">
      <summary>查看本次输入的函数说明</summary>
      <p v-for="card in inputCards" :key="card.id">
        <strong>{{ card.name }} · {{ card.title }}</strong
        ><br /><code>{{ card.syntax }}</code
        ><br />{{ card.note }}
      </p>
    </details>
    <OperationTools
      v-if="lesson.operation"
      :goal="lesson.operation"
      :ready="ready"
      @apply="emit('operate', $event)"
    />
    <slot />
  </section>
</template>
