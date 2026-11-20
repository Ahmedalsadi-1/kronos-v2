import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("./shell-host.js", import.meta.url), "utf8");

test("the titlebar hides editor sign-in while preserving the KronOS account control", () => {
  const dom = new JSDOM('<div data-titlebar-right="true"><button>Sign In</button></div>', {
    runScripts: "outside-only", pretendToBeVisual: true,
  });
  const { window } = dom;
  window.eval(source);
  const shell = window.createKronosPenShell({ ipc: {} }, () => {}, window.document, { workspaceId: "main" });
  try {
    const editor = window.document.querySelector("button");
    assert.equal(editor.hidden, true);
    assert.ok(editor.hasAttribute("data-kronos-pen-editor-account"));
    assert.ok(window.document.querySelector("[data-kronos-pen-system-controls]"));
  } finally {
    shell.dispose();
    window.close();
  }
});

function setup() {
  const events = [],
    notifications = [],
    handlers = new Map();
  let refresh,
    scheduled,
    dialogs = [];
  const view = {
    innerWidth: 1000,
    innerHeight: 800,
    MutationObserver: class {
      constructor(callback) {
        refresh = callback;
      }
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame(callback) {
      scheduled = callback;
      return 1;
    },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ visibility: "visible" }),
    CSS: { supports: () => false },
  };
  const document = {
    defaultView: view,
    head: { append() {} },
    body: {},
    documentElement: { removeAttribute() {} },
    createElement: () => ({ remove() {} }),
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === "[data-kronos-pen-action]" ? [] : dialogs),
    addEventListener: (name, callback) => handlers.set(name, callback),
    removeEventListener: (name) => handlers.delete(name),
  };
  const scene = { ipc: { handleNotification: (data) => notifications.push(data) } };
  const sandbox = { window: {}, document };
  vm.runInNewContext(source, sandbox);
  const shell = sandbox.window.createKronosPenShell(scene, (data) => events.push(data), document, {
    workspaceId: "main",
  });
  return {
    shell,
    events,
    notifications,
    handlers,
    setDialogs(value) {
      dialogs = value;
      scheduled?.();
      refresh();
      scheduled?.();
    },
  };
}

test("dashboard uses actual workspace IDs and escaped appearance previews", () => {
  const { shell, notifications } = setup();
  shell.setContext({
    workspaceId: "main",
    workspaceName: "Main",
    spaces: [
      { id: "main", title: "Main <test>" },
      { id: "other/space", title: "Other" },
    ],
    widgets: [{ blockId: "browser" }],
  });
  const docs = shell.handleRequest("documents-list");
  assert.equal(docs.length, 3);
  assert.equal(docs[0].name, "Main <test>");
  assert.equal(docs[0].kind, 0);
  assert.equal(docs[0].kronosWorkspace, true);
  assert.equal(docs[1].uri, "file:///kronos/other%2Fspace/untitled.pen");
  assert.match(decodeURIComponent(docs[0].preview.url), /Main &lt;test&gt;/);
  assert.equal(docs[2].kind, 2);
  assert.equal(docs[2].uri, "kronos://design-system/main");
  assert.equal(notifications[0].method, "dashboard:documents-changed");
  assert.equal(shell.handleRequest("unknown"), undefined);
  shell.dispose();
});

test("opening and creating delegate to KronOS; deletion cannot silently destroy a workspace", () => {
  const { shell, events } = setup();
  shell.setContext({ workspaceId: "main", spaces: [{ id: "main" }, { id: "other" }] });
  shell.handleRequest("documents-open", { uri: "file:///kronos/other/untitled.pen" });
  assert.equal(events.at(-1).workspaceId, "other");
  assert.equal(events.at(-1).type, "open-workspace");
  shell.handleRequest("documents-new");
  assert.equal(events.at(-1).type, "new-workspace");
  assert.throws(
    () => shell.handleRequest("documents-remove", { uris: ["file:///kronos/main/untitled.pen"] }),
    /Manage workspaces/
  );
  assert.throws(
    () => shell.handleRequest("documents-open", { uri: "https://unrelated.example" }),
    /no longer available/
  );
  assert.equal(shell.handleRequest("documents-list").length, 3);
});

test("native dialog visibility occludes live content and cleanup restores it", () => {
  const { shell, events, setDialogs } = setup();
  setDialogs([{ getAttribute: () => "open", getBoundingClientRect: () => ({ width: 400, height: 300 }) }]);
  assert.equal(events.at(-1).type, "native-overlay");
  assert.equal(events.at(-1).open, true);
  shell.dispose();
  assert.equal(events.at(-1).open, false);
});

test("native Settings routes to KronOS settings without opening another dialog", () => {
  const { shell, handlers, events } = setup();
  let prevented = false,
    stopped = false;
  handlers.get("click")({
    target: { closest: () => ({ getAttribute: () => "Settings", dataset: {} }) },
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    },
  });
  assert.equal(events.at(-1).type, "open-settings");
  assert.ok(prevented && stopped);
  shell.dispose();
  assert.equal(handlers.size, 0);
});

test("the Pen chat handle detaches above the dock and snaps back on return", () => {
  const { handlers, shell } = setup();
  let floating = false;
  let x = 0;
  let y = 0;
  const panel = {
    toggleAttribute: (name, value) => {
      if (name === "data-kronos-floating-chat") floating = value;
    },
    removeAttribute() {},
    querySelector: () => null,
    style: {
      setProperty: (_name, value) => { [x, y] = value.split(" ").map(Number.parseFloat); },
      removeProperty: () => { x = y = 0; },
    },
    getBoundingClientRect: () => ({ left: 250 + x, right: 750 + x, top: 720 + y, bottom: 790 + y }),
  };
  const handle = { closest: () => panel, setPointerCapture() {} };
  const event = (type, clientY, clientX = 500) => ({
    type, clientX, clientY, button: 0, pointerId: 1,
    target: { closest: (selector) => selector === "[data-agent-spotlight]" ? panel : handle }, preventDefault() {},
  });
  handlers.get("pointerdown")(event("pointerdown", 722));
  handlers.get("pointermove")(event("pointermove", 522));
  handlers.get("pointerup")(event("pointerup", 522));
  assert.equal(floating, true);
  assert.equal(y, -200);
  handlers.get("pointerdown")(event("pointerdown", 522));
  handlers.get("pointermove")(event("pointermove", 722, 650));
  handlers.get("pointerup")(event("pointerup", 722, 650));
  assert.equal(floating, true);
  handlers.get("pointerdown")(event("pointerdown", 722, 650));
  handlers.get("pointermove")(event("pointermove", 722, 500));
  handlers.get("pointerup")(event("pointerup", 722, 500));
  assert.equal(floating, false);
  assert.equal(y, 0);
  shell.dispose();
});

test("dragging the centered voice orb down reveals chat without ending voice", () => {
  const dom = new JSDOM(`<aside data-pencil-allow-canvas-clipboard style="width: var(--left-panel-width)"></aside>
    <aside data-slot="card"><div data-kronos-pen-inspector-slot></div></aside>
    <main aria-label="Chat" data-chat-fullscreen><div class="absolute"><div class="group"><div class="relative">
    <div data-kronos-pen-composer-controls="chat"></div>
    </div></div></div></main>`, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const chat = document.querySelector("[data-chat-fullscreen]");
  const sidebar = document.querySelector("[data-pencil-allow-canvas-clipboard]");
  const inspector = document.querySelector('[data-slot="card"]');
  let sidebarWidth = 280;
  let inspectorWidth = 200;
  sidebar.getBoundingClientRect = () => ({ left: 0, right: sidebarWidth, width: sidebarWidth, height: 600 });
  inspector.getBoundingClientRect = () => ({
    left: window.innerWidth - inspectorWidth, right: window.innerWidth, width: inspectorWidth, height: 600,
  });
  chat.getBoundingClientRect = () => ({ left: 40, right: 340, width: 300, top: 100, bottom: 500, height: 400 });
  const slot = document.querySelector("[data-kronos-pen-composer-controls]");
  slot.getClientRects = () => [{ width: 100, height: 30 }];
  slot.kronosControls = {};
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.eval(source);
  const events = [];
  const shell = window.createKronosPenShell({ ipc: {} }, (event) => events.push(event), document, {
    workspaceId: "main",
  });
  try {
    slot.querySelector('[aria-label="Start voice conversation"]').click();
    shell.updateComposerVoice({ conversationId: "chat", active: true, phase: "listening" });
    const layer = document.querySelector("[data-kronos-pen-voice-panel][data-active]");
    const button = layer.querySelector("button");
    assert.equal(layer.parentElement, document.body);
    assert.ok(document.documentElement.hasAttribute("data-kronos-pen-voice-focused"));
    assert.equal(layer.style.getPropertyValue("--orb-center-x"), `${window.innerWidth / 2 + 40}px`);
    assert.equal(layer.style.getPropertyValue("--orb-room"), `${window.innerWidth - 480}px`);
    sidebarWidth = 0;
    window.dispatchEvent(new window.Event("resize"));
    assert.equal(layer.style.getPropertyValue("--orb-center-x"), `${window.innerWidth / 2 - 100}px`);
    inspectorWidth = 0;
    window.dispatchEvent(new window.Event("resize"));
    assert.equal(layer.style.getPropertyValue("--orb-center-x"), `${window.innerWidth / 2}px`);
    sidebarWidth = 340;
    inspectorWidth = 200;
    document.documentElement.setAttribute("data-kronos-chat-split", "");
    window.dispatchEvent(new window.Event("resize"));
    assert.equal(layer.style.getPropertyValue("--orb-center-x"), "190px");
    assert.equal(layer.style.getPropertyValue("--orb-center-y"), "300px");
    assert.equal(layer.style.getPropertyValue("--orb-room"), "300px");
    const pointer = (type, y) => {
      const event = new window.MouseEvent(type, { clientY: y, button: 0, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: 1 });
      button.dispatchEvent(event);
    };
    pointer("pointerdown", 300);
    pointer("pointermove", 380);
    pointer("pointerup", 380);
    button.dispatchEvent(new window.MouseEvent("click", { detail: 1, bubbles: true }));
    assert.ok(layer.hasAttribute("data-docked"));
    assert.ok(!document.documentElement.hasAttribute("data-kronos-pen-voice-focused"));
    assert.equal(events.filter(({ type }) => type === "composer-voice").length, 1);
    button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    assert.ok(!layer.hasAttribute("data-docked"));
    button.click();
    assert.equal(events.filter(({ type }) => type === "composer-voice").length, 2);
    shell.updateComposerVoice({ conversationId: "chat", active: false });
    assert.ok(!layer.isConnected);
    assert.ok(!document.documentElement.hasAttribute("data-kronos-pen-voice-focused"));
  } finally {
    shell.dispose();
    window.close();
  }
});

test("the Pen dev toolbar toggles Pi and reports both harness timings", () => {
  const dom = new JSDOM('<div data-kronos-pen-composer-controls="chat"></div>', {
    url: "http://localhost:9124/pen/editor/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const slot = window.document.querySelector("[data-kronos-pen-composer-controls]");
  slot.getClientRects = () => [{ width: 100, height: 30 }];
  window.eval(source);
  const shell = window.createKronosPenShell({ ipc: {} }, () => {}, window.document, { workspaceId: "main" });
  try {
    const tools = slot.querySelector('[aria-label="Hermes chat tools"]');
    const pi = tools.nextElementSibling;
    assert.equal(pi.getAttribute("aria-pressed"), "false");
    assert.equal(tools.hidden, false);
    assert.equal(slot.querySelector('[aria-label="OpenCode"], [aria-label="Codex CLI"]'), null);
    pi.click();
    assert.equal(slot.dataset.kronosPenAgent, "pi");
    assert.equal(pi.getAttribute("aria-pressed"), "true");
    shell.updateComposerAgentTiming({ conversationId: "chat", agent: "Pi", milliseconds: 550 });
    shell.updateComposerAgentTiming({ conversationId: "chat", agent: "Hermes", milliseconds: 900 });
    pi.click();
    assert.equal(slot.dataset.kronosPenAgent, "hermes");
    assert.match(pi.title, /Pi 0\.55s to first text.*Hermes 0\.90s to first text/);
  } finally {
    shell.dispose();
    window.close();
  }
});
