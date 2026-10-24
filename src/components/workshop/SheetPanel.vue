<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { Search } from "lucide-vue-next";
import type { LessonDefinition } from "../../types";
import type { OperationInput } from "../../operations";
import OperationTools from "./OperationTools.vue";
defineProps<{
  lesson: Pick<LessonDefinition, "sheets" | "operation"> & { number?: number };
  allowFill?: boolean;
  ready: boolean;
  variant: number;
  failed: boolean;
}>();
const cell = defineModel<string>("cell", { required: true }),
  value = defineModel<string>("value", { required: true }),
  sheet = defineModel<string>("sheet", { required: true });
const emit = defineEmits<{
  mount: [element: HTMLElement];
  write: [sheet: string, cell: string, value: string];
  fill: [sheet: string, range: string];
  undo: [];
  redo: [];
  focus: [sheet: string, cell: string];
  trace: [event: MouseEvent];
  help: [event: MouseEvent];
  retry: [];
  operate: [input: OperationInput];
}>();
// Input drafts are separate from the engine selection. A delayed recalculation
// must not replace a range the learner is typing with the previous selected cell.
const draftCell = ref(cell.value),
  draftValue = ref(value.value),
  editingValue = ref(false);
watch([cell, sheet], () => {
  draftCell.value = cell.value;
  draftValue.value = value.value;
  editingValue.value = false;
});
watch(value, (v) => {
  if (!editingValue.value) draftValue.value = v;
});
function write() {
  const destination = draftCell.value,
    content = draftValue.value;
  editingValue.value = false;
  emit("write", sheet.value, destination, content);
}
function fill() {
  editingValue.value = false;
  emit("fill", sheet.value, draftCell.value);
}
function history(kind: "undo" | "redo") {
  editingValue.value = false;
  if (kind === "undo") emit("undo");
  else emit("redo");
}
const host = ref<HTMLElement>();
onMounted(() => {
  if (host.value) emit("mount", host.value);
});
function enter(event: KeyboardEvent) {
  if (!event.isComposing) write();
}
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
          @keydown.enter="emit('focus', sheet, draftCell)"
          :disabled="!ready"
      /></label>
      <span class="fx" aria-hidden="true">fx</span
      ><input
        v-model="draftValue"
        @input="editingValue = true"
        aria-label="输入公式或数值"
        placeholder="输入公式或数值，再点写入"
        @keydown.enter="enter"
        :disabled="!ready"
        autocomplete="off"
        autocapitalize="off"
        :spellcheck="false"
      />
      <button @click="write" :disabled="!ready">写入</button>
    </div>
    <div class="learning-toolbar">
      <button @click="history('undo')" :disabled="!ready">↶ 撤销</button
      ><button @click="history('redo')" :disabled="!ready">↷ 重做</button
      ><template v-if="allowFill || (lesson.number ?? 0) >= 7"
        ><span class="fill-instruction">地址栏可输入区域</span
        ><button @click="fill" :disabled="!ready">↓ 向下填充</button></template
      ><span class="toolbar-note"
        >{{ cell }}<template v-if="value"> · {{ value }}</template></span
      >
    </div>
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
          :disabled="!ready"
          @click="emit('focus', s.id, 'A2')"
        >
          {{ s.name }}
        </button>
      </div>
      <span class="edit-note">选格 → 输入 → 写入</span
      ><button class="text-button" @click="$emit('help', $event)">
        提示与解法
      </button>
    </div>
    <OperationTools
      v-if="lesson.operation"
      :goal="lesson.operation"
      :ready="ready"
      @apply="emit('operate', $event)"
    />
    <slot />
  </section>
</template>
