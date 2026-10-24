<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Package,
  Leaf,
  Truck,
  ClipboardList,
} from "lucide-vue-next";
import { chapters, lessons } from "../content";
import { state } from "../state";
import StationArt from "../components/StationArt.vue";
import "../cases/case.css";
const done = computed(
  () => Object.values(state.records).filter((r) => r.completed).length,
);
const chapterDone = (n: number) =>
  lessons.filter((l) => l.chapter === n && state.records[l.id]?.completed)
    .length;
const next = computed(
  () =>
    lessons.find(
      (l) => state.records[l.id]?.draft && !state.records[l.id]?.completed,
    ) ||
    lessons.find((l) => !state.records[l.id]?.completed) ||
    lessons[0],
);
</script>
<template>
  <main class="home page-width">
    <section class="welcome">
      <div>
        <p class="eyebrow">今天，来补给站值个班</p>
        <h1>这张表，<br />交给你了。</h1>
        <p class="intro">
          订单要结算，库存要盘点。<br />从第一条公式开始，一次解决一个小问题。
        </p>
        <RouterLink class="button primary" :to="'/lesson/' + next.id"
          >{{ done || state.records[next.id] ? "继续学习" : "接下第一张订单"
          }}<ArrowRight :size="18" /></RouterLink
        ><span class="welcome-note">不需要会函数。准备好键盘就行。</span>
      </div>
      <StationArt />
      <aside class="progress-note">
        <span class="eyebrow">你的值班记录</span
        ><strong>{{ done }}<small> / 40 关</small></strong>
        <div class="progress-track">
          <i :style="{ width: (done / 40) * 100 + '%' }" />
        </div>
        <p>
          {{ done ? "慢慢来，每一张表都算数。" : "第一张订单已经放在桌上。" }}
        </p>
      </aside>
    </section>
    <section class="mode-choices" aria-label="选择学习方式">
      <article>
        <h2>练习场</h2>
        <p>一次练一个知识点。40 个任务，可以从头学，也可以随时回来查漏。</p>
        <RouterLink class="button subtle" :to="'/lesson/' + next.id"
          >进入练习场 →</RouterLink
        >
      </article>
      <article class="case-entry">
        <p class="eyebrow">案件调查 · 017</p>
        <h2>消失的第 17 箱货物</h2>
        <p>
          出库 17 箱，签收却只有 16 箱。单据都在桌上，先把这一箱的去向查明白。
        </p>
        <RouterLink class="button primary" to="/case/case-017"
          >进入调查桌 →</RouterLink
        >
        <p class="muted">随时接案；卡住可以看提示，也可以返回练习。</p>
      </article>
    </section>
    <section class="course-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">从订单到独立值班</p>
          <h2>课程地图</h2>
        </div>
        <p>8 章 · 40 个任务 <span class="muted"> / 可随时跳转、重做</span></p>
      </div>
      <div class="chapter-grid">
        <article
          v-for="chapter in chapters"
          :key="chapter.number"
          class="chapter-card"
        >
          <div class="chapter-top">
            <span class="chapter-number">{{
              String(chapter.number).padStart(2, "0")
            }}</span
            ><component
              :is="
                [Package, Truck, ClipboardList, Leaf][(chapter.number - 1) % 4]
              "
              :size="23"
            /><span class="chapter-count"
              >{{ chapterDone(chapter.number) }} / 5</span
            >
          </div>
          <h3>{{ chapter.name }}</h3>
          <p class="chapter-subtitle">{{ chapter.subtitle }}</p>
          <ol>
            <li
              v-for="l in lessons.filter((l) => l.chapter === chapter.number)"
              :key="l.id"
            >
              <RouterLink :to="'/lesson/' + l.id"
                ><span
                  class="lesson-dot"
                  :class="{ complete: state.records[l.id]?.completed }"
                  ><Check
                    v-if="state.records[l.id]?.completed"
                    :size="12"
                  /><template v-else>{{
                    ((l.number - 1) % 5) + 1
                  }}</template></span
                ><span>{{ l.title }}</span
                ><ChevronRight :size="14"
              /></RouterLink>
            </li>
          </ol>
        </article>
      </div>
    </section>
    <footer class="page-footer">
      所有练习在浏览器里完成。进度存在本机，换电脑前记得导出备份。<RouterLink
        to="/records"
        >管理学习记录 →</RouterLink
      >
    </footer>
  </main>
</template>
