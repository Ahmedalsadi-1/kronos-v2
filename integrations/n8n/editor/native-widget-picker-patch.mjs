// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function applyNativeWidgetPicker(editor) {
  fs.copyFileSync(
    fileURLToPath(new URL("./NativeWorkspaceWidgetSlot.vue", import.meta.url)),
    path.join(editor, "src/NativeWorkspaceWidgetSlot.vue")
  );
  fs.copyFileSync(
    fileURLToPath(new URL("./native-widget-connection.mjs", import.meta.url)),
    path.join(editor, "src/kronterm-native-widget-connection.mjs")
  );
  const canvasFile = path.join(editor, "src/features/workflows/canvas/components/Canvas.vue");
  if (fs.existsSync(canvasFile)) {
    let canvas = fs.readFileSync(canvasFile, "utf8");
    if (!canvas.includes("dispatchNativeWidgetConnection(event")) {
      const marker = "function onConnectEnd(event?: MouseEvent) {";
      if (!canvas.includes(marker)) throw new Error("Original connection-end handler changed.");
      canvas = canvas.replace(
        '<script setup lang="ts">',
        '<script setup lang="ts">\nimport { dispatchNativeWidgetConnection } from "@/kronterm-native-widget-connection.mjs";'
      );
      canvas = canvas.replace(
        marker,
        marker +
          "\n  if (!connectedHandle.value) dispatchNativeWidgetConnection(event, (window as any).__KRONTERM_WORKFLOW_HOST__, connectingHandle.value);"
      );
      fs.writeFileSync(canvasFile, canvas);
    }
  }
  const file = path.join(editor, "src/features/shared/nodeCreator/components/Panel/NodesListPanel.vue");
  let source = fs.readFileSync(file, "utf8");
  if (source.includes("<NativeWorkspaceWidgetSlot")) return;
  const marker = '<div :class="$style.renderedItems">';
  if (!source.includes(marker) || !source.includes('<script setup lang="ts">'))
    throw Error("Original node picker result layout changed.");
  source = source.replace(
    '<script setup lang="ts">',
    '<script setup lang="ts">\nimport NativeWorkspaceWidgetSlot from "@/NativeWorkspaceWidgetSlot.vue";'
  );
  source = source.replace(
    marker,
    marker +
      '\n<NativeWorkspaceWidgetSlot v-if="!isActionsMode && !isAgentsMode && !communityNodeDetails" :query="activeViewStack.search" />'
  );
  fs.writeFileSync(file, source);
}
