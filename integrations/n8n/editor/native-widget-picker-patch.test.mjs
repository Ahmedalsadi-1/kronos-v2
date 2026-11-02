import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { applyNativeWidgetPicker } from "./native-widget-picker-patch.mjs";
test("places live widget entries in the original scrolling results, uses original search, and patches idempotently", () => {
  const editor = fs.mkdtempSync(path.join(os.tmpdir(), "native-widget-picker-"));
  const relative = "src/features/shared/nodeCreator/components/Panel/NodesListPanel.vue";
  try {
    const file = path.join(editor, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(new URL("../upstream/packages/frontend/editor-ui/" + relative, import.meta.url), file);
    applyNativeWidgetPicker(editor);
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /renderedItems">\s*<NativeWorkspaceWidgetSlot/);
    assert.match(source, /:query="activeViewStack.search"/);
    assert.match(source, /v-if="!isActionsMode && !isAgentsMode && !communityNodeDetails"/);
    const slot = fs.readFileSync(path.join(editor, "src/NativeWorkspaceWidgetSlot.vue"), "utf8");
    assert.match(slot, /tabId: host.tabId/);
    assert.match(slot, /onBeforeUnmount/);
    assert.match(slot, /previousTarget: target.value/);
    applyNativeWidgetPicker(editor);
    assert.equal(fs.readFileSync(file, "utf8"), source);
  } finally {
    fs.rmSync(editor, { recursive: true, force: true });
  }
});
