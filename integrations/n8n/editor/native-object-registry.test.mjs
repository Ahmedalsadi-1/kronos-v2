// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
const require = createRequire(new URL("../upstream/packages/frontend/editor-ui/package.json", import.meta.url));
const { effectScope, nextTick, ref, watch } = require("vue");
const builder = fs.readFileSync(new URL("../build-native-editor.mjs", import.meta.url), "utf8");
const watcher = builder.match(/watch\(\[graphNodes,[\s\S]*?\}, \{ deep: true, immediate: true \}\);/)?.[0];
assert.ok(watcher, "the builder installs the canonical and rendered graph registry watcher");

test("OS object registry republishes stable rendered nodes when canonical document IDs resolve", async () => {
  const graphNodes = ref([
    {
      id: "saved",
      position: { x: 20, y: 30 },
      computedPosition: { x: 120, y: 130 },
      dimensions: { width: 96, height: 96 },
      data: { name: "Web" },
    },
    { id: "preview", position: { x: 0, y: 0 }, data: {} },
  ]);
  const document = ref({ allNodes: [] });
  const snapshots = [];
  const token = Symbol();
  const host = { activeCanvasToken: token, onObjects: (objects) => snapshots.push(objects) };
  const scope = effectScope();
  try {
    scope.run(() =>
      new Function(
        "graphNodes",
        "workflowDocumentStore",
        "krontermHost",
        "canvasToken",
        "watch",
        `let objectSignature=''; ${watcher}`
      )(graphNodes, document, host, token, watch)
    );
    assert.deepEqual(snapshots, [[]]);
    document.value = { allNodes: [{ id: "saved" }] };
    await nextTick();
    assert.equal(snapshots.length, 2);
    assert.deepEqual(
      snapshots[1].map((node) => node.id),
      ["saved"]
    );
    assert.deepEqual(snapshots[1][0].position, { x: 120, y: 130 });
    graphNodes.value[0].computedPosition.y = -400;
    await nextTick();
    assert.equal(snapshots.at(-1)[0].position.y, -400);
    document.value.allNodes.splice(0);
    await nextTick();
    assert.deepEqual(snapshots.at(-1), []);
    host.activeCanvasToken = Symbol();
    document.value.allNodes.push({ id: "saved" });
    await nextTick();
    assert.deepEqual(snapshots.at(-1), []);
  } finally {
    scope.stop();
  }
});
