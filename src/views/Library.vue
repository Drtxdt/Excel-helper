<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Search, ArrowUpRight } from "lucide-vue-next";
import { lessons } from "../content";
const query = ref("");
const entries = [
  [
    "SUM",
    "求和",
    "SUM(数值1, [数值2], …)",
    "=SUM(B2:B5)",
    "区域里的文本和空白通常被忽略，新增数据时检查范围有没有覆盖。",
  ],
  [
    "ROUND",
    "金额保留小数",
    "ROUND(数值, 位数)",
    "=ROUND(B2*C2,2)",
    "设置显示两位小数并不改变参与后续计算的原值；ROUND 会改变结果。",
  ],
  [
    "AVERAGE",
    "算术平均值",
    "AVERAGE(数值1, …)",
    "=AVERAGE(B2:B5)",
    "区域里的零参与平均；空白不计入分母。",
  ],
  [
    "MIN",
    "找最小值",
    "MIN(数值1, …)",
    "=MIN(B2:B5)",
    "零也是一个数，不会被忽略。",
  ],
  [
    "MAX",
    "找最大值",
    "MAX(数值1, …)",
    "=MAX(B2:B5)",
    "检查范围是否包含整列记录。",
  ],
  [
    "COUNT",
    "数一数数字",
    "COUNT(值1, …)",
    "=COUNT(B2:B5)",
    "数字与看起来像数字的文本是不同类型。",
  ],
  [
    "COUNTA",
    "统计非空单元格",
    "COUNTA(值1, …)",
    "=COUNTA(B2:B5)",
    "公式返回的空字符串也可能计数；有内容不等于有有效数据。",
  ],
  [
    "IF",
    "按条件选结果",
    "IF(条件, 成立时的值, 不成立时的值)",
    '=IF(B2<10,"补货","够用")',
    "文本要放在英文双引号里；小于 10 不包含 10。",
  ],
  [
    "AND",
    "所有条件同时成立",
    "AND(条件1, 条件2, …)",
    "=AND(B2<10,C2=0)",
    "返回 TRUE 或 FALSE，可以交给 IF 继续处理。",
  ],
  [
    "OR",
    "至少一个条件成立",
    "OR(条件1, 条件2, …)",
    "=OR(B2<10,D2>20)",
    "两个条件都成立时也会返回 TRUE。",
  ],
  [
    "IFERROR",
    "处理错误值",
    "IFERROR(表达式, 出错时的值)",
    '=IFERROR(B2/C2,"暂无消耗")',
    "先理解错误原因，再决定替代值。不要把所有错误都藏成零。",
  ],
  [
    "TRIM",
    "清理多余空格",
    "TRIM(文本)",
    "=TRIM(A2)",
    "去掉首尾普通空格，词间多个普通空格压缩成一个；不保证清除所有 Unicode 空白。",
  ],
  [
    "VALUE",
    "把文本转换成数值",
    "VALUE(文本)",
    "=VALUE(A2)",
    "货号中的前导零有意义，别把货号当数值转换。",
  ],
  [
    "LEFT",
    "从左侧取字符",
    "LEFT(文本, 字符数)",
    "=LEFT(A2,2)",
    "返回文本，哪怕它看起来是数字。",
  ],
  [
    "MID",
    "从指定位置取字符",
    "MID(文本, 起始位置, 字符数)",
    "=MID(A2,4,3)",
    "起始位置从 1 开始。",
  ],
  [
    "RIGHT",
    "从右侧取字符",
    "RIGHT(文本, 字符数)",
    "=RIGHT(A2,1)",
    "先确认编码长度与分隔符是否稳定。",
  ],
  [
    "DATE",
    "组合日期",
    "DATE(年, 月, 日)",
    "=DATE(A2,B2,C2)",
    "日期以序列值参与计算，显示格式决定看到日期还是数字。",
  ],
  [
    "XLOOKUP",
    "按键查找对应值",
    "XLOOKUP(查找值, 查找区域, 返回区域, [未找到时的值])",
    '=XLOOKUP(A2,商品!A2:A4,商品!C2:C4,"未登记")',
    "默认精确匹配；重复键默认取第一个，不会替你发现数据冲突。",
  ],
  [
    "VLOOKUP",
    "从区域首列向右查找",
    "VLOOKUP(查找值, 表区域, 返回列序号, FALSE)",
    "=VLOOKUP(A2,商品!A2:C4,3,FALSE)",
    "本课程使用 FALSE 精确匹配；返回列序号从表区域的第一列计起。",
  ],
  [
    "SUMIF",
    "单条件求和",
    "SUMIF(条件区域, 条件, 求和区域)",
    '=SUMIF(A2:A6,"东街",C2:C6)',
    "条件区域与求和区域要对应同一批记录。",
  ],
  [
    "COUNTIF",
    "单条件计数",
    "COUNTIF(条件区域, 条件)",
    '=COUNTIF(A2:A6,"东街")',
    "返回满足条件的单元格数量。",
  ],
  [
    "SUMIFS",
    "多条件求和",
    "SUMIFS(求和区域, 条件区域1, 条件1, …)",
    '=SUMIFS(C2:C6,A2:A6,"东街",B2:B6,"已发货")',
    "SUMIFS 把求和区域放在第一个参数；所有条件需要同时成立。",
  ],
  [
    "COUNTIFS",
    "多条件计数",
    "COUNTIFS(条件区域1, 条件1, …)",
    '=COUNTIFS(A2:A6,"东街",B2:B6,"已发货")',
    "每个条件区域要有相同尺寸。",
  ],
];
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
