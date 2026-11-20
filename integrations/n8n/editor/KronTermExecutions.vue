<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";
import WorkflowExecutionsSidebar from "@/features/execution/executions/components/workflow/WorkflowExecutionsSidebar.vue";
import { useExecutionsStore } from "@/features/execution/executions/executions.store";
import { injectWorkflowDocumentStore } from "@/app/stores/workflowDocument.store";
import type { ExecutionSummaryWithScopes } from "@/features/execution/executions/executions.types";
const props = defineProps<{ workflowId?: string }>();
const host = (window as any).__KRONTERM_WORKFLOW_HOST__;
const target = host?.executionTarget ?? ref(null);
const store = useExecutionsStore();
const document = injectWorkflowDocumentStore();
const workflow = computed(() => document?.value?.getSnapshot());
const rows = ref<ExecutionSummaryWithScopes[]>([]);
const error = ref("");
const draftError = ref("");
const creatingDraft = ref(false);
const selectedFailure = ref("");
const failures = computed(() => rows.value.filter((row) => row.status === "error" || row.status === "crashed"));
const failureId = computed(() => {
  const active = store.activeExecution?.id;
  return [selectedFailure.value, active].find((id) => failures.value.some((row) => row.id === id)) ?? failures.value[0]?.id;
});
let epoch = 0;
let interval: ReturnType<typeof setInterval>;
async function refresh() {
  const request = ++epoch;
  const id = props.workflowId;
  if (!id || id === "new") {
    rows.value = [];
    host?.onExecutionsChanged?.(false);
    return;
  }
  try {
    const result = await store.fetchExecutionsPage({ workflowId: id });
    if (request !== epoch || id !== props.workflowId) return;
    rows.value = result.results;
    error.value = "";
    host?.onExecutionsChanged?.(rows.value.length > 0);
  } catch (failure) {
    if (request === epoch) error.value = failure instanceof Error ? failure.message : "Could not load executions.";
  }
}
watch(
  () => props.workflowId,
  () => {
    rows.value = [];
    selectedFailure.value = "";
    draftError.value = "";
    void refresh();
  }
);
async function reproduce() {
  if (!props.workflowId || !failureId.value || creatingDraft.value) return;
  creatingDraft.value = true;
  draftError.value = "";
  try {
    await host.reproduceExecution(props.workflowId, failureId.value);
  } catch (failure) {
    draftError.value = failure instanceof Error ? failure.message : "Could not create the reproduction draft.";
  } finally {
    creatingDraft.value = false;
  }
}
onMounted(() => {
  void refresh();
  interval = setInterval(() => void refresh(), 5000);
});
onBeforeUnmount(() => {
  epoch++;
  clearInterval(interval);
});
</script>
<template>
  <Teleport v-if="target" :to="target">
    <section aria-label="Workflow executions" class="kronterm-executions" data-workflow-panel>
      <p v-if="error" role="alert">{{ error }}</p>
      <div v-if="host?.reproduceExecution && failureId" class="kronterm-execution-reproduce">
        <label v-if="failures.length > 1">
          <span>Failed execution</span>
          <select :value="failureId" :disabled="creatingDraft" @change="selectedFailure = ($event.target as HTMLSelectElement).value">
            <option v-for="failure in failures" :key="failure.id" :value="failure.id">#{{ failure.id }}</option>
          </select>
        </label>
        <button type="button" :disabled="creatingDraft" @click="reproduce">
          {{ creatingDraft ? "Creating draft…" : "Reproduce in draft" }}
        </button>
        <p v-if="draftError" role="alert">{{ draftError }}</p>
      </div>
      <WorkflowExecutionsSidebar
        :workflow="workflow"
        :executions="rows"
        :loading="false"
        :loading-more="false"
        :has-more="false"
        @load-more="refresh"
      />
    </section>
  </Teleport>
</template>
<style>
.kronterm-executions {
  height: 100%;
  width: 100%;
  pointer-events: auto;
  background: var(--color--background);
  color: var(--color--text);
  overflow: auto;
}
.kronterm-execution-reproduce {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: var(--border);
}
.kronterm-execution-reproduce label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.kronterm-execution-reproduce :is(button, select) {
  border: var(--border);
  border-radius: 6px;
  background: var(--color--background);
  color: var(--color--text);
  padding: 5px 8px;
  cursor: pointer;
}
.kronterm-execution-reproduce button:hover { background: var(--color--background--light-3); }
.kronterm-execution-reproduce button:disabled { opacity: .65; }
.kronterm-execution-reproduce p { flex-basis: 100%; margin: 0; }
</style>
