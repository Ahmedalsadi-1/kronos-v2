// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const integration = path.dirname(fileURLToPath(import.meta.url));
const revision = "62580009f52f2f06f5534b1e11225ab054294224";
const upstream = path.resolve(process.argv[2] ?? path.join(integration, "upstream"));
const out = path.resolve(integration, "../../public/comfy-native");

function run(command, args, cwd = upstream) {
    const result = spawnSync(command, args, { cwd, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.error})`);
}
if (!fs.existsSync(upstream)) {
    fs.mkdirSync(upstream, { recursive: true });
    run("git", ["init"]);
    run("git", ["fetch", "--depth=1", "https://github.com/Comfy-Org/ComfyUI_frontend.git", revision]);
    run("git", ["checkout", "--detach", "FETCH_HEAD"]);
}

function patch(filename, changes) {
    const original = spawnSync("git", ["show", `HEAD:${filename}`], { cwd: upstream, encoding: "utf8", maxBuffer: 8_000_000 });
    if (original.status !== 0) throw new Error(`Cannot read ${filename}`);
    let source = original.stdout;
    for (const [before, after] of changes) {
        if (!source.includes(before)) throw new Error(`ComfyUI source changed in ${filename}: ${before}`);
        source = source.replace(before, after);
    }
    fs.writeFileSync(path.join(upstream, filename), source);
}

fs.copyFileSync(path.join(integration, "native-editor.ts"), path.join(upstream, "src/kronos-editor.ts"));
fs.copyFileSync(path.join(integration, "native-host.ts"), path.join(upstream, "src/kronos-host.ts"));

patch("src/components/graph/GraphCanvas.vue", [
    ['class="absolute inset-0 isolate"', 'class="absolute inset-0 isolate" :class="{ \'pointer-events-none\': nativeHost }"'],
    ['      <LGraphNode\n', '      <Teleport :to="nativeHost?.world ?? \'body\'" :disabled="!nativeHost">\n      <LGraphNode\n'],
    ['        :data-node-id="nodeData.id"\n      />', '        :data-node-id="nodeData.id"\n      />\n      </Teleport>'],
    ['<LiteGraphCanvasSplitterOverlay v-if="comfyAppReady">', '<LiteGraphCanvasSplitterOverlay v-if="comfyAppReady && !nativeHost">'],
    ["import { until, useEventListener }", "import { comfyHost as nativeHost } from '@/kronos-host'\nimport { until, useEventListener }"],
    ["import { LiteGraph } from '@/lib/litegraph/src/litegraph'", "import { LiteGraph } from '@/lib/litegraph/src/litegraph'\nimport { onCanvasFrame } from '@/lib/litegraph/src/canvas/canvasFrame'"],
    ['const { shouldRenderVueNodes } = useVueFeatureFlags()', 'const flags = useVueFeatureFlags()\nconst shouldRenderVueNodes = computed(() => !!nativeHost.value || flags.shouldRenderVueNodes.value)'],
    ['function onLinkOverlayReady(el:', `watchEffect(() => {
  nativeHost.value?.onNodes(allNodes.value.map(data => {
    const node = comfyApp.graph.getNodeById(data.id)
    const rootGraphId = canvasStore.rootGraphId
    const layout = rootGraphId && layoutStore.getNodeLayoutRef(rootGraphId, data.id).value
    return {
      id: String(data.id),
      title: node?.title ?? String(data.id),
      x: layout?.position.x ?? node?.pos[0] ?? 0,
      y: (layout?.position.y ?? node?.pos[1] ?? 0) - LiteGraph.NODE_TITLE_HEIGHT,
      width: layout?.size.width ?? node?.size[0] ?? 225,
      height: (layout?.size.height ?? node?.size[1] ?? 100) + LiteGraph.NODE_TITLE_HEIGHT
    }
  }))
})
watchEffect((onCleanup) => {
  const host = nativeHost.value
  const canvas = canvasStore.canvas
  if (!host || !canvas) return
  const { x, y, zoom } = host.camera
  const alignCamera = () => {
    const offsetX = x / zoom
    const offsetY = y / zoom
    if (canvas.ds.scale === zoom && canvas.ds.offset[0] === offsetX && canvas.ds.offset[1] === offsetY) return
    canvas.ds.scale = zoom
    canvas.ds.offset[0] = offsetX
    canvas.ds.offset[1] = offsetY
    canvas.setDirty(true, true)
  }
  alignCamera()
  onCleanup(onCanvasFrame(canvas.canvas, 'update', alignCamera))
})
function onLinkOverlayReady(el:`],
    ['    await comfyApp.setup(canvas)', '    if (nativeHost.value) LiteGraph.vueNodesMode = true\n    await comfyApp.setup(canvas)'],
    ['    canvasStore.canvas.render_canvas_border = false', `    canvasStore.canvas.render_canvas_border = false
    if (nativeHost.value) {
      canvasStore.canvas.allow_dragcanvas = false
    }`],
    ['      await useFirstRunEntry().handleStartupOutcome(startupOutcome)', '      if (!nativeHost.value) await useFirstRunEntry().handleStartupOutcome(startupOutcome)'],
    [
        "        localStorage.removeItem('Comfy.userName')\n        window.location.reload()",
        "        localStorage.removeItem('Comfy.userName')\n        if (nativeHost.value) throw settingsError.value\n        window.location.reload()",
    ],
    ["  const sharedStatus =\n", "  if (nativeHost.value) { emit('ready'); return }\n  const sharedStatus =\n"]
]);
patch("src/lib/litegraph/src/LGraphCanvas.ts", [
    ["import {", "import { comfyHost } from '@/kronos-host'\nimport {"],
    ["    if (this.show_info) {", "    if (!comfyHost.value && this.show_info) {"],
    ["    const bg_already_painted = this.onRenderBackground",
     "    // KronOS paints the workspace behind the ComfyUI graph.\n    const bg_already_painted = comfyHost.value ? true : this.onRenderBackground"],
    ["      if (this.bg_tint) {", "      if (!comfyHost.value && this.bg_tint) {"]
]);
patch("src/renderer/extensions/vueNodes/components/LGraphNode.vue", [
    [':data-node-id="nodeData.id"', ':data-node-id="nodeData.id"\n    :data-os-object-kind="nativeHost ? \'workflow-node\' : undefined"\n    :data-os-object-id="nativeHost ? `comfy:${nodeData.id}` : undefined"\n    @pointerdown.capture="nativeHost?.onSelect(String(nodeData.id))"'],
    ['      zIndex: zIndex,', '      zIndex: nativeHost?.order[`comfy:${nodeData.id}`] ?? zIndex,'],
    ['const { nodeData } = defineProps', "import { comfyHost as nativeHost } from '@/kronos-host'\n\nconst { nodeData } = defineProps"]
]);
patch("src/platform/extensions/services/extensionLoader.ts", [
    ["import { installTouchPointerGuards }", "import { comfyHost } from '@/kronos-host'\nimport { installTouchPointerGuards }"],
    ["const extensions = await api.getExtensions()", "const extensions = comfyHost.value ? [] : await api.getExtensions()"]
]);
patch("src/scripts/ui/dialog.ts", [
    ["import { $el }", "import { comfyHost } from '@/kronos-host'\nimport { $el }"],
    ["{ parent: document.body }", "{ parent: comfyHost.value?.overlayTarget ?? document.body }"],
    ["    ]) as T", "    ]) as T\n    if (comfyHost.value && type === 'div') this.close()"]
]);
patch("src/components/sidebar/tabs/AssetsSidebarTab.vue", [
    ['<Teleport to="body">', '<Teleport :to="comfyHost?.overlayTarget ?? \'body\'">'],
    ["import { unrefElement", "import { comfyHost } from '@/kronos-host'\nimport { unrefElement"]
]);
patch("src/components/rightSidePanel/RightSidePanel.vue", [
    ["import { storeToRefs }", "import { comfyHost as nativeHost } from '@/kronos-host'\nimport { storeToRefs }"],
    ["  rightSidePanelStore.closePanel()",
     "  if (nativeHost.value) nativeHost.value.onClosePanel('properties')\n  else rightSidePanelStore.closePanel()"],
    [':aria-pressed="rightSidePanelStore.isOpen"', ':aria-pressed="!!nativeHost || rightSidePanelStore.isOpen"']
]);
patch("src/stores/workspace/searchBoxStore.ts", [
    ["interface SearchBoxPopover {", `interface SearchBoxPopover {
  listNativeNodes(query: string): Array<{ id: string; label: string; detail: string }>
  insertNativeNode(id: string): boolean`],
    ["  return {\n    useSearchBoxV2,", `  return {
    openAt: (event: CanvasPointerEvent | null) => popoverRef.value?.showSearchBox(event),
    listNativeNodes: (query: string) => popoverRef.value?.listNativeNodes(query) ?? [],
    insertNativeNode: (id: string) => popoverRef.value?.insertNativeNode(id) ?? false,
    useSearchBoxV2,`]
]);
patch("src/components/searchbox/NodeSearchBoxPopover.vue", [
    ['    <Dialog v-model:open="visible">', '    <Dialog v-if="!nativeHost" v-model:open="visible">'],
    ["import { useEventListener", "import { comfyHost as nativeHost } from '@/kronos-host'\nimport { useEventListener"],
    ['  if (newSearchBoxEnabled.value) {', '  if (nativeHost.value || newSearchBoxEnabled.value) {'],
    ['ghost: useSearchBoxV2.value && followCursor', 'ghost: !nativeHost.value && useSearchBoxV2.value && followCursor'],
    ['  } else if (!triggerEvent) {', '  } else if (!triggerEvent && !nativeHost.value) {'],
    ['  window.requestAnimationFrame(closeDialog)\n}', '  window.requestAnimationFrame(closeDialog)\n  return node\n}'],
    ['defineExpose({ showSearchBox })', `function listNativeNodes(query: string) {
  const nodes = query || nodeFilters.value.length
    ? nodeDefStore.nodeSearchService.searchNode(query, nodeFilters.value)
    : nodeDefStore.visibleNodeDefs
  return nodes.map(node => ({
    id: node.name,
    label: node.display_name || node.name,
    detail: node.category
  }))
}
function insertNativeNode(id: string) {
  const node = nodeDefStore.visibleNodeDefs.find(definition => definition.name === id)
  return !!node && !!addNode(node)
}
defineExpose({ showSearchBox, listNativeNodes, insertNativeNode })`]
]);
patch("src/renderer/extensions/vueNodes/composables/useNodePointerInteractions.ts", [
    ["import { nextTick", "import { comfyHost } from '@/kronos-host'\nimport { nextTick"],
    ["event.target instanceof Element ? event.target : undefined",
     "comfyHost.value && event.currentTarget instanceof Element\n        ? event.currentTarget\n        : event.target instanceof Element ? event.target : undefined"]
]);
patch("src/renderer/extensions/vueNodes/layout/useNodeDrag.ts", [
    ["    startAutoPan(event, nodeId)", "    if (!comfyHost.value) startAutoPan(event, nodeId)"],
    ["import {", "import { comfyHost } from '@/kronos-host'\nimport {"]
]);
patch("packages/api-client/src/ComfyApi.ts", [
    ['const baseUrl = `${protocol}://${this.api_host}${this.api_base}/ws`',
     'const baseUrl = this.api_base.startsWith(\'http://\') ? this.api_base.replace(\'http://\', \'ws://\') + \'/ws\' : `${protocol}://${this.api_host}${this.api_base}/ws`']
]);
patch("vite.config.mts", [
    ['  build: {\n', '  build: {\n    cssCodeSplit: false,\n'],
    ["    sourcemap: GENERATE_SOURCEMAP && (COLLECT_COVERAGE || 'hidden'),", "    sourcemap: false,"],
    ['    rolldownOptions: {\n', "    rolldownOptions: {\n      input: { editor: 'src/kronos-editor.ts' },\n      preserveEntrySignatures: 'strict',\n"],
    ['        ...assetCacheBustNames(),', "        ...assetCacheBustNames(),\n        entryFileNames: 'editor.js',"]
]);
const pnpm = ["exec", "--yes", "--package=pnpm@11.28.10", "--", "pnpm"];
if (!fs.existsSync(path.join(upstream, "node_modules/.bin/vite"))) {
    run("npm", [...pnpm, "install", "--frozen-lockfile", "--ignore-scripts"]);
}
run("npm", [...pnpm, "exec", "vite", "build", "--outDir", out, "--emptyOutDir"]);
const css = fs.readdirSync(path.join(out, "assets")).filter((name) => name.endsWith(".css"));
if (css.length !== 1) throw new Error("Expected one ComfyUI stylesheet");
const stylesheet = fs.readFileSync(path.join(out, "assets", css[0]), "utf8");
fs.writeFileSync(path.join(out, "assets", "editor.css"), stylesheet.replaceAll(":root", ":host"));
fs.copyFileSync(path.join(upstream, "LICENSE"), path.join(out, "LICENSE"));
