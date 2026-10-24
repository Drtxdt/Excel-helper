<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { X } from "lucide-vue-next";
const props = defineProps<{
  title: string;
  kind?: "drawer" | "modal";
  closeLabel?: string;
  returnFocus?: HTMLElement;
}>();
const emit = defineEmits<{ close: [] }>();
const element = ref<HTMLDialogElement>();
let opener: HTMLElement | null = null;
onMounted(() => {
  opener = props.returnFocus ?? (document.activeElement as HTMLElement);
  element.value?.showModal();
});
function trapTab(event: KeyboardEvent) {
  if (event.key !== "Tab" || !element.value) return;
  const items = [
    ...element.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.getClientRects().length > 0);
  const first = items[0],
    last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
onBeforeUnmount(() => {
  element.value?.close();
  if (opener?.isConnected) opener.focus();
});
</script>
<template>
  <!-- Modal keystrokes must not reach the spreadsheet's global shortcuts. -->
  <dialog
    ref="element"
    class="focus-dialog"
    :class="kind === 'drawer' ? 'help-panel' : 'modal'"
    :aria-label="title"
    @cancel.prevent="emit('close')"
    @keydown.stop="trapTab"
    @keyup.stop
    @keypress.stop
  >
    <div class="help-heading">
      <h2>{{ title }}</h2>
      <button
        class="icon-button"
        :aria-label="closeLabel ?? '关闭'"
        autofocus
        @click="emit('close')"
      >
        <X :size="22" />
      </button>
    </div>
    <slot />
  </dialog>
</template>
