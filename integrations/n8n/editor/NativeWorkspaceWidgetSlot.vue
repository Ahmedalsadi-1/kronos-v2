<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ query?: string }>();
const host = inject("kronterm:surface-role", "root") === "workflow" ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;
const target = ref<HTMLElement>();
function publish() {
  if (!host?.tabId || !target.value) return;
  window.dispatchEvent(
    new CustomEvent("kronterm:workflow-widget-picker-target", {
      detail: { tabId: host.tabId, target: target.value, query: props.query || "" },
    })
  );
}
onMounted(publish);
watch(() => props.query, publish, { flush: "post" });
onBeforeUnmount(() => {
  if (host?.tabId)
    window.dispatchEvent(
      new CustomEvent("kronterm:workflow-widget-picker-target", {
        detail: { tabId: host.tabId, target: null, previousTarget: target.value, query: "" },
      })
    );
});
</script>
<template>
  <div v-if="host" ref="target" data-workspace-widget-slot style="flex-shrink: 0; min-width: 0; width: 100%" />
</template>
