import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { createWorldCore } from "./native-world-patch.mjs";
const sources = path.dirname(fileURLToPath(import.meta.url));
function loadOriginalKeyboard() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-keys-"));
  try {
    const core = "node_modules/@vue-flow/core/dist/vue-flow-core.mjs";
    fs.mkdirSync(path.dirname(path.join(fixture, core)), { recursive: true });
    fs.mkdirSync(path.join(fixture, "src"));
    fs.copyFileSync(path.resolve(sources, "../upstream/packages/frontend/editor-ui", core), path.join(fixture, core));
    createWorldCore(fixture, sources);
    const source = fs.readFileSync(path.join(fixture, "src/kronterm-vue-flow-core.mjs"), "utf8");
    const ast = ts.createSourceFile("core.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = new Set([
      "useKeyPress",
      "isInputDOMNode",
      "wasModifierPressed",
      "isKeyMatch",
      "createKeyPredicate",
      "useKeyOrCode",
    ]);
    const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
    assert.equal(functions.length, names.size);
    const listeners = [];
    const nativeWindow = { __KRONTERM_WORKFLOW_HOST__: { shouldHandleEvent: (event) => event.owned } };
    const context = {
      window: nativeWindow,
      inputTags: ["INPUT", "SELECT", "TEXTAREA"],
      defaultDoc: {},
      computed: (fn) => ({
        get value() {
          return fn();
        },
      }),
      toValue$1: (value) => (typeof value === "function" ? value() : (value?.value ?? value)),
      shallowRef: (value) => ({ value }),
      watch: (getter, callback) => callback(getter()),
      useEventListener() {},
      onKeyStroke: (filter, callback, options) => listeners.push({ filter, callback, type: options.eventName }),
    };
    const useKeyPress = vm.runInNewContext(
      functions.map((node) => node.getText(ast)).join("\n") + ";useKeyPress;",
      context
    );
    return {
      useKeyPress,
      nativeWindow,
      dispatch(event) {
        for (const item of listeners) if (item.type === event.type && item.filter(event)) item.callback(event);
      },
    };
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
function key(type, key, owned) {
  return {
    type,
    key,
    code: key === " " ? "Space" : key,
    owned,
    target: { nodeName: "DIV" },
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    composedPath() {
      return [this.target];
    },
  };
}
test("actual original key helper leaves OS widget keys untouched and releases modifiers across focus changes", () => {
  const engine = loadOriginalKeyboard();
  const pressed = engine.useKeyPress(" ");
  const outside = key("keydown", " ", false);
  engine.dispatch(outside);
  assert.equal(outside.prevented, false);
  assert.equal(pressed.value, false);
  const inside = key("keydown", " ", true);
  engine.dispatch(inside);
  assert.equal(inside.prevented, true);
  assert.equal(pressed.value, true);
  engine.dispatch(key("keyup", " ", false));
  assert.equal(pressed.value, false);
});
test("outside widget event clears original chord state before returning to nodes", () => {
  const engine = loadOriginalKeyboard();
  const pressed = engine.useKeyPress("Control+a");
  engine.dispatch(key("keydown", "Control", true));
  engine.dispatch(key("keydown", "x", false));
  const incomplete = key("keydown", "a", true);
  engine.dispatch(incomplete);
  assert.equal(pressed.value, false);
  assert.equal(incomplete.prevented, false);
});
test("standalone original helper retains its existing matching behavior", () => {
  const engine = loadOriginalKeyboard();
  delete engine.nativeWindow.__KRONTERM_WORKFLOW_HOST__;
  const pressed = engine.useKeyPress(" ");
  const event = key("keydown", " ", false);
  engine.dispatch(event);
  assert.equal(event.prevented, true);
  assert.equal(pressed.value, true);
});
