<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Shuffle, RotateCcw, ChevronDown } from "lucide-vue-next";
import MarkdownIt from "markdown-it";
import GradeFeedback from "./GradeFeedback.vue";
import type { GradeResult, LessonDefinition } from "../../types";
const md = new MarkdownIt({ html: false });
defineProps<{
  lesson: LessonDefinition;
  variant: number;
  ready: boolean;
  result?: GradeResult;
  usedHelp: boolean;
}>();
defineEmits<{
  focus: [sheet: string, cell: string];
  original: [];
  variant: [];
  reset: [event: MouseEvent];
}>();
</script>
<template>
  <aside id="task-panel" class="task-panel" aria-label="任务与检查结果">
    <p class="eyebrow">
      任务 {{ lesson.id }} <span v-if="variant >= 0">· 独立练习</span>
    </p>
    <h1>{{ lesson.title }}</h1>
    <p class="task-brief">{{ lesson.brief }}</p>
    <div v-if="variant >= 0" class="variant-note">
      <strong>{{ lesson.variants[variant].name }}</strong>
      <p v-for="c in lesson.variants[variant].changes">
        {{ c.cell }} 改为 {{ c.value ?? "空白" }}。
      </p>
      <button class="text-button" @click="$emit('original')">
        返回原始任务
      </button>
    </div>
    <div class="task-goal">
      <span class="mini-label">这次要做的事</span>
      <p>{{ lesson.goal }}</p>
      <div class="target-tags">
        <button
          v-for="t in lesson.targets"
          @click="$emit('focus', t.sheet, t.cell)"
          :title="'定位到 ' + t.cell"
        >
          {{ lesson.sheets.find((s) => s.id === t.sheet)?.name }}!{{ t.cell }}
        </button>
      </div>
    </div>
    <GradeFeedback
      :result="result"
      :lesson="lesson"
      :variant="variant"
      :used-help="usedHelp"
    />
    <div class="task-bottom">
      <button
        :disabled="!lesson.variants.length || !ready"
        @click="$emit('variant')"
      >
        <Shuffle :size="16" />换一批数据</button
      ><button @click="$emit('reset', $event)">
        <RotateCcw :size="15" />重做本关
      </button>
    </div>
    <p class="tiny muted">
      换数据会开始一份新练习。检查中的测试副本不会修改你的表格。
    </p>
    <details class="knowledge">
      <summary>这关用到的知识 <ChevronDown :size="14" /></summary>
      <div v-html="md.render(lesson.explanation)" />
      <RouterLink
        v-if="lesson.prerequisites.length"
        :to="'/lesson/' + lesson.prerequisites[0]"
        >回看前一关 →</RouterLink
      >
    </details>
  </aside>
</template>
