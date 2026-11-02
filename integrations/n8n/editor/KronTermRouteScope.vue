<script setup lang="ts">
import { computed, inject, provide, shallowReactive, watch } from "vue";
import { routeLocationKey, routerViewLocationKey } from "vue-router";
import { WorkflowDocumentStoreKey, WorkflowIdKey } from "@/app/constants/injectionKeys";
const props = defineProps<{ route: any; role: "workflow" | "management" }>();
const route = shallowReactive({ ...props.route });
watch(
  () => props.route,
  (value) => Object.assign(route, value)
);
provide(routeLocationKey, route as any);
provide(
  routerViewLocationKey,
  computed(() => props.route)
);
provide("kronterm:surface-role", props.role);
provide(
  WorkflowIdKey,
  computed(() => String(props.route.params?.workflowId || ""))
);
if (props.role === "management") {
  const document = inject(WorkflowDocumentStoreKey);
  if (document) provide(WorkflowDocumentStoreKey, document);
}
</script>
<template><slot /></template>
