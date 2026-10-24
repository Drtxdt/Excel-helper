<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Search, ArrowUpRight } from "lucide-vue-next";
import { lessons } from "../content";
const query = ref("");
import { knowledgeCards } from "../content/catalog";
const entries = knowledgeCards.map((c) => [
  c.name,
  c.title,
  c.syntax,
  c.example,
  c.note,
]);
const filtered = computed(() =>
  entries.filter((e) =>
    e.join(" ").toLowerCase().includes(query.value.toLowerCase()),
  ),
);
</script>
<template>
  <main class="page-width handbook">
    <p class="eyebrow">写公式时，随手翻一翻</p>
    <div class="section-heading">
      <div>
        <h1>函数手册</h1>
        <p class="muted">
          先看参数，再回自己的表里试。示例中的区域需要换成你的数据。
        </p>
      </div>
      <label class="search-field"
        ><Search :size="18" /><input
          v-model="query"
          placeholder="搜索函数或用途"
          aria-label="搜索函数"
      /></label>
    </div>
    <div class="handbook-grid">
      <article v-for="e in filtered" :key="e[0]" class="function-card">
        <h2>
          {{ e[0] }}<small>{{ e[1] }}</small>
        </h2>
        <p class="syntax">{{ e[2] }}</p>
        <code>{{ e[3] }}</code>
        <p>{{ e[4] }}</p>
        <div class="function-lessons">
          <RouterLink
            v-for="l in lessons
              .filter((l) => l.targets.some((t) => t.functions?.includes(e[0])))
              .slice(0, 2)"
            :to="'/lesson/' + l.id"
            >第 {{ l.id }} 关<ArrowUpRight :size="13"
          /></RouterLink>
        </div>
      </article>
    </div>
    <p v-if="!filtered.length">
      没有找到对应函数。试试“求和”“查找”或英文函数名。
    </p>
  </main>
</template>
