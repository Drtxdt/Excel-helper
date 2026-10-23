<script setup lang="ts">
import { computed } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { lessons } from "../content";
import WorkshopSession from "../components/workshop/WorkshopSession.vue";
const route = useRoute();
const lesson = computed(() => lessons.find((l) => l.id === route.params.id));
</script>
<template>
  <WorkshopSession v-if="lesson" :key="lesson.id" :lesson="lesson" />
  <main v-else class="page-width">
    <h1>没有找到这项任务</h1>
    <RouterLink to="/">回到课程地图</RouterLink>
  </main>
</template>
