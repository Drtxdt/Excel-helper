<script setup lang="ts">
import { ref, shallowRef, computed } from "vue";
import { RouterLink } from "vue-router";
import { ArrowLeft, Check, Lightbulb } from "lucide-vue-next";
import { chapters } from "../../content";
import type { LessonDefinition } from "../../types";
import { useTeachingSession } from "../../workshop/useTeachingSession";
import TaskPanel from "./TaskPanel.vue";
import SheetPanel from "./SheetPanel.vue";
import HelpDrawer from "./HelpDrawer.vue";
import GradeFeedback from "./GradeFeedback.vue";
import FocusDialog from "./FocusDialog.vue";
import OperationGuide from "./OperationGuide.vue";
import "../../workshop/workshop.css";
const props = defineProps<{ lesson: LessonDefinition }>();
const {
  ui,
  saved,
  variant,
  hintCount,
  usedHelp,
  solutionOpen,
  traceData,
  traceSheet,
  traceCell,
  busy,
  session,
  mount,
  showHint,
  showSolution,
  reset,
  changeData,
  returnOriginal,
  trace,
  check,
  retry,
} = useTeachingSession(props.lesson);
const chapter = computed(() =>
  chapters.find((c) => c.number === props.lesson.chapter),
);
const collapsed = ref(false),
  tab = ref(""),
  resetOpen = ref(false),
  guideOpen = ref(false);
try {
  guideOpen.value = localStorage.getItem("supply-station-guide-v1") !== "seen";
} catch {
  guideOpen.value = true;
}
function closeGuide() {
  guideOpen.value = false;
  try {
    localStorage.setItem("supply-station-guide-v1", "seen");
  } catch {}
}
const returnFocus = shallowRef<HTMLElement>();
function remember(event: Event) {
  returnFocus.value =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : undefined;
}
function openHelp(kind: string, event: Event) {
  remember(event);
  tab.value = kind;
  if (kind === "trace") {
    traceSheet.value = ui.sheet;
    traceCell.value = ui.cell;
  }
}
function openGuide(event: Event) {
  remember(event);
  guideOpen.value = true;
}
function openReset(event: Event) {
  remember(event);
  resetOpen.value = true;
}
function hint(event: Event) {
  remember(event);
  tab.value = "hint";
  showHint();
}
const phaseText = computed(
  () =>
    ({
      preparing: "正在准备工作簿",
      editing: "可以编辑表格",
      waiting: "正在等待表格计算",
      grading: "正在核对作答与测试数据",
      feedback: "检查完成",
      error: "操作未完成，可以重试",
    })[ui.phase],
);
</script>
<template>
  <main class="workshop">
    <div class="orientation-notice" role="note">
      请把平板转为横屏，让任务和表格都放得下。也可以在电脑上继续学习。
    </div>
    <div class="workshop-heading">
      <RouterLink to="/" class="back-link"
        ><ArrowLeft :size="16" />课程地图</RouterLink
      ><span
        >{{ String(lesson.chapter).padStart(2, "0") }} {{ chapter?.name }} / 第
        {{ ((lesson.number - 1) % 5) + 1 }} 关</span
      ><span class="save-state" aria-live="polite">{{
        saved || "本机自动存档"
      }}</span>
    </div>
    <div class="workshop-actions">
      <button
        class="button subtle"
        aria-controls="task-panel"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? "展开任务" : "收起任务" }}
      </button>
      <button
        class="button primary"
        :disabled="!ui.ready || busy"
        @click="check"
      >
        <Check :size="17" />{{ busy ? "正在检查…" : "检查作答" }}
      </button>
      <button class="button subtle" @click="hint">
        <Lightbulb :size="17" />查看提示
      </button>
      <span class="phase-label" role="status" aria-live="polite">{{
        phaseText
      }}</span>
      <button class="text-button guide-button" @click="openGuide">
        操作引导
      </button>
    </div>
    <div v-if="ui.error" role="alert" class="session-error">
      {{ ui.error
      }}<button
        v-if="ui.ready"
        class="text-button"
        :disabled="busy"
        @click="check"
      >
        重新检查
      </button>
    </div>
    <div class="workshop-body">
      <TaskPanel
        v-if="!collapsed"
        :lesson="lesson"
        :variant="variant"
        :ready="ui.ready"
        :result="ui.result"
        :used-help="usedHelp"
        @focus="(sheet, cell) => session.focus(sheet, cell)"
        @original="returnOriginal"
        @variant="changeData"
        @reset="openReset"
      />
      <SheetPanel
        :lesson="lesson"
        :ready="ui.ready"
        :variant="variant"
        :failed="ui.phase === 'error'"
        v-model:cell="ui.cell"
        v-model:value="ui.value"
        v-model:sheet="ui.sheet"
        @mount="mount"
        @write="(sheet, cell, value) => session.write(sheet, cell, value)"
        @fill="(sheet, range) => session.fill(sheet, range)"
        @undo="session.undo()"
        @redo="session.redo()"
        @focus="(sheet, cell) => session.focus(sheet, cell)"
        @trace="openHelp('trace', $event)"
        @help="openHelp('hint', $event)"
        @retry="retry"
        @operate="session.operate(lesson.operation!, $event)"
      >
        <div v-if="collapsed && ui.result" class="compact-feedback">
          <GradeFeedback
            :lesson="lesson"
            :variant="variant"
            :result="ui.result"
            :used-help="usedHelp"
          />
        </div>
      </SheetPanel>
    </div>
    <HelpDrawer
      :return-focus="returnFocus"
      v-if="tab"
      :lesson="lesson"
      :tab="tab"
      :hint-count="hintCount"
      :solution-open="solutionOpen"
      :variant="variant"
      :trace-data="traceData"
      v-model:trace-sheet="traceSheet"
      v-model:trace-cell="traceCell"
      @close="tab = ''"
      @hint="showHint"
      @solution="showSolution"
      @trace="trace"
    />
    <FocusDialog
      :return-focus="returnFocus"
      v-if="resetOpen"
      title="重新做这份任务？"
      @close="resetOpen = false"
      ><p>当前草稿会恢复为初始数据，已完成的记录保留。</p>
      <div class="task-actions">
        <button class="button subtle" @click="resetOpen = false">
          保留草稿</button
        ><button
          class="button primary"
          @click="
            resetOpen = false;
            reset();
          "
        >
          重新开始
        </button>
      </div></FocusDialog
    >
    <OperationGuide
      :return-focus="returnFocus"
      v-if="guideOpen"
      @close="closeGuide"
    />
  </main>
</template>
