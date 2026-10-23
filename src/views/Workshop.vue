<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import { useRoute, RouterLink } from "vue-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lightbulb,
  RotateCcw,
  Shuffle,
  Search,
  X,
  ChevronDown,
} from "lucide-vue-next";
import MarkdownIt from "markdown-it";
import { lessons, chapters } from "../content";
import { SpreadsheetAdapter } from "../adapter";
import { makeWorkbook, put } from "../workbook";
import { gradeOperation } from "../operations";
import GradeWorker from "../grade.worker?worker";
import { state, save, load } from "../state";
import { passedRecord } from "../learning";
import { exerciseLesson } from "../exercise";
import type { GradeResult, LessonDefinition, LearningRecord } from "../types";
const md = new MarkdownIt({ html: false });
const route = useRoute();
const lesson = lessons.find((l) => l.id === route.params.id);
const host = ref<HTMLElement>();
const ready = ref(false),
  busy = ref(false),
  error = ref(""),
  saved = ref(""),
  hintCount = ref(0),
  tab = ref(""),
  variant = ref(-1),
  usedHelp = ref(false),
  solutionOpen = ref(false),
  resetOpen = ref(false);
const result = ref<GradeResult>();
const revision = ref(0);
const traceCell = ref(""),
  traceSheet = ref("main"),
  traceData = ref<{
    formula: string;
    nodes: any[];
    references: any[];
    rows: any[];
  }>();
const quickCell = ref(""),
  quickValue = ref("");
const category = ref(
    lesson?.operation?.kind === "sort-filter"
      ? lesson.operation.filter.choices[0]
      : "",
  ),
  ascending = ref(true),
  opRange = ref(""),
  threshold = ref(0),
  values = ref(""),
  reject = ref(false);
let adapter: SpreadsheetAdapter | undefined,
  worker: Worker | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false,
  generation = 0;
let workerTimeout: ReturnType<typeof setTimeout> | undefined;
const record = computed(() => (lesson ? state.records[lesson.id] : undefined));
const currentLesson = computed(() => {
  if (!lesson) return undefined;
  return exerciseLesson(lesson, variant.value);
});
const chapter = computed(() =>
  chapters.find((c) => c.number === lesson?.chapter),
);
function changed() {
  if (!ready.value) return;
  revision.value++;
  result.value = undefined;
  traceData.value = undefined;
  saved.value = "正在保存…";
  clearTimeout(timer);
  timer = setTimeout(() => void persist(), 600);
}
async function persist() {
  if (!lesson || !adapter || disposed) return;
  const r: LearningRecord = {
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    completed: record.value?.completed ?? false,
    mastered: record.value?.mastered ?? false,
    hintsViewed: hintCount.value,
    draft: adapter.snapshot(),
    variant: variant.value,
    updatedAt: new Date().toISOString(),
  };
  await save(r);
  saved.value = state.storageError ? "保存未成功" : "已保存到本机";
}
async function initialize(draft?: any) {
  if (!lesson || !host.value) return;
  ready.value = false;
  adapter?.dispose();
  await nextTick();
  const snapshot = draft ?? makeWorkbook(lesson);
  if (!draft && variant.value >= 0)
    for (const c of lesson.variants[variant.value].changes)
      put(snapshot, c.sheet, c.cell, c.value);
  adapter = new SpreadsheetAdapter(
    host.value,
    snapshot,
    changed,
    (sheet, range, value) => {
      traceSheet.value = sheet;
      quickCell.value = range;
      quickValue.value = value;
    },
  );
  await adapter.wait();
  ready.value = true;
  quickCell.value = lesson.targets[0]?.cell ?? "A2";
  traceSheet.value = lesson.targets[0]?.sheet ?? lesson.sheets[0].id;
  adapter.focus(traceSheet.value, quickCell.value);
  traceCell.value = quickCell.value;
  opRange.value = lesson.operation?.range ?? "";
}
onMounted(async () => {
  window.addEventListener("pagehide", flushOnClose);
  if (!lesson) return;
  try {
    if (!state.loaded) await load();
    if (disposed) return;
    const r = record.value;
    hintCount.value = r?.hintsViewed ?? 0;
    variant.value = r?.variant ?? -1;
    if (variant.value >= lesson.variants.length) variant.value = -1;
    usedHelp.value = hintCount.value > 0;
    await initialize(r?.lessonVersion === lesson.version ? r.draft : undefined);
    if (r && r.lessonVersion !== lesson.version)
      saved.value = "课程已更新，完成记录保留，本关从新数据开始。";
  } catch (e) {
    error.value = String(e);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("pagehide", flushOnClose);
  clearTimeout(timer);
  clearTimeout(workerTimeout);
  if (adapter && lesson) void persist();
  disposed = true;
  generation++;
  worker?.terminate();
  adapter?.dispose();
});
function flushOnClose() {
  if (ready.value) void persist();
}
async function check() {
  if (!adapter || !currentLesson.value || busy.value) return;
  busy.value = true;
  error.value = "";
  const version = revision.value;
  const run = ++generation;
  try {
    await adapter.wait();
    if (version !== revision.value) {
      busy.value = false;
      return;
    }
    if (lesson!.operation) {
      finish(
        gradeOperation(
          lesson!.operation,
          adapter.operationState(lesson!.operation),
          version,
          lesson!.sheets,
        ),
      );
      return;
    }
    worker?.terminate();
    worker = new GradeWorker();
    workerTimeout = setTimeout(() => {
      worker?.terminate();
      busy.value = false;
      error.value = "检查超时，作答已保留。请再试一次。";
    }, 20000);
    worker.onerror = () => {
      clearTimeout(workerTimeout);
      busy.value = false;
      error.value = "检查未完成，作答已保留。请重新检查。";
    };
    worker.onmessage = (e) => {
      clearTimeout(workerTimeout);
      if (run === generation) finish(e.data.result);
    };
    worker.postMessage({
      id: run,
      lesson: currentLesson.value,
      snapshot: adapter.snapshot(),
      revision: version,
    });
  } catch (e) {
    busy.value = false;
    error.value = `计算没有完成：${String(e)}`;
  }
}
function finish(r: GradeResult) {
  busy.value = false;
  if (r.revision !== revision.value) {
    error.value = "检查期间表格发生了修改，请检查最新作答。";
    return;
  }
  result.value = r;
  if (r.status === "passed" && lesson) {
    state.records[lesson.id] = passedRecord(
      {
        lessonId: lesson.id,
        lessonVersion: lesson.version,
        completed: !!record.value?.completed,
        mastered: !!record.value?.mastered,
        hintsViewed: hintCount.value,
        updatedAt: new Date().toISOString(),
      },
      variant.value,
      usedHelp.value,
    );
  }
  void persist();
}
function showHint() {
  tab.value = "hint";
  hintCount.value = Math.min(4, hintCount.value + 1);
  usedHelp.value = true;
  void persist();
}
function showSolution() {
  solutionOpen.value = !solutionOpen.value;
  usedHelp.value = true;
  hintCount.value = 4;
  void persist();
}
async function reset() {
  resetOpen.value = false;
  result.value = undefined;
  revision.value++;
  await initialize();
  await persist();
}
async function changeData() {
  if (!lesson?.variants.length) return;
  variant.value = (variant.value + 1) % lesson.variants.length;
  hintCount.value = 0;
  usedHelp.value = false;
  solutionOpen.value = false;
  result.value = undefined;
  revision.value++;
  await initialize();
  await persist();
}
async function returnOriginal() {
  variant.value = -1;
  await reset();
}
function trace() {
  if (!adapter) return;
  try {
    traceData.value = adapter.trace(traceSheet.value, traceCell.value);
    adapter.focus(traceSheet.value, traceCell.value);
  } catch {
    error.value = "请输入有效的单元格地址，例如 D2。";
  }
}
function write() {
  try {
    const destination = quickCell.value;
    traceSheet.value =
      adapter?.api.getActiveWorkbook().getActiveSheet().getSheetId() ??
      traceSheet.value;
    adapter?.write(traceSheet.value, destination, quickValue.value);
    adapter?.focus(traceSheet.value, destination);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "写入未成功，请检查单元格地址和内容。";
  }
}
async function fillDown() {
  try {
    traceSheet.value =
      adapter?.api.getActiveWorkbook().getActiveSheet().getSheetId() ??
      traceSheet.value;
    await adapter?.fillDown(traceSheet.value, quickCell.value);
  } catch (e) {
    error.value = String(e);
  }
}
async function applyOperation() {
  try {
    await adapter?.operate(lesson!.operation!, {
      category: category.value,
      ascending: ascending.value,
      range: opRange.value,
      threshold: threshold.value,
      values: values.value,
      reject: reject.value,
    });
    changed();
  } catch (e) {
    error.value = `设置未应用：${String(e)}`;
  }
}
</script>
<template>
  <main v-if="lesson" class="workshop">
    <div class="workshop-heading">
      <RouterLink to="/" class="back-link"
        ><ArrowLeft :size="16" />课程地图</RouterLink
      ><span
        >{{ String(lesson.chapter).padStart(2, "0") }} {{ chapter?.name }}
        <span class="muted"
          >/ 第 {{ ((lesson.number - 1) % 5) + 1 }} 关</span
        ></span
      ><span class="save-state" aria-live="polite">{{
        saved || "本机自动存档"
      }}</span>
    </div>
    <div class="workshop-body">
      <aside class="task-panel">
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
          <button class="text-button" @click="returnOriginal">
            返回原始任务
          </button>
        </div>
        <div class="task-goal">
          <span class="mini-label">这次要做的事</span>
          <p>{{ lesson.goal }}</p>
          <div class="target-tags">
            <button
              v-for="t in lesson.targets"
              @click="adapter?.focus(t.sheet, t.cell)"
              :title="'定位到 ' + t.cell"
            >
              {{ lesson.sheets.find((s) => s.id === t.sheet)?.name }}!{{
                t.cell
              }}
            </button>
          </div>
        </div>
        <div class="task-actions">
          <button
            class="button primary"
            :disabled="!ready || busy"
            @click="check"
          >
            <Check :size="17" />{{ busy ? "正在检查…" : "检查作答" }}</button
          ><button class="button subtle" @click="showHint">
            <Lightbulb :size="17" />查看提示
          </button>
        </div>
        <div v-if="error" role="alert" class="feedback error">{{ error }}</div>
        <section
          v-if="result"
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
        <div class="task-bottom">
          <button
            :disabled="!lesson.variants.length || !ready"
            @click="changeData"
          >
            <Shuffle :size="16" />换一批数据</button
          ><button @click="resetOpen = true">
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
      <section class="sheet-panel">
        <div class="sheet-heading">
          <span class="sheet-title"
            ><i />{{ variant >= 0 ? "换一批数据 · " : ""
            }}{{ lesson.sheets[0].name }}</span
          ><span class="muted">浅黄色单元格是本次填写位置</span
          ><button
            class="icon-label"
            @click="tab = tab === 'trace' ? '' : 'trace'"
          >
            <Search :size="16" />结果追踪
          </button>
        </div>
        <div class="entry-bar">
          <label
            >单元格
            <input
              v-model="quickCell"
              aria-label="单元格地址"
              class="address-input" /></label
          ><span class="fx">fx</span
          ><input
            v-model="quickValue"
            aria-label="输入公式或数值"
            placeholder="在这里输入公式，或双击表格中的单元格"
            @keydown.enter="write"
          /><button @click="write" :disabled="!ready">写入</button>
        </div>
        <div class="learning-toolbar">
          <button @click="adapter?.api.undo()" :disabled="!ready">↶ 撤销</button
          ><button @click="adapter?.api.redo()" :disabled="!ready">
            ↷ 重做</button
          ><template v-if="lesson.number >= 7"
            ><span>选中含首行公式的区域</span
            ><button @click="fillDown" :disabled="!ready">
              ↓ 向下填充
            </button></template
          ><span class="toolbar-note"
            >{{ quickCell
            }}<template v-if="quickValue"> · {{ quickValue }}</template></span
          >
        </div>
        <div ref="host" class="spreadsheet" aria-label="可编辑工作簿" />
        <div v-if="!ready" class="sheet-loading">正在打开工作簿…</div>
        <div class="sheet-footer">
          <span>双击编辑 · Enter 确认 · Ctrl+Z 撤销 · 拖动选区右下角填充</span
          ><button
            class="text-button"
            @click="tab = tab === 'hint' ? '' : 'hint'"
          >
            提示与解法
          </button>
        </div>
        <div v-if="lesson.operation" class="operation-tools">
          <strong>{{
            lesson.operation.kind === "sort-filter"
              ? "排序与筛选"
              : lesson.operation.kind === "format"
                ? "条件格式"
                : "数据验证"
          }}</strong
          ><template v-if="lesson.operation.kind === 'sort-filter'"
            ><label
              >{{ lesson.operation.filter.label
              }}<select
                v-model="category"
                :aria-label="lesson.operation.filter.label"
              >
                <option
                  v-for="choice in lesson.operation.filter.choices"
                  :key="choice"
                >
                  {{ choice }}
                </option>
              </select></label
            ><label
              >{{ lesson.operation.sort.label
              }}<select v-model="ascending">
                <option :value="true">从小到大</option>
                <option :value="false">从大到小</option>
              </select></label
            ></template
          ><template v-else
            ><label>范围<input v-model="opRange" aria-label="应用范围" /></label
            ><label v-if="lesson.operation.kind === 'format'"
              >小于<input type="number" v-model="threshold" /></label
            ><template v-else
              ><label
                >允许的值<input
                  v-model="values"
                  placeholder="用逗号分隔" /></label
              ><label
                ><input type="checkbox" v-model="reject" />拒绝其他值</label
              ></template
            ></template
          ><button class="button subtle" @click="applyOperation">
            应用到表格
          </button>
        </div>
      </section>
      <aside v-if="tab" class="help-panel">
        <div class="help-heading">
          <h2>{{ tab === "trace" ? "结果从哪里来" : "卡住了？一起拆开看" }}</h2>
          <button class="icon-button" aria-label="关闭侧栏" @click="tab = ''">
            <X :size="19" />
          </button>
        </div>
        <template v-if="tab === 'hint'"
          ><p class="muted">提示不会扣分。先看一个线索，再回表格试试。</p>
          <article
            v-for="(h, i) in lesson.hints.slice(0, hintCount)"
            :key="i"
            class="hint"
          >
            <span class="mini-label">提示 {{ i + 1 }}</span>
            <p>{{ h }}</p>
          </article>
          <button v-if="hintCount < 4" class="button subtle" @click="showHint">
            {{ hintCount ? "再给一个提示" : "看第一个提示" }}</button
          ><button class="text-button solution-toggle" @click="showSolution">
            {{ solutionOpen ? "收起解法" : "查看完整解法与说明" }}
          </button>
          <div v-if="solutionOpen">
            <article v-for="s in lesson.solutions" class="solution">
              <h3>{{ s.title }}</h3>
              <div v-for="(formula, key) in s.cells">
                <small>{{ key }}</small
                ><code>{{ formula }}</code>
              </div>
              <p>{{ s.explanation }}</p>
            </article>
            <p v-if="lesson.operation">
              {{ lesson.goal }} 使用表格下方的设置，应用后观察表格，再点击检查。
            </p>
            <p v-if="variant >= 0" class="muted">
              以上是原始任务的解法，请根据这份数据检查引用。
            </p>
          </div></template
        ><template v-else
          ><p>选择结果单元格，查看公式里实际引用的区域。</p>
          <label
            >工作表<select v-model="traceSheet">
              <option v-for="s in lesson.sheets" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          ><label>单元格<input v-model="traceCell" /></label
          ><button class="button subtle" @click="trace">追踪结果</button
          ><template v-if="traceData"
            ><code class="trace-formula">{{
              traceData.formula || "这里没有公式。"
            }}</code>
            <div
              v-for="(n, i) in traceData.references"
              :key="i"
              class="reference-chip"
            >
              ↳ {{ n.token
              }}<small>{{
                n.values
                  .flat()
                  .map((v: any) => v ?? "空白")
                  .join("、")
              }}</small>
            </div>
            <div v-if="traceData.rows.length" class="match-rows">
              <strong>哪些行参与了结果</strong>
              <p v-for="r in traceData.rows">
                第 {{ r.row }} 行 · {{ r.included ? "计入" : "未计入" }} ·
                {{ r.value }}
              </p>
            </div>
            <p class="tiny muted">
              这里列出引擎解析到的直接引用；嵌套函数的计算过程请结合公式和表格查看。
            </p></template
          ></template
        >
      </aside>
    </div>
    <div v-if="resetOpen" class="modal-backdrop">
      <section
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
      >
        <h2 id="reset-title">重新做这份任务？</h2>
        <p>当前草稿会恢复为初始数据，已完成的记录保留。</p>
        <div class="task-actions">
          <button class="button subtle" @click="resetOpen = false">
            保留草稿</button
          ><button class="button primary" @click="reset">重新开始</button>
        </div>
      </section>
    </div>
  </main>
  <main v-else class="page-width">
    <h1>没有找到这项任务</h1>
    <RouterLink to="/">回到课程地图</RouterLink>
  </main>
</template>
