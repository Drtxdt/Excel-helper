<script setup lang="ts">
import { ref } from "vue";
import type { OperationGoal } from "../../types";
import type { OperationInput } from "../../operations";
const props = defineProps<{ goal: OperationGoal; ready: boolean }>();
const emit = defineEmits<{ apply: [input: OperationInput] }>();
const category = ref(
    props.goal.kind === "sort-filter" ? props.goal.filter.choices[0] : "",
  ),
  ascending = ref(true),
  opRange = ref(props.goal.range),
  threshold = ref(0),
  values = ref(""),
  reject = ref(false);
function apply() {
  emit("apply", {
    category: category.value,
    ascending: ascending.value,
    range: opRange.value,
    threshold: threshold.value,
    values: values.value,
    reject: reject.value,
  });
}
</script>
<template>
  <div class="operation-tools">
    <strong>{{
      goal.kind === "sort-filter"
        ? "排序与筛选"
        : goal.kind === "format"
          ? "条件格式"
          : "数据验证"
    }}</strong
    ><template v-if="goal.kind === 'sort-filter'"
      ><label
        >{{ goal.filter.label
        }}<select v-model="category" :aria-label="goal.filter.label">
          <option v-for="choice in goal.filter.choices" :key="choice">
            {{ choice }}
          </option>
        </select></label
      ><label
        >{{ goal.sort.label
        }}<select v-model="ascending">
          <option :value="true">从小到大</option>
          <option :value="false">从大到小</option>
        </select></label
      ></template
    ><template v-else
      ><label>范围<input v-model="opRange" aria-label="应用范围" /></label
      ><label v-if="goal.kind === 'format'"
        >小于<input type="number" v-model="threshold" /></label
      ><template v-else
        ><label
          >允许的值<input v-model="values" placeholder="用逗号分隔" /></label
        ><label
          ><input type="checkbox" v-model="reject" />拒绝其他值</label
        ></template
      ></template
    ><button class="button subtle" :disabled="!ready" @click="apply">
      应用到表格
    </button>
  </div>
</template>
