import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { patchNativeComposition } from "./native-patches.mjs";
const sources = path.dirname(fileURLToPath(import.meta.url));
const editor = path.resolve(sources, "../upstream/packages/frontend/editor-ui");
const files = [
  "app/layouts/BaseLayout.vue",
  "app/App.vue",
  "app/stores/ui.utils.ts",
  "app/stores/ui.store.ts",
  "app/composables/useExposeCssVar.ts",
  "app/init/toastNotifier.ts",
  "app/composables/useKeybindings.ts",
  "app/composables/useBackendStatus.ts",
  "../../@n8n/stores/src/versions.store.ts",
  "app/composables/useHistoryHelper.ts",
  "../../@n8n/composables/src/useClipboard.ts",
  "features/shared/nodeCreator/nodeCreator.store.ts",
  "../../@n8n/composables/src/useStyles.ts",
  "../../@n8n/design-system/src/composables/useMessage.ts",
  "features/workflows/canvas/components/WorkflowCanvas.vue",
  "app/layouts/WorkflowLayout.vue",
  "app/components/app/AppLayout.vue",
  "app/components/MainHeader/MainHeader.vue",
  "app/views/NodeView.vue",
  "features/ndv/shared/views/NodeDetailsView.vue",
  "features/shared/nodeCreator/views/NodeCreation.vue",
  "features/workflows/canvas/components/Canvas.vue",
];
test("native host patches can be repeated without accumulating handlers or template attributes", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "native-editor-patch-"));
  const fixtureEditor = path.join(fixture, "editor-ui");
  try {
    for (const filename of files) {
      const target = path.join(fixtureEditor, "src", filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(editor, "src", filename), target);
    }
    patchNativeComposition(fixtureEditor, sources);
    const nodeView = fs.readFileSync(path.join(fixtureEditor, "src/app/views/NodeView.vue"), "utf8");
    assert.match(nodeView, /nativeWorkflowHost\?\.focusTarget \|\| nativeWorkflowHost\?\.detailTarget/);
    const details = fs.readFileSync(path.join(fixtureEditor, "src/features/ndv/shared/views/NodeDetailsView.vue"), "utf8");
    assert.match(details, /nativeDetailsRole === 'workflow' && nativeWorkflowHost\?\.focusTarget/);
    const first = files.map((filename) => fs.readFileSync(path.join(fixtureEditor, "src", filename), "utf8"));
    patchNativeComposition(fixtureEditor, sources);
    files.forEach((filename, index) =>
      assert.equal(fs.readFileSync(path.join(fixtureEditor, "src", filename), "utf8"), first[index], filename)
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
