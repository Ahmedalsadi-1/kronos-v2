// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

async function fixture() {
  const root = { toLocal: (x, y) => ({ x, y }), children: [] };
  const graph = new EventEmitter();
  graph.nodes = new Set();
  graph.updateLayout = () => {};
  graph.getViewportNode = () => root;
  const remove = (node) => {
    node.destroyed = true;
    graph.nodes.delete(node);
    graph.emit("nodeRemoved", node);
  };
  const insert = (node) => {
    node.destroyed = false;
    node.parent = root;
    graph.nodes.add(node);
    graph.emit("nodeAdded", node);
  };
  graph.beginUpdate = () => ({
    update(node, values) {
      Object.assign(node.properties.resolved, values);
      for (const key of Object.keys(values)) graph.emit("nodePropertyChange", node, key);
    },
    deleteNode: remove,
    addNode: insert,
    changeParent(node, parent) {
      node.parent = parent;
      graph.emit("nodePropertyChange", node, "parent");
    },
  });
  graph.commitBlock = () => {};
  graph.rollbackBlock = () => {};
  graph.deserializePastedNode = (_variables, _theme, update, data) => {
    const values = { ...data, enabled: data.enabled !== false, rotation: 0 };
    const node = {
      properties: { resolved: values },
      children: [],
      getWorldBounds: () => ({ x: values.x, y: values.y, width: values.width, height: values.height }),
      getWorldMatrix: () => ({ tx: values.x, ty: values.y }),
    };
    update.addNode(node, root);
    return node;
  };
  const eventEmitter = new EventEmitter();
  const selectedNodes = new Set();
  const scene = {
    scenegraph: graph,
    eventEmitter,
    requestFrame() {},
    selectionManager: {
      selectedNodes,
      selectNode(node) {
        selectedNodes.clear();
        selectedNodes.add(node);
        eventEmitter.emit("selectionChange");
      },
      findNodeAtWorldPosition: () => [...graph.nodes][0],
    },
    containerBounds: { x: 0, y: 0 },
    camera: { toWorld: (x, y) => ({ x, y }) },
  };
  const listeners = {};
  const document = {
    addEventListener: (name, fn) => (listeners[name] = fn),
    removeEventListener: (name) => delete listeners[name],
  };
  const window = {};
  runInNewContext(await readFile(new URL("./widget-host.js", import.meta.url), "utf8"), {
    window,
    Map,
    Set,
    Number,
    JSON,
    queueMicrotask,
    fetch,
  });
  const events = [];
  const bridge = window.createKronosPenWidgets(
    scene,
    (event) => events.push(JSON.parse(JSON.stringify(event))),
    document
  );
  const widget = { blockId: "canonical", title: "Terminal", x: 100, y: 200, width: 400, height: 300, visible: true };
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  return { scene, graph, bridge, events, widget, listeners, insert, remove, flush };
}

test("native changes and deletion undo preserve one canonical live identity", async () => {
  const f = await fixture();
  f.bridge.sync({ widgets: [f.widget] });
  await f.flush();
  assert.equal(f.events.length, 0);
  const node = [...f.graph.nodes][0];
  f.graph.beginUpdate().update(node, { x: 240, y: 320 });
  await f.flush();
  assert.equal(f.events.at(-1).widgets[0].x, 240);
  const count = f.events.length;
  f.bridge.sync({ widgets: f.events.at(-1).widgets.map((w) => ({ ...w, title: "Terminal" })) });
  await f.flush();
  assert.equal(f.events.length, count);
  f.remove(node);
  await f.flush();
  assert.equal(f.events.at(-1).widgets[0].visible, false);
  f.bridge.sync({ widgets: f.events.at(-1).widgets.map((w) => ({ ...w, title: "Terminal" })) });
  assert.equal(f.graph.nodes.size, 0);
  f.insert(node);
  await f.flush();
  assert.equal(f.events.at(-1).widgets[0].visible, true);
  assert.equal(f.graph.nodes.size, 1);
  f.scene.selectionManager.selectNode(node);
  await f.flush();
  assert.deepEqual(f.events.at(-1).selectedBlockIds, ["canonical"]);
  f.bridge.sync({ widgets: [] });
  await f.flush();
  assert.equal(f.graph.nodes.size, 0);
  f.bridge.dispose();
});

test("invalid identity lists cannot mutate graph and copies cannot own another live mount", async () => {
  const f = await fixture();
  assert.throws(() => f.bridge.sync({ widgets: [f.widget, f.widget] }), /Invalid/);
  assert.equal(f.graph.nodes.size, 0);
  f.bridge.sync({ widgets: [f.widget] });
  const original = [...f.graph.nodes][0];
  const tx = f.graph.beginUpdate();
  const copy = f.graph.deserializePastedNode(
    null,
    null,
    tx,
    { ...f.widget, metadata: { type: "kronos-live-widget", blockId: "canonical" } },
    null
  );
  await f.flush();
  assert.equal(copy.properties.resolved.metadata.type, "kronos-widget-reference");
  assert.equal(original.properties.resolved.metadata.type, "kronos-live-widget");
  assert.equal(f.events.length, 0);
  f.bridge.dispose();
});

test("Enter activates the native selection and controls never activate widgets behind them", async () => {
  const f = await fixture();
  f.bridge.sync({ widgets: [f.widget], selectedBlockId: "canonical" });
  await f.flush();
  const target = { closest: () => null };
  let stopped = false;
  f.listeners.keydown({
    key: "Enter",
    target,
    preventDefault() {},
    stopImmediatePropagation() {
      stopped = true;
    },
  });
  assert.deepEqual(f.events.at(-1), { type: "widget-interact", blockId: "canonical" });
  assert.equal(stopped, true);
  const count = f.events.length;
  f.listeners.dblclick({ button: 0, clientX: 150, clientY: 250, target: { closest: () => ({}) } });
  assert.equal(f.events.length, count);
  f.listeners.keydown({ key: "Escape", target });
  assert.equal(f.events.at(-1).blockId, null);
  f.scene.stateManager = { state: { currentSlide: [...f.graph.nodes][0] } };
  stopped = false;
  f.listeners.keydown({ key: "Enter", target, stopImmediatePropagation: () => (stopped = true) });
  assert.equal(stopped, false);
  assert.equal(f.events.at(-1).blockId, null);
  f.bridge.dispose();
});

test("slide previews use current widget images without mutating or serializing the frame", async () => {
  const f = await fixture();
  f.bridge.sync({ widgets: [f.widget] });
  const node = [...f.graph.nodes][0];
  const before = JSON.stringify(node.properties.resolved);
  let refreshed = 0;
  f.scene.eventEmitter.on("kronos-widget-preview", () => refreshed++);
  await f.bridge.updatePreviews({
    previews: [{ blockId: "canonical", dataUrl: "data:image/png;base64,YQ==", width: 100, height: 80 }],
  });
  const thumbnail = await node.getThumbnail();
  assert.equal(thumbnail.width, 100);
  assert.equal(await thumbnail.blob.text(), "a");
  assert.equal(JSON.stringify(node.properties.resolved), before);
  assert.equal(refreshed, 1);
  await assert.rejects(
    f.bridge.updatePreviews({
      previews: [{ blockId: "canonical", dataUrl: "https://example.com/image", width: 100, height: 80 }],
    }),
    /Invalid widget preview/
  );
  f.bridge.dispose();
  assert.equal(node.getThumbnail, undefined);
});
