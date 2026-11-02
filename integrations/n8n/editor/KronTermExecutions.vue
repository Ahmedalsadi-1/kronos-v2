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
    void refresh();
  }
);
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
</style>
