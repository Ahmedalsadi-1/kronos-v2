<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, useTemplateRef } from "vue";
const host = (window as any).__KRONTERM_WORKFLOW_HOST__;
const role = inject("kronterm:surface-role", "root");
const root = useTemplateRef("root");
const header = useTemplateRef<HTMLElement>("header");
let observer: ResizeObserver;
const emit = defineEmits<{ mounted: [Element] }>();
onMounted(() => {
  if (root.value) emit("mounted", root.value);
  if (header.value) {
    const measure = () =>
      host.setCssVar?.("--kronterm-workflow-header-height", header.value?.getBoundingClientRect().height + "px");
    observer = new ResizeObserver(measure);
    observer.observe(header.value);
    measure();
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div
    ref="root"
    style="height: 100%"
    :class="['kronterm-native-frame', 'kronterm-native-' + role]"
    :data-workflow-panel="role === 'management' ? '' : undefined"
  >
    <template v-if="role === 'management'">
      <slot name="header" /><slot name="sidebar" /><slot /><slot name="footer" /><slot name="aside" /><slot
        name="overlays"
      />
    </template>
    <template v-else>
      <Teleport v-if="host.chromeTarget && role === 'workflow'" :to="host.headerTarget || host.chromeTarget">
        <div ref="header" class="kronterm-workflow-header" data-workflow-panel><slot name="header" /></div>
      </Teleport>
      <slot />
      <Teleport v-if="host.detailTarget" :to="host.detailTarget"><slot name="overlays" /></Teleport>
      <slot v-if="role === 'workflow'" name="aside" />
      <Teleport v-if="host.chromeTarget && role === 'workflow'" :to="host.logsTarget || host.chromeTarget">
        <div class="kronterm-workflow-logs" data-workflow-panel><slot name="footer" /></div>
      </Teleport>
    </template>
  </div>
</template>
<style>
.kronterm-native-frame {
  width: 100%;
  height: 100%;
  background: transparent;
  pointer-events: none;
}
.kronterm-native-workflow {
  position: absolute;
  inset: 0;
}
.kronterm-native-management {
  pointer-events: auto;
  height: 100%;
}
.kronterm-workflow-header {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  --navbar--height: 32px;
  pointer-events: auto;
  background: var(--color-black, #000);
  border: 0;
  border-bottom: 1px solid var(--color--foreground);
  border-radius: 0;
  overflow: visible;
}
.kronterm-workflow-logs {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  width: auto;
  --logs-panel--header-height: 28px;
  pointer-events: auto;
}
.kronterm-native-frame > main,
.kronterm-native-frame > div {
  background: transparent;
}
</style>

<style>
.kronterm-workflow-header .tab-bar-container {position:static;transform:none;justify-content:flex-start;padding:2px 6px;min-height:32px;}
.kronterm-workflow-header [data-test-id="workflow-menu"] {min-width:0;}
</style>
