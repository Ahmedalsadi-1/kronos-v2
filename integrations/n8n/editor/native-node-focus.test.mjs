import assert from "node:assert/strict";
import { test } from "node:test";
import { bindNativeNodeEditor, focusNativeNode } from "./native-node-focus.mjs";
const bodyEvent = () => ({ button: 0, target: { closest: () => null } });
test("body selection reaches OS before original parameter activation and switches the existing editor", () => {
  const events = [];
  const draft = { parameters: { answer: 42 } };
  let active;
  const host = { onSelection: (id) => events.push("selection:" + id) };
  const activate = (id) => {
    events.push("activate:" + id);
    active = id;
  };
  assert.equal(focusNativeNode(bodyEvent(), "first", host, activate), true);
  assert.equal(focusNativeNode(bodyEvent(), "next", host, activate), true);
  assert.equal(active, "next");
  assert.deepEqual(events, ["selection:first", "activate:first", "selection:next", "activate:next"]);
  const unbind = bindNativeNodeEditor(host, () => {
    active = null;
  });
  host.closeNodeEditor();
  assert.equal(active, null);
  assert.deepEqual(draft.parameters, { answer: 42 });
  unbind();
  assert.equal(host.closeNodeEditor, undefined);
});
test("drag, port controls, modifier selection, nonparameter nodes and standalone clicks do not open parameters", () => {
  let activations = 0;
  const activate = () => activations++;
  const host = {};
  for (const options of [{ dragging: true }, { nonParameterNode: true }, { suppressInteraction: true }])
    assert.equal(focusNativeNode(bodyEvent(), "node", host, activate, options), false);
  for (const property of ["ctrlKey", "metaKey", "shiftKey", "altKey", "defaultPrevented"])
    assert.equal(focusNativeNode({ ...bodyEvent(), [property]: true }, "node", host, activate), false);
  const port = {
    closest: (selector) => {
      assert.ok(selector.includes(".vue-flow__handle"));
      return {};
    },
  };
  assert.equal(focusNativeNode({ button: 0, composedPath: () => [port] }, "node", host, activate), false);
  assert.equal(focusNativeNode(bodyEvent(), "node", null, activate), false);
  assert.equal(activations, 0);
});
test("stale editor disposal cannot remove a replacement focus callback", () => {
  const host = {};
  const old = bindNativeNodeEditor(host, () => {});
  let closed = false;
  bindNativeNodeEditor(host, () => {
    closed = true;
  });
  old();
  host.closeNodeEditor();
  assert.equal(closed, true);
});

test("readonly node selection opens the original activation path without changing permissions", () => {
  const options = { readOnly: true };
  const transitions = [];
  const host = { onSelection: (id) => transitions.push(["selected", id]) };
  const originalActivate = (id) => transitions.push(["originalActivate", id]);
  assert.equal(focusNativeNode(bodyEvent(), "readonly-node", host, originalActivate, options), true);
  assert.deepEqual(transitions, [
    ["selected", "readonly-node"],
    ["originalActivate", "readonly-node"],
  ]);
  assert.equal(options.readOnly, true);
});

test("live widget binding uses original insertion with first-class blockId and reports actual node id", async () => {
  const { bindNativeWidgetInsertion } = await import("./native-node-focus.mjs");
  const host = { workflowId: "flow" };
  let inserted;
  const unbind = bindNativeWidgetInsertion(
    host,
    () => true,
    async (node) => {
      inserted = node;
      return { id: "created" };
    }
  );
  assert.deepEqual(await host.insertWidgetNode({ workflowId: "flow", blockId: "block", label: "My terminal" }), {
    nodeId: "created",
  });
  assert.equal(inserted.type, "CUSTOM.kronTermWidget");
  assert.deepEqual(inserted.parameters, { operation: "widget_get_state", blockId: "block", arguments: "{}" });
  unbind();
  assert.equal(host.insertWidgetNode, undefined);
});
test("widget insertion rejects read-only, wrong workflow and unsuccessful original creation", async () => {
  const { bindNativeWidgetInsertion } = await import("./native-node-focus.mjs");
  const host = { workflowId: "flow" };
  let edits = 0;
  bindNativeWidgetInsertion(
    host,
    () => false,
    () => {
      edits++;
    }
  );
  await assert.rejects(host.insertWidgetNode({ workflowId: "flow", blockId: "block" }), /read only/);
  bindNativeWidgetInsertion(
    host,
    () => true,
    () => {
      edits++;
    }
  );
  await assert.rejects(host.insertWidgetNode({ workflowId: "other", blockId: "block" }), /not valid/);
  assert.equal(edits, 0);
  await assert.rejects(host.insertWidgetNode({ workflowId: "flow", blockId: "block" }), /could not be created/);
});

test("keeps the captured source port when a configured widget is finally inserted", async () => {
  const { bindNativeWidgetInsertion } = await import("./native-node-focus.mjs");
  const host = { workflowId: "flow" };
  let source = { nodeId: "start", handleId: "outputs/main/1" };
  let received;
  bindNativeWidgetInsertion(host, () => true, async (_node, from) => { received = from; return { id: "added" }; }, () => ({ ...source }));
  const captured = host.getWidgetConnectionSource();
  source = { nodeId: "different", handleId: "outputs/main/0" };
  await host.insertWidgetNode({ workflowId: "flow", blockId: "browser", source: captured, parameters: { operation: "browser_open_links", urls: "https://example.com" } });
  assert.deepEqual(received, { nodeId: "start", handleId: "outputs/main/1" });
});
