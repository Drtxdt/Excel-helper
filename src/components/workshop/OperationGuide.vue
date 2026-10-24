<script setup lang="ts">
import FocusDialog from "./FocusDialog.vue";
defineProps<{ returnFocus?: HTMLElement }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <FocusDialog
    title="先试一次表格操作"
    :return-focus="returnFocus"
    close-label="跳过引导"
    @close="$emit('close')"
  >
    <ol class="guide-steps">
      <li>
        <strong>选一格。</strong
        >点表格里的单元格，或点任务中的地址。平板轻点即可，不用双击。
      </li>
      <li>
        <strong>输入内容。</strong
        >直接在选中的格子打字，或在公式栏输入。公式从等号开始；输入 =SU 可以选择
        SUM。
      </li>
      <li>
        <strong>确认写入。</strong>点“写入”或按 Enter 确认。双击或 F2
        修改原内容，Escape 取消。
      </li>
      <li>
        <strong>检查作答。</strong
        >系统核对计算结果；发现差异后，按具体单元格修改。
      </li>
      <li>
        <strong>换数据再试。</strong
        >“换一批数据”开始新的练习；检查用的测试副本不会改动你的表格。
      </li>
    </ol>
    <p>
      需要填充时，在地址栏输入区域（如
      D2:D4），再点“向下填充”。首行需要已有公式。
    </p>
    <button class="button primary" @click="$emit('close')">开始操作</button>
  </FocusDialog>
</template>
