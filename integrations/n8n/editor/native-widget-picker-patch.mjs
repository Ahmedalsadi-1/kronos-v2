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
