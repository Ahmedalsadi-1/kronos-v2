import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { handleInWorld, screenToWorld, worldToScreen } from "./native-world-geometry.mjs";
import { createWorldCore } from "./native-world-patch.mjs";
const sources = path.dirname(fileURLToPath(import.meta.url));
for (const zoom of [0.5, 1, 2]) {
  test(`OS camera ${zoom}: original node drag, note, and handle share world units`, () => {
    const viewport = { left: 53, top: 117 };
    const camera = { x: -83, y: 29, zoom };
    const node = { x: 420, y: -120 };
    const start = worldToScreen(node, camera, viewport);
    assert.deepEqual(screenToWorld(start, camera, viewport), node);
    const dragged = screenToWorld({ x: start.x + 100, y: start.y + 100 }, camera, viewport);
    assert.deepEqual(dragged, { x: node.x + 100 / zoom, y: node.y + 100 / zoom });
    const note = worldToScreen({ x: node.x + 80, y: node.y + 40 }, camera, viewport);
    assert.equal(note.x - start.x, 80 * zoom);
    assert.equal(note.y - start.y, 40 * zoom);
    const handle = { left: start.x + 96 * zoom, top: start.y + 40 * zoom, width: 16 * zoom, height: 16 * zoom };
    assert.deepEqual(handleInWorld(handle, { left: start.x, top: start.y }, zoom), {
      x: 96,
      y: 40,
      width: 16,
      height: 16,
    });
    const portScreen = worldToScreen({ x: node.x + 104, y: node.y + 48 }, camera, viewport);
    assert.equal(portScreen.x, handle.left + handle.width / 2);
    assert.equal(portScreen.y, handle.top + handle.height / 2);
  });
}
test("generated original core has a world Teleport, immutable camera source and exact node stack order", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "world-core-"));
  try {
    const installed = path.resolve(sources, "../upstream/packages/frontend/editor-ui/node_modules/@vue-flow/core/dist");
    fs.mkdirSync(path.join(fixture, "node_modules/@vue-flow/core/dist"), { recursive: true });
    fs.mkdirSync(path.join(fixture, "src"));
    fs.copyFileSync(
      path.join(installed, "vue-flow-core.mjs"),
      path.join(fixture, "node_modules/@vue-flow/core/dist/vue-flow-core.mjs")
    );
    createWorldCore(fixture, sources);
    const generated = fs.readFileSync(path.join(fixture, "src/kronterm-vue-flow-core.mjs"), "utf8");
    assert.ok(generated.includes("h(Teleport,{to:nativeWorldHost.worldTarget},[viewportNode])"));
    assert.ok(generated.includes("get:()=>nativeWorldHost.worldCamera.value,set:()=>{}"));
    assert.ok(generated.includes("originalRoot=nativeWorldHost.sceneElement.querySelector('.kronterm-passive-scene')"));
    assert.ok(
      generated.includes(
        "screenToWorld({x:x+containerBounds.left,y:y+containerBounds.top},viewport.value,containerBounds)"
      )
    );
    assert.ok(generated.includes("handleInWorld(handleBounds,nodeBounds,zoom2)"));
    assert.ok(generated.includes("...(nativeWorldHost ? {zIndex:worldNodeOrder(nativeWorldHost,node.id,0)} : {})"));
    verifyConnectionDrag(generated, true);
    verifyConnectionDrag(generated, false);
    const before = generated;
    createWorldCore(fixture, sources);
    assert.equal(fs.readFileSync(path.join(fixture, "src/kronterm-vue-flow-core.mjs"), "utf8"), before);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("world display-contents styling preserves hidden hosts and carriers", () => {
  const bootstrap = fs.readFileSync(path.join(sources, "native-bootstrap.ts"), "utf8");
  const literal = bootstrap.match(/worldStyle\.textContent\s*=\s*("[^"\n]*")/);
  assert.ok(literal, "native world host stylesheet exists");
  const hostCss = JSON.parse(literal[1]);
  assert.match(hostCss, /:host\{[^}]*display:contents!important/);
  assert.match(hostCss, /:host\(\[hidden\]\)\{display:none!important\}/);
  const carrierCss = fs.readFileSync(path.join(sources, "native-host.css"), "utf8");
  for (const selector of [
    ".kronterm-world-scene[hidden]",
    ".vue-flow__pane[hidden]",
    ".vue-flow__transformationpane[hidden]",
    ".vue-flow__nodes[hidden]",
    ".vue-flow__edge-labels[hidden]",
  ]) {
    assert.ok(carrierCss.includes(selector), selector);
  }
  assert.ok(
    carrierCss.lastIndexOf("display: none !important") > carrierCss.lastIndexOf("display: contents !important")
  );
});

function verifyConnectionDrag(generated, nativeWorld) {
  const makeRoot = () => {
    const listeners = new Map();
    return {
      addEventListener(name, callback) {
        listeners.set(name, callback);
      },
      removeEventListener(name, callback) {
        assert.equal(listeners.get(name), callback);
        listeners.delete(name);
      },
      dispatch(name, event) {
        listeners.get(name)?.(event);
      },
      listeners,
    };
  };
  const documentRoot = makeRoot();
  const hitRoot = makeRoot();
  const handle = {
    ownerDocument: documentRoot,
    getAttribute: () => "right",
    classList: { add() {}, remove() {}, toggle() {} },
  };
  const target = { x: 382, y: 456 };
  hitRoot.elementFromPoint = (x, y) => (x === target.x && y === target.y ? handle : null);
  const connections = [];
  let ended = 0;
  const ref = (value) => ({ value });
  const flow = {
    id: "flow",
    vueFlowRef: ref({}),
    connectionMode: ref("strict"),
    connectionRadius: ref(20),
    connectOnClick: ref(false),
    connectionClickStartHandle: ref(null),
    nodesConnectable: ref(true),
    autoPanOnConnect: ref(false),
    autoPanSpeed: ref(0),
    findNode: () => ({}),
    panBy: () => {},
    startConnection: () => {},
    updateConnection: () => {},
    endConnection: () => ended++,
    emits: { connect: (connection) => connections.push(connection), connectStart: () => {}, connectEnd: () => {} },
    viewport: ref({ x: -83, y: 29, zoom: 0.5 }),
    edges: ref([]),
    nodes: ref([]),
    isValidConnection: ref(() => true),
    nodeLookup: ref(new Map()),
  };
  const sandbox = {
    Position: { Left: "left", Top: "top" },
    useVueFlow: () => flow,
    toValue$1: (value) => value,
    isMouseEvent: () => true,
    getHostForElement: () => hitRoot,
    worldHostForElement: () => (nativeWorld ? {} : null),
    getEventPosition: (event, rect) => ({ x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }),
    getClosestHandle: () => null,
    pointToRendererPoint: (value) => value,
    isValidHandle: (event, { doc }) => {
      assert.equal(doc, hitRoot);
      const valid = Boolean(doc.elementFromPoint(event.clientX, event.clientY));
      return {
        handleDomNode: valid ? handle : null,
        isValid: valid,
        connection: valid ? { source: "Start", target: "web" } : null,
        toHandle: null,
      };
    },
    isConnectionValid: (_inside, valid) => valid,
    rendererPointToPoint: (value) => value,
    getConnectionStatus: () => "valid",
    resetRecentHandle: () => {},
    cancelAnimationFrame: () => {},
    getHandleType: () => "source",
    worldViewportRect: () => ({ left: 53, top: 117, width: 1000, height: 700 }),
    getHandle: () => ({ nodeId: "Start", type: "source", position: "right", id: "out" }),
    getHandlePosition: () => ({ x: 10, y: 10 }),
    oppositePosition: { right: "left" },
    alwaysValid: () => true,
  };
  const start = generated.indexOf("function useHandle({");
  const end = generated.indexOf("function useNodeId()", start);
  vm.createContext(sandbox);
  vm.runInContext(
    generated.slice(start, end) + ";globalThis.controller=useHandle({handleId:'out',nodeId:'Start',type:'source'});",
    sandbox
  );
  const down = { target: handle, currentTarget: handle, button: 0, clientX: 622, clientY: 600 };
  sandbox.controller.handlePointerDown(down);
  const eventRoot = nativeWorld ? documentRoot : hitRoot;
  assert.equal(eventRoot.listeners.size, 4);
  assert.equal((nativeWorld ? hitRoot : documentRoot).listeners.size, 0);
  // The pointer crosses ordinary OS DOM, then is released on a port without a final mousemove.
  documentRoot.dispatch("mousemove", { clientX: 700, clientY: 500 });
  eventRoot.dispatch("mouseup", { clientX: target.x, clientY: target.y });
  assert.equal(connections.length, nativeWorld ? 1 : 0);
  assert.equal(ended, 1);
  assert.equal(eventRoot.listeners.size, 0);
  sandbox.controller.handlePointerDown(down);
  eventRoot.dispatch("mouseup", { clientX: 800, clientY: 600 });
  assert.equal(connections.length, nativeWorld ? 1 : 0);
  assert.equal(ended, 2);
  assert.equal(eventRoot.listeners.size, 0);
}
