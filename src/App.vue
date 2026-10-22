<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import { Package, BookOpen, Map, Archive } from "lucide-vue-next";
import { state } from "./state";
</script>
<template>
  <div class="app-shell" :class="{ 'no-motion': !state.motion }">
    <header class="site-header">
      <RouterLink class="brand" to="/"
        ><span class="brand-icon"><Package :size="24" /></span
        ><span
          >表格补给站<small>把眼前这张表，算明白。</small></span
        ></RouterLink
      >
      <nav aria-label="主导航">
        <RouterLink to="/"><Map :size="17" />课程地图</RouterLink
        ><RouterLink to="/handbook"><BookOpen :size="17" />函数手册</RouterLink
        ><RouterLink to="/records"><Archive :size="17" />学习记录</RouterLink>
      </nav>
      <span class="local-label"><i />本机学习 · 无需登录</span>
    </header>
    <div v-if="state.storageError" class="storage-warning" role="alert">
      {{ state.storageError }} <RouterLink to="/records">导出备份</RouterLink>
    </div>
    <RouterView :key="$route.fullPath" />
  </div>
</template>
