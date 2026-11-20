// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { patchPenChatDefault } from "./patch-runtime.mjs";

const source = `function render(tW,tU,tw){
  const label={id:"sidebar.chatFullscreen.backToCanvas",defaultMessage:"Back to canvas"};
  (0,X.useEffect)(()=>{tw&&!tU&&tk(!1)},[tw,tU]);
  return label;
}`;

function mount(v2) {
  const changes = [];
  const started = { current: false };
  const listeners = new Map();
  const sidebar = [];
  const window = { __kronosV2: v2, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener() {} };
  const render = runInNewContext(patchPenChatDefault(source) + "\nrender", {
    window,
    X: { useRef: () => started, useState: () => [false, () => {}], useEffect: (effect) => effect() },
    tk: (value) => changes.push(value),
    ti: (value) => sidebar.push(value),
  });
  return { render, changes, window, listeners, sidebar };
}

test("full chat waits for readiness and opens only once, allowing canvas navigation", () => {
  const { render, changes } = mount(true);
  assert.equal(render(false, false, false).defaultMessage, "Open canvas");
  assert.deepEqual(changes, []);
  render(true, false, false);
  assert.deepEqual(changes, [true]);
  render(true, true, true);
  render(true, false, false);
  render(false, false, false);
  render(true, false, false);
  assert.deepEqual(changes, [true]);
});

test("other Pen workspaces retain their startup behavior", () => {
  const { render, changes, window } = mount(false);
  render(true, false, false);
  assert.deepEqual(changes, []);
  assert.equal(window.__kronosShowFullChat, undefined);
});

test("a workspace can reveal full chat after the user opens the canvas", () => {
  const { render, changes, window } = mount(true);
  render(true, false, false);
  render(true, false, false);
  window.__kronosShowFullChat();
  assert.deepEqual(changes, [true, true]);
});

test("the patch rejects changed or ambiguous lifecycle anchors", () => {
  assert.equal(patchPenChatDefault("unrelated"), "unrelated");
  assert.throws(() => patchPenChatDefault(source.replace("[tw,tU]", "[]")), /lifecycle changed/);
  assert.throws(() => patchPenChatDefault(source + source), /lifecycle changed/);
});


test("canvas chat closes full chat and the sidebar so the composer becomes a pill", () => {
  const { render, changes, listeners, sidebar } = mount(true);
  render(true, true, false);
  listeners.get("kronos:canvas-chat")();
  assert.deepEqual(changes, [true, false]);
  assert.deepEqual(sidebar, [false]);
});
