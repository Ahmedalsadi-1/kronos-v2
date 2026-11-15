// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { patchPenRuntime } from "./patch-runtime.mjs";

const source = await readFile(new URL("./commands-host.js", import.meta.url), "utf8");

async function makeHost() {
  const window = {};
  runInNewContext(source, { window, queueMicrotask });
  const emitted = [];
  const ran = [];
  const telemetry = [];
  const eventEmitter = new EventEmitter();
  const config = Object.assign(new EventEmitter(), {
    data: { snapToObjects: true },
    set(key, value) {
      this.data[key] = value;
      this.emit("change");
    },
  });
  const entries = [
    { id: "align-left", kind: 0, label: "Align left", categoryLabel: "Arrange", action: { id: "align-left" } },
    { id: "frame-tool", kind: 0, label: "Frame", categoryLabel: "Tools", action: { id: "frame-tool" } },
    {
      id: "setting-snapToObjects",
      kind: 1,
      label: "Snap to objects",
      categoryLabel: "Settings",
      setting: "snapToObjects",
    },
    { id: "unoffered", kind: 0, label: "Unavailable scope", action: { id: "unoffered" } },
  ];
  const availability = { "align-left": 0, "frame-tool": 2, "setting-snapToObjects": 2 };
  const scene = {
    eventEmitter,
    config,
    actions: { run: (action, options) => ran.push({ action, options }) },
    telemetry: (...args) => telemetry.push(args),
  };
  const input = new Map();
  const engine = {
    addEventListener: (type, callback) => input.set(type, callback),
    removeEventListener: (type) => input.delete(type),
    __kronosPenCommands: {
      entries: () => entries,
      isOffered: (_scene, entry) => entry.id !== "unoffered",
      availability: (_scene, entry) => availability[entry.id],
      label: (_scene, entry) => entry.label,
      shortcut: (entry) => (entry.id === "frame-tool" ? ["F"] : []),
      formatMessage: (message) => message.defaultMessage,
    },
  };
  const originalEmit = eventEmitter.emit;
  const host = window.createKronosPenCommands(scene, engine, (message) => emitted.push(message));
  await Promise.resolve();
  return { host, emitted, ran, telemetry, scene, availability, originalEmit, input };
}

test("exposes every offered native command with current availability, shortcuts, and toggle state", async () => {
  const { host, emitted, scene, availability } = await makeHost();
  const commands = host.get().commands;
  assert.equal(commands.length, 3);
  assert.equal(commands[0].enabled, false);
  assert.deepEqual(Array.from(commands[1].shortcut), ["F"]);
  assert.equal(commands[2].checked, true);
  assert.equal(commands[2].keepOpen, true);
  availability["align-left"] = 2;
  scene.eventEmitter.emit("actionStateChangeDebounced");
  await Promise.resolve();
  assert.equal(emitted.at(-1).commands[0].enabled, true);
  host.dispose();
});

test("runs the actual action with native palette provenance and rechecks availability", async () => {
  const { host, ran, availability } = await makeHost();
  assert.throws(() => host.run({ id: "align-left" }), /unavailable/);
  assert.throws(() => host.run({ id: "unoffered" }), /not available/);
  host.run({ id: "frame-tool" });
  assert.equal(ran[0].action.id, "frame-tool");
  assert.equal(ran[0].options.source, 2);
  availability["frame-tool"] = 1;
  assert.throws(() => host.run({ id: "frame-tool" }), /View only/);
  host.dispose();
});

test("runs native checkbox settings and routes palette/settings triggers without opening duplicate UI", async () => {
  const { host, emitted, scene, telemetry, originalEmit } = await makeHost();
  host.run({ id: "setting-snapToObjects" });
  assert.equal(scene.config.data.snapToObjects, false);
  assert.equal(telemetry[0][1].source, "command-palette");
  let nativeCalls = 0;
  scene.eventEmitter.on("uiCommand", () => nativeCalls++);
  scene.eventEmitter.emit("uiCommand", 0);
  assert.equal(emitted.at(-1).type, "command-palette-open");
  scene.eventEmitter.emit("uiCommand", 1);
  assert.equal(emitted.at(-1).type, "open-settings");
  assert.equal(nativeCalls, 0);
  scene.eventEmitter.emit("uiCommand", 2);
  assert.equal(nativeCalls, 1);
  host.dispose();
  assert.equal(scene.eventEmitter.emit, originalEmit);
  assert.equal(scene.eventEmitter.listenerCount("actionStateChangeDebounced"), 0);
  assert.throws(() => host.run({ id: "frame-tool" }), /closed/);
});

test("patches the native catalog builder and preview subscription with version guards", () => {
  const builder =
    "function(e){let t=[],a=new Set;for(let s of(0,T.DDD)()){t.push(s)}return fr(e,t,a,g4.GX,T.LxM.AgentChat),t.sort((e,t)=>e.category-t.category),t}";
  const fixture = `let t=a1.i.isElectron||a1.i.isBrowser&&!e.isEmbed,[a]=(0,X.useState)(()=>t?new T.JbF(ipc,localStorage):void 0);function fc({inputRef:e,setOpen:t}){return (${builder})(intl)};d.eventEmitter.on("document-modified",e),()=>{d.eventEmitter.off("document-modified",e)}`;
  const result = patchPenRuntime(fixture);
  assert.equal(result.patched, false);
  assert.equal(result.commandsPatched, true);
  assert.equal(result.previewsPatched, true);
  assert.ok(result.source.includes(`entries:()=>(${builder})((0,L.UX)())`));
  assert.ok(result.source.includes('d.eventEmitter.on("kronos-widget-preview",e)'));
  assert.ok(result.source.includes('d.eventEmitter.off("kronos-widget-preview",e)'));
  assert.throws(() => patchPenRuntime(result.source), /already patched/);
  assert.throws(() => patchPenRuntime(fixture + fixture), /ambiguous/);
  assert.throws(() => patchPenRuntime("function fc({inputRef:e,setOpen:t}){}"), /changed/);
});

test("the KronOS launcher shortcut works while focus stays inside the native iframe", async () => {
  const { host, emitted, input } = await makeHost();
  let prevented = false;
  let stopped = false;
  input.get("keydown")({
    code: "Space",
    shiftKey: true,
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    preventDefault: () => (prevented = true),
    stopImmediatePropagation: () => (stopped = true),
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(emitted.at(-1).type, "command-palette-open");
  host.dispose();
  assert.equal(input.size, 0);
});
