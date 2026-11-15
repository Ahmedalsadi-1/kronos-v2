import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./shell-host.js", import.meta.url), "utf8");
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
