<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Check, ArrowRight } from "lucide-vue-next";
import type { GradeResult, LessonDefinition } from "../../types";
defineProps<{
  result?: GradeResult;
  lesson: LessonDefinition;
  variant: number;
  usedHelp: boolean;
}>();
</script>
<template>
  <section
    v-if="result"
    role="status"
    aria-atomic="true"
    class="feedback"
    :class="result.status"
    aria-live="polite"
  >
    <template v-if="result.status === 'passed'"
      ><strong><Check :size="19" />这份表，对上了。</strong>
      <p>{{ lesson.success }}</p>
      <p v-if="variant >= 0">
        {{
          usedHelp
            ? "这次借助了提示。可以再换一份数据，试着独立完成。"
            : "这次没有查看提示，已记为独立完成变式。"
        }}
      </p>
      <small>已核对 {{ result.scenarios }} 份数据</small
      ><RouterLink
        v-if="lesson.number < 40"
        class="button primary"
        :to="'/lesson/' + String(lesson.number + 1).padStart(2, '0')"
        >下一项任务<ArrowRight :size="16" /></RouterLink
      ><RouterLink v-else to="/records" class="button primary"
        >查看值班记录</RouterLink
      ></template
    ><template v-else
      ><strong>{{
        result.status === "error" ? "检查暂未完成" : "还有几处需要看看"
      }}</strong>
      <div
        v-for="(d, i) in result.diagnostics.slice(0, 5)"
        :key="i"
        class="diagnostic"
      >
        <small v-if="d.variant">换数据 · {{ d.variant }}</small>
        <p>{{ d.message }}</p>
      </div>
      <small v-if="result.diagnostics.length > 5"
        >先处理这几处，再重新检查。</small
      ></template
    >
  </section>
</template>
