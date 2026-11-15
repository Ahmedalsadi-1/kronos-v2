// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { patchPenRuntime } from "./patch-runtime.mjs";

test("the vendor hook fails closed on ambiguous and already patched snapshots", () => {
  const marker = "let k=this._sceneManager,x=new xG(this._sceneManager);";
  assert.equal(patchPenRuntime("unrelated chunk").patched, false);
  const patched = patchPenRuntime(marker);
  assert.equal(patched.patched, true);
  assert.match(patched.source, /window\.__kronosPenScene=k/);
  assert.throws(() => patchPenRuntime(marker + marker), /ambiguous/);
  assert.throws(() => patchPenRuntime(patched.source), /already patched/);
});

test("only native design frames qualify as slides", () => {
  const marker = 'isSlideFrame(e){return"frame"===e.type&&e.parent===this.sceneManager.scenegraph.getViewportNode()}';
  const patched = patchPenRuntime(marker);
  assert.equal(patched.slidesPatched, true);
  assert.throws(() => patchPenRuntime(marker + marker), /ambiguous/);
  const viewport = {};
  const manager = runInNewContext(`({${patched.source}})`);
  manager.sceneManager = { scenegraph: { getViewportNode: () => viewport } };
  const frame = { type: "frame", parent: viewport, properties: { resolved: {} } };
  assert.equal(manager.isSlideFrame(frame), true);
  assert.equal(manager.isSlideFrame({ ...frame, properties: { resolved: { metadata: { type: "kronos-live-widget" } } } }), false);
});

test("native camera coordinates align with live widgets and host updates do not echo", async () => {
  const messages = [];
  const frameEvents = {};
  const documentEvents = {};
  const windowEvents = {};
  const cameraEvents = new Map();
  const camera = {
    zoom: 2,
    left: 10,
    top: 20,
    screenWidth: 1000,
    screenHeight: 700,
    screenInsets: [40, 200, 60, 50],
    toScreen() {
      return { x: -this.left * this.zoom, y: -this.top * this.zoom };
    },
    centerOffsetX(zoom) {
      return (50 + 750 / 2) / zoom;
    },
    centerOffsetY(zoom) {
      return (40 + 600 / 2) / zoom;
    },
    on(name, callback) {
      cameraEvents.set(name, callback);
    },
    off(name) {
      cameraEvents.delete(name);
    },
    endAnimation() {},
    setView(x, y, zoom) {
      this.zoom = zoom;
      this.left = x - this.centerOffsetX(zoom);
      this.top = y - this.centerOffsetY(zoom);
      cameraEvents.get("change")();
    },
  };
  const scene = { camera, containerBounds: { x: 3, y: 7 }, getBackgroundColor: () => [0, 0, 0, 1] };
  const doc = {
    documentElement: { style: { setProperty() {} } },
    getElementById: () => ({ textContent: "" }),
    addEventListener: (name, callback) => {
      documentEvents[name] = callback;
    },
    removeEventListener() {},
  };
  const frame = {
    contentWindow: { __kronosPenScene: scene, addEventListener() {} },
    contentDocument: doc,
    getBoundingClientRect: () => ({ x: 5, y: 11 }),
    addEventListener: (name, callback) => {
      frameEvents[name] = callback;
    },
  };
  const parent = { postMessage: (data) => messages.push(data) };
  const context = {
    localStorage: { getItem: () => "declined" },
    location: { search: "?workspace=test", protocol: "http:", origin: "http://localhost" },
    document: { getElementById: () => frame },
    window: {
      createKronosPenWidgets: () => ({ dispose() {} }),
      addEventListener: (name, callback) => {
        windowEvents[name] = callback;
      },
    },
    parent,
    URLSearchParams,
    Map,
    JSON,
    Number,
    Date,
    matchMedia: () => ({ matches: false }),
    indexedDB: { open: () => ({}) },
    setTimeout,
    clearTimeout,
  };
  runInNewContext(await readFile(new URL("./editor-host.js", import.meta.url), "utf8"), context);
  frameEvents.load();
  const initial = JSON.parse(JSON.stringify(messages.pop()));
  assert.deepEqual(initial.camera, { x: -12, y: -22, zoom: 2 });
  assert.deepEqual(initial.viewport, { x: 58, y: 58, width: 750, height: 600 });
  await windowEvents.message({
    origin: "http://localhost",
    source: parent,
    data: {
      source: "kronos-pen-host",
      id: "set",
      method: "set_camera",
      params: { x: 100, y: 200, zoom: 0.5 },
    },
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "set");
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].result.camera)), { x: 100, y: 200, zoom: 0.5 });
  messages.length = 0;
  camera.left += 10;
  cameraEvents.get("change")();
  assert.equal(messages[0].type, "camera");
  assert.equal(messages[0].camera.x, 95);
  documentEvents.pointerdown({ clientX: 100, clientY: 100 });
  assert.equal(messages.at(-1).type, "canvas-interaction");
  const length = messages.length;
  documentEvents.pointerdown({ clientX: 20, clientY: 100 });
  assert.equal(messages.length, length);
  await windowEvents.message({
    origin: "http://localhost",
    source: parent,
    data: {
      source: "kronos-pen-host",
      id: "bad",
      method: "set_camera",
      params: { x: 0, y: 0, zoom: NaN },
    },
  });
  assert.match(messages.at(-1).error, /Invalid canvas camera/);
});

test("readiness waits for both native port and scene in either startup order", async () => {
  for (const sceneFirst of [false, true]) {
    const messages = [];
    const frameEvents = {};
    const nativeEvents = {};
    const parentEvents = {};
    let channel;
    const viewport = {};
    const sceneEvents = {};
    const scene = {
      stateManager: { state: {} },
      scenegraph: { getViewportNode: () => viewport },
      slidesManager: { isSlideFrame: (node) => node.type === "frame" && !node.properties.resolved.metadata },
      eventEmitter: { on: (name, callback) => (sceneEvents[name] = callback), off() {} },
      camera: {
        zoom: 1,
        screenWidth: 1000,
        screenHeight: 700,
        screenInsets: [0, 0, 0, 0],
        toScreen: () => ({ x: 0, y: 0 }),
        on() {},
        off() {},
        endAnimation() {},
        centerOffsetX: () => 500,
        centerOffsetY: () => 350,
        setView() {},
      },
      containerBounds: { x: 0, y: 0 },
      getBackgroundColor: () => [0, 0, 0, 1],
    };
    const nativeWindow = { addEventListener: (name, callback) => (nativeEvents[name] = callback), postMessage() {} };
    const frame = {
      contentWindow: nativeWindow,
      contentDocument: {
        documentElement: { style: { setProperty() {} } },
        getElementById: () => ({ textContent: "" }),
        querySelector: () => null,
        addEventListener() {},
        removeEventListener() {},
      },
      getBoundingClientRect: () => ({ x: 0, y: 0 }),
      addEventListener: (name, callback) => (frameEvents[name] = callback),
    };
    const parent = { postMessage: (data) => messages.push(data) };
    const context = {
      localStorage: { getItem: () => "declined" },
      location: { search: sceneFirst ? "?workspace=kronos-v2:test" : "", protocol: "http:", origin: "http://localhost" },
      document: { getElementById: () => frame },
      window: {
        createKronosPenWidgets: () => ({ dispose() {}, sync: () => ({ success: true }) }),
        addEventListener: (name, callback) => (parentEvents[name] = callback),
      },
      MessageChannel: class {
        constructor() {
          channel = this;
          this.port1 = { postMessage() {}, close() {} };
          this.port2 = {};
        }
      },
      parent,
      URLSearchParams,
      Map,
      JSON,
      Number,
      Date,
      matchMedia: () => ({ matches: false }),
      indexedDB: { open: () => ({}) },
      setTimeout,
      clearTimeout,
    };
    runInNewContext(await readFile(new URL("./editor-host.js", import.meta.url), "utf8"), context);
    frameEvents.load();
    const attachScene = () => {
      nativeWindow.__kronosPenScene = scene;
      nativeEvents["kronos-pen-scene-ready"]();
    };
    if (sceneFirst) attachScene();
    await parentEvents.message({ origin: "http://localhost", source: nativeWindow, data: { type: "pen:ready" } });
    if (!sceneFirst) {
      await channel.port1.onmessage({ data: { kind: "ready" } });
      assert.equal(messages.filter((message) => message.type === "ready").length, 0);
      await parentEvents.message({
        origin: "http://localhost",
        source: parent,
        data: { source: "kronos-pen-host", id: "connect-before-scene", method: "connect" },
      });
      assert.equal(messages.at(-1).result.ready, false);
      attachScene();
    } else {
      assert.equal(messages.filter((message) => message.type === "ready").length, 0);
      await channel.port1.onmessage({ data: { kind: "ready" } });
    }
    assert.equal(messages.filter((message) => message.type === "ready").length, 1);
    const liveFrame = {
      type: "frame",
      parent: viewport,
      properties: { resolved: { metadata: { type: "kronos-live-widget", blockId: "browser" } } },
    };
    assert.equal(scene.slidesManager.isSlideFrame(liveFrame), sceneFirst);
    assert.equal(scene.slidesManager.isSlideFrame({ ...liveFrame, parent: {} }), false);
    if (sceneFirst) {
      scene.stateManager.state.currentSlide = liveFrame;
      sceneEvents.stateChange();
      assert.equal(messages.at(-1).type, "presentation");
      assert.equal(messages.at(-1).blockId, "browser");
      scene.stateManager.state.currentSlide = undefined;
      sceneEvents.stateChange();
      assert.equal(messages.at(-1).active, false);
    }
    for (const method of ["get_camera", "sync_widgets"]) {
      await parentEvents.message({
        origin: "http://localhost",
        source: parent,
        data: { source: "kronos-pen-host", id: method, method, params: { widgets: [] } },
      });
      assert.equal(messages.at(-1).error, undefined);
      assert.ok(messages.at(-1).result);
    }
    await parentEvents.message({
      origin: "http://localhost",
      source: parent,
      data: { source: "kronos-pen-host", method: "connect" },
    });
    assert.equal(messages.filter((message) => message.type === "ready").length, 2);
  }
});
