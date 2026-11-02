// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
export function createWorldCore(editor, sources) {
  for (const name of ["native-world.ts", "native-world-geometry.mjs"])
    fs.copyFileSync(
      path.join(sources, name),
      path.join(editor, "src", name === "native-world.ts" ? "kronterm-native-world.ts" : name)
    );
  let source = fs.readFileSync(path.join(editor, "node_modules/@vue-flow/core/dist/vue-flow-core.mjs"), "utf8");
  const replace = (before, after) => {
    if (!source.includes(before)) throw Error("VueFlow world adapter source changed: " + before.slice(0, 100));
    source = source.replace(before, after);
  };
  source =
    "import {screenToWorld,handleInWorld} from './native-world-geometry.mjs';\nimport {worldHostForScope,worldHostForElement,worldViewportRect,worldTransformPane,worldScale,requestWorldCamera,worldNodeOrder} from './kronterm-native-world.ts';\n" +
    source;
  const keysStart = source.indexOf("function useKeyPress(keyFilter, options) {");
  const keysEnd = source.indexOf("const ARIA_NODE_DESC_KEY", keysStart);
  if (keysStart < 0 || keysEnd < 0) throw Error("VueFlow keyboard helper source changed");
  let keys = source.slice(keysStart, keysEnd);
  keys = keys.replace(
    "function useKeyPress(keyFilter, options) {",
    `function useKeyPress(keyFilter, options) {
    function nativeKeyFilter(event) {
      const host=typeof window === 'undefined' ? null : window.__KRONTERM_WORKFLOW_HOST__;
      if(host?.shouldHandleEvent && !host.shouldHandleEvent(event)){reset();return false;}
      return currentFilter(event);
    }`
  );
  if (keys.split("(...args) => currentFilter(...args),").length !== 3)
    throw Error("VueFlow keyboard listener source changed");
  keys = keys.replaceAll("(...args) => currentFilter(...args),", "nativeKeyFilter,");
  source = source.slice(0, keysStart) + keys + source.slice(keysEnd);
  replace(
    "const state = useState();\n    const reactiveState = reactive(state);",
    `const state = useState();
    const nativeWorldHost=worldHostForScope();
    if(nativeWorldHost){
        Object.defineProperty(state,'__krontermWorldHost',{value:markRaw(nativeWorldHost),configurable:true});
        Object.defineProperty(state,'viewport',{enumerable:true,configurable:true,get:()=>nativeWorldHost.worldCamera.value,set:()=>{}});
    }
    const reactiveState = reactive(state);`
  );
  replace(
    "const isInitialized = state.d3Zoom && state.d3Selection && state.dimensions.width && state.dimensions.height;",
    "const isInitialized = (state.__krontermWorldHost || state.d3Zoom && state.d3Selection) && state.dimensions.width && state.dimensions.height;"
  );
  replace(
    "function zoom2(scale, transitionOptions) {",
    `function zoom2(scale, transitionOptions) {
    if(state.__krontermWorldHost){const c=state.viewport;const x=state.dimensions.width/2;const y=state.dimensions.height/2;return requestWorldCamera(state.__krontermWorldHost,{x:x-(x-c.x)*scale,y:y-(y-c.y)*scale,zoom:c.zoom*scale});}`
  );
  replace(
    "function transformViewport(x, y, zoom22, transitionOptions) {",
    "function transformViewport(x, y, zoom22, transitionOptions) {\n    if(state.__krontermWorldHost) return requestWorldCamera(state.__krontermWorldHost,{x,y,zoom:zoom22});"
  );
  replace(
    "zoomTo: (zoomLevel, options) => {\n        return new Promise",
    "zoomTo: (zoomLevel, options) => {\n        if(state.__krontermWorldHost) return zoom2(zoomLevel/state.viewport.zoom,options);\n        return new Promise"
  );
  replace(
    "const panBy = (delta) => {",
    "const panBy = (delta) => {\n    if(state.__krontermWorldHost){void requestWorldCamera(state.__krontermWorldHost,{...state.viewport,x:state.viewport.x+delta.x,y:state.viewport.y+delta.y});return Boolean(delta.x || delta.y); }"
  );
  replace(
    "until(() => state.d3Zoom).not.toBeNull().then(setSkippedOptions);",
    "if(state.__krontermWorldHost) setSkippedOptions(); else until(() => state.d3Zoom).not.toBeNull().then(setSkippedOptions);"
  );
  // The original providers stay mounted; their actual viewport DOM is an OS-world portal.
  const viewportStart = source.indexOf('const __default__$8 = {\n  name: "Viewport"');
  const viewportEnd = source.indexOf("const _hoisted_1$5", viewportStart);
  if (viewportStart < 0 || viewportEnd < 0) throw Error("VueFlow Viewport component missing.");
  let viewport = source.slice(viewportStart, viewportEnd);
  viewport = viewport.replace(
    "const {\n      minZoom,",
    "const nativeWorldHost=worldHostForScope();\n    const {\n      minZoom,"
  );
  viewport = viewport.replace(
    "onMounted(() => {\n      if (!viewportRef.value)",
    `onMounted(() => {
      if(nativeWorldHost){
        const originalRoot=nativeWorldHost.sceneElement.querySelector('.kronterm-passive-scene');
        const sync=()=>{if(!originalRoot || !viewportRef.value)return;viewportRef.value.className=originalRoot.className+' vue-flow__viewport vue-flow__container kronterm-world-scene';for(const attr of originalRoot.attributes)if(attr.name.startsWith('data-v-'))viewportRef.value.setAttribute(attr.name,attr.value);for(const name of originalRoot.style)if(name.startsWith('--'))viewportRef.value.style.setProperty(name,originalRoot.style.getPropertyValue(name));};
        sync();const observer=new MutationObserver(sync);if(originalRoot)observer.observe(originalRoot,{attributes:true});onScopeDispose(()=>observer.disconnect());return;
      }
      if (!viewportRef.value)`
  );
  viewport = viewport.replace(
    'return openBlock(), createElementBlock("div", {\n        ref_key: "viewportRef",',
    'const viewportNode = (openBlock(), createElementBlock("div", {\n        ref_key: "viewportRef",'
  );
  viewport = viewport.replace(
    'class: "vue-flow__viewport vue-flow__container"',
    'class: nativeWorldHost ? "vue-flow vue-flow__viewport vue-flow__container kronterm-world-scene" : "vue-flow__viewport vue-flow__container"'
  );
  viewport = viewport.replace(
    "      ], 512);\n    };",
    "      ], 512));\n      return nativeWorldHost ? h(Teleport,{to:nativeWorldHost.worldTarget},[viewportNode]) : viewportNode;\n    };"
  );
  if (!viewport.includes("h(Teleport")) throw Error("VueFlow world Teleport not applied.");
  source = source.slice(0, viewportStart) + viewport + source.slice(viewportEnd);
  replace(
    "const { viewport, fitViewOnInit, fitViewOnInitDone } = useVueFlow();",
    "const { viewport, fitViewOnInit, fitViewOnInitDone } = useVueFlow();\n    const nativeWorldHost=worldHostForScope();"
  );
  replace(
    "const transform = computed(() => `translate(${viewport.value.x}px,${viewport.value.y}px) scale(${viewport.value.zoom})`);",
    'const transform = computed(() => nativeWorldHost ? "none" : `translate(${viewport.value.x}px,${viewport.value.y}px) scale(${viewport.value.zoom})`);'
  );
  replace(
    "const updateDimensions = () => {\n      var _a, _b;",
    "const updateDimensions = () => {\n      var _a, _b;\n      if(worldHostForElement(viewportEl.value)){const bounds=worldViewportRect(viewportEl.value);dimensions.value={width:bounds.width,height:bounds.height};return;}"
  );
  replace(
    "resizeObserver.observe(viewportEl.value);",
    "resizeObserver.observe(worldHostForElement(viewportEl.value)?.viewportTarget || viewportEl.value);"
  );
  replace(
    "resizeObserver.unobserve(viewportEl.value);",
    "resizeObserver.unobserve(worldHostForElement(viewportEl.value)?.viewportTarget || viewportEl.value);"
  );
  source = source
    .replaceAll(
      'state.vueFlowRef.querySelector(".vue-flow__transformationpane")',
      "worldTransformPane(state.vueFlowRef)"
    )
    .replaceAll(
      'vueFlowRef.value.querySelector(".vue-flow__transformationpane")',
      "worldTransformPane(vueFlowRef.value)"
    );
  source = source.replaceAll(
    "const { m22: zoom2 } = new window.DOMMatrixReadOnly(style.transform);",
    "const zoom2 = worldScale(viewportNode, new window.DOMMatrixReadOnly(style.transform).m22);"
  );
  replace(
    "const pointerPos = pointToRendererPoint({ x, y }, viewport.value);",
    "const pointerPos = worldHostForElement(vueFlowRef.value) ? screenToWorld({x:x+containerBounds.left,y:y+containerBounds.top},viewport.value,containerBounds) : pointToRendererPoint({ x, y }, viewport.value);"
  );
  replace(
    "x: (handleBounds.left - nodeBounds.left) / zoom2,\n      y: (handleBounds.top - nodeBounds.top) / zoom2,",
    "...(({x,y})=>({x,y}))(handleInWorld(handleBounds,nodeBounds,zoom2)),"
  );
  // Geometry callers require the untransformed OS viewport, never the display-contents carrier.
  source = source
    .replaceAll("state.vueFlowRef.getBoundingClientRect()", "worldViewportRect(state.vueFlowRef)")
    .replaceAll("state.viewportRef.getBoundingClientRect()", "worldViewportRect(state.viewportRef)")
    .replaceAll("viewportElement.getBoundingClientRect()", "worldViewportRect(viewportElement)");
  source = source.replaceAll(
    "vueFlowRef.value) == null ? void 0 : _a.getBoundingClientRect()",
    "vueFlowRef.value) == null ? void 0 : worldViewportRect(_a)"
  );
  // Port drags cross light-DOM OS space, but their hit targets remain inside the world shadow root.
  const handleStart = source.indexOf("function useHandle({");
  const handleEnd = source.indexOf("function useNodeId()", handleStart);
  if (handleStart < 0 || handleEnd < 0) throw Error("VueFlow handle controller missing.");
  let handles = source.slice(handleStart, handleEnd);
  for (const marker of [
    "const clickedHandle = event.currentTarget;",
    "let onPointerMove = function(event2) {",
    'doc.addEventListener("mousemove", onPointerMove);',
  ]) {
    if (!handles.includes(marker)) throw Error("VueFlow handle drag source changed: " + marker);
  }
  handles = handles.replace(
    "const clickedHandle = event.currentTarget;",
    `const clickedHandle = event.currentTarget;
    const nativeWorldDrag = Boolean(worldHostForElement(clickedHandle));
    const dragEventRoot = nativeWorldDrag ? clickedHandle.ownerDocument : doc;
    const dragEventOptions = nativeWorldDrag ? true : undefined;`
  );
  handles = handles.replace(
    "let onPointerMove = function(event2) {",
    "let onPointerMove = function(event2, finalPosition = false) {"
  );
  handles = handles.replace("if (!autoPanStarted) {", "if (!autoPanStarted && !finalPosition) {");
  handles = handles.replace(
    "        if ((closestHandle || handleDomNode) && connection && isValid) {",
    `        if (nativeWorldDrag) onPointerMove(event2, true);
        if ((closestHandle || handleDomNode) && connection && isValid) {`
  );
  for (const event of ["mousemove", "mouseup", "touchmove", "touchend"]) {
    for (const method of ["addEventListener", "removeEventListener"]) {
      const callback = event.endsWith("move") ? "onPointerMove" : "onPointerUp";
      handles = handles.replace(
        `doc.${method}("${event}", ${callback});`,
        `dragEventRoot.${method}("${event}", ${callback}, dragEventOptions);`
      );
    }
  }
  source = source.slice(0, handleStart) + handles + source.slice(handleEnd);
  // Node wrappers alone participate in OS stacking; selection must not override an OS rank.
  const nodeStart = source.indexOf("const NodeWrapper = defineComponent({");
  const nodeEnd = source.indexOf("const NodeWrapper$1 = NodeWrapper;", nodeStart);
  let nodes = source.slice(nodeStart, nodeEnd);
  nodes = nodes.replace("setup(props) {", "setup(props) {\n    const nativeWorldHost=worldHostForScope();");
  nodes = nodes.replace(
    "            ...getStyle.value\n",
    "            ...getStyle.value,\n            ...(nativeWorldHost ? {zIndex:worldNodeOrder(nativeWorldHost,node.id,0)} : {})\n"
  );
  nodes = nodes.replace(
    "zIndex: node.computedPosition.z ?? zIndex.value,",
    "zIndex: nativeWorldHost ? worldNodeOrder(nativeWorldHost,node.id,0) : node.computedPosition.z ?? zIndex.value,"
  );
  source = source.slice(0, nodeStart) + nodes + source.slice(nodeEnd);
  replace(
    "const { findNode, getEdges, elevateEdgesOnSelect } = useVueFlow();",
    "const { findNode, getEdges, elevateEdgesOnSelect } = useVueFlow();\n    const nativeWorldHost=worldHostForScope();"
  );
  replace(
    "style: normalizeStyle({ zIndex: unref(getEdgeZIndex)(edge, unref(findNode), unref(elevateEdgesOnSelect)) })",
    "style: normalizeStyle({ zIndex: nativeWorldHost ? 0 : unref(getEdgeZIndex)(edge, unref(findNode), unref(elevateEdgesOnSelect)) })"
  );
  // The selection rectangle is already in world coordinates under the OS transform.
  replace(
    "style: normalizeStyle({ transform: `translate(${unref(viewport).x}px,${unref(viewport).y}px) scale(${unref(viewport).zoom})` })",
    'style: normalizeStyle({ transform: worldHostForScope() ? "none" : `translate(${unref(viewport).x}px,${unref(viewport).y}px) scale(${unref(viewport).zoom})` })'
  );
  for (const [relative, transform] of [
    [
      "features/workflows/canvas/composables/useVueFlowTransformPaneTeleport.ts",
      (value) =>
        value
          .replace("import { nextTick, ref, watch }", "import { inject, nextTick, ref, watch }")
          .replace(
            "const { vueFlowRef } = useVueFlow();",
            "const { vueFlowRef } = useVueFlow();\n    const host=inject('kronterm:surface-role','root') === 'workflow' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;"
          )
          .replace(
            "vueFlowRef.value?.querySelector(TRANSFORM_PANE_SELECTOR)",
            "(host?.worldTarget || vueFlowRef.value)?.querySelector(TRANSFORM_PANE_SELECTOR)"
          ),
    ],
    [
      "features/workflows/canvas/composables/useCanvasNodeHover.ts",
      (value) =>
        value
          .replace("type ComputedRef, onMounted", "type ComputedRef, inject, onMounted")
          .replace(
            "const id = ref<string | undefined>();",
            "const id = ref<string | undefined>();\n    const host=inject('kronterm:surface-role','root') === 'workflow' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;"
          )
          .replace(
            "store.viewportRef.value?.getBoundingClientRect()",
            "(host?.viewportTarget || store.viewportRef.value)?.getBoundingClientRect()"
          )
          .replaceAll("store.vueFlowRef.value?.", "(host?.viewportTarget || store.vueFlowRef.value)?."),
    ],
    [
      "features/workflows/canvas/components/WorkflowCanvas.vue",
      (value) =>
        value.replace(
          "const canvasElement = viewportRef.value;",
          "const canvasElement = nativeWorkflowHost?.viewportTarget || viewportRef.value;"
        ),
    ],
    [
      "features/workflows/canvas/components/Canvas.vue",
      (value) =>
        value.replace(
          "const bounds = viewportRef.value?.getBoundingClientRect() ??",
          "const bounds = krontermHost?.viewportTarget?.getBoundingClientRect() ?? viewportRef.value?.getBoundingClientRect() ??"
        ),
    ],
  ]) {
    const file = path.join(editor, "src", relative);
    if (!fs.existsSync(file)) continue;
    let value = fs.readFileSync(file, "utf8");
    if (relative.endsWith("WorkflowCanvas.vue") && !value.includes("const nativeWorkflowHost ="))
      value = value
        .replace(
          "</script>",
          "const nativeWorkflowHost = inject('kronterm:surface-role','root') === 'workflow' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;\n</script>"
        )
        .replace("import {", "import { inject,");
    // Each source adaptation is applied once; the generated core always starts pristine.
    if (
      !value.includes("host?.worldTarget ||") &&
      !value.includes("host?.viewportTarget ||") &&
      !value.includes("nativeWorkflowHost?.viewportTarget") &&
      !value.includes("krontermHost?.viewportTarget?.getBoundingClientRect")
    )
      value = transform(value);
    fs.writeFileSync(file, value);
  }
  fs.writeFileSync(path.join(editor, "src/kronterm-vue-flow-core.mjs"), source);
}
