<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import WorkflowLayout from "@/app/layouts/WorkflowLayout.vue";
import DefaultLayout from "@/app/layouts/DefaultLayout.vue";
import SettingsLayout from "@/app/layouts/SettingsLayout.vue";
import KronTermRouteScope from "./KronTermRouteScope.vue";
const host = (window as any).__KRONTERM_WORKFLOW_HOST__;
const route = useRoute();
const router = useRouter();
const isEditorRoute = (value: any) => value.meta.layout === "workflow" && value.meta.nodeView === true;
const workflowRoute = shallowRef(
  isEditorRoute(route) ? router.currentRoute.value : router.resolve("/workflow/" + (host.workflowId || "new"))
);
watch(
  () => router.currentRoute.value,
  (value) => {
    if (isEditorRoute(value)) workflowRoute.value = value;
  }
);
const managementOpen = computed(() => !isEditorRoute(route));
watch(
  managementOpen,
  (open) => {
    host.managementOpen.value = open;
  },
  { immediate: true }
);
const managementLayout = computed(() =>
  route.meta.layout === "settings" ? SettingsLayout : route.meta.layout === "workflow" ? WorkflowLayout : DefaultLayout
);
function closeManagement() {
  void router.push(workflowRoute.value.fullPath);
}
</script>
<template>
  <KronTermRouteScope :route="workflowRoute" role="workflow"><WorkflowLayout /></KronTermRouteScope>
  <Teleport v-if="managementOpen && host.detailTarget" :to="host.detailTarget">
    <section class="kronterm-management" aria-label="Workflow details" data-workflow-panel>
      <button
        class="kronterm-close-management"
        type="button"
        aria-label="Close workflow details"
        @click="closeManagement"
      >
        ×
      </button>
      <KronTermRouteScope :route="router.currentRoute.value" role="management"
        ><component :is="managementLayout"
      /></KronTermRouteScope>
    </section>
  </Teleport>
</template>
<style>
.kronterm-management {
  position: absolute;
  inset: 8px;
  overflow: auto;
  pointer-events: auto;
  background: var(--color--background);
  color: var(--color--text);
  border: 1px solid var(--color--foreground);
  border-radius: 12px;
  box-shadow: 0 16px 48px #0003;
}
.kronterm-close-management {
  position: sticky;
  float: right;
  right: 12px;
  top: 8px;
  z-index: 100;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  background: var(--color--background);
  color: var(--color--text);
  font-size: 22px;
}
</style>
