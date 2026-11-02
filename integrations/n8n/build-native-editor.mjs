import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { patchNativeComposition } from "./editor/native-patches.mjs";
import { applyNativeWidgetPicker } from "./editor/native-widget-picker-patch.mjs";
import { createWorldCore } from "./editor/native-world-patch.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
const editor = path.join(root, "upstream/packages/frontend/editor-ui");
for (const [source, target] of [
  ["native-entry.ts", "kronterm-native.ts"],
  ["native-bootstrap.ts", "kronterm-native-bootstrap.ts"],
  ["native-axios.ts", "kronterm-native-axios.ts"],
  ["native-session.mjs", "native-session.mjs"],
  ["native-panel-layout.mjs", "native-panel-layout.mjs"],
])
  fs.copyFileSync(path.join(root, "editor", source), path.join(editor, "src", target));
const routerFile = path.join(editor, "src/app/router.ts");
let router = fs.readFileSync(routerFile, "utf8");
router = router.replace("createRouter, createWebHistory,", "createRouter, createMemoryHistory, createWebHistory,");
router = router.replace(
  "history: createWebHistory(import.meta.env.DEV ? '/' : (window.BASE_PATH ?? '/')),",
  "history: (window as any).__KRONTERM_WORKFLOW_HOST__ ? createMemoryHistory('/') : createWebHistory(import.meta.env.DEV ? '/' : (window.BASE_PATH ?? '/')),"
);
fs.writeFileSync(routerFile, router);
const layoutFile = path.join(editor, "src/app/components/app/AppLayout.vue");
let layout = fs.readFileSync(layoutFile, "utf8");
layout = layout.replace(
  "const initialized = ref<boolean>(false);",
  "const initialized = ref<boolean>(Boolean((window as any).__KRONTERM_WORKFLOW_HOST__));"
);
fs.writeFileSync(layoutFile, layout);

const titleFile = path.join(root, "upstream/packages/frontend/@n8n/composables/src/useDocumentTitle.ts");
let title = fs
  .readFileSync(titleFile, "utf8")
  .replace(
    "const DEFAULT_TITLE = 'n8n';",
    "const DEFAULT_TITLE = (window as any).__KRONTERM_WORKFLOW_HOST__ ? 'KronTerm' : 'n8n';"
  );
fs.writeFileSync(titleFile, title);
const viewFile = path.join(editor, "src/app/views/NodeView.vue");
let view = fs
  .readFileSync(viewFile, "utf8")
  .replace(
    /settingsStore.isCanvasOnly && !isDemoRoute.value(?: && !\(window as any\).__KRONTERM_WORKFLOW_HOST__)*/g,
    "settingsStore.isCanvasOnly && !isDemoRoute.value && !(window as any).__KRONTERM_WORKFLOW_HOST__"
  );
if (!view.includes("nativeHost?.openChat"))
  view = view.replace(
    "function onToggleChat() {",
    "function onToggleChat() {\n    const nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n    if (nativeHost?.openChat) { nativeHost.openChat(); return; }"
  );
fs.writeFileSync(viewFile, view);
const pushFile = path.join(editor, "src/app/stores/pushConnection.store.ts");
let push = fs.readFileSync(pushFile, "utf8");
if (!push.includes("__KRONTERM_WORKFLOW_HOST__?.pushUrl"))
  push = push.replace(
    "const url = `/push?pushRef=${rootStore.pushRef}`;",
    "const url = `/push?pushRef=${rootStore.pushRef}`;\n        const nativePushUrl = (window as any).__KRONTERM_WORKFLOW_HOST__?.pushUrl;\n        if (nativePushUrl) return `${nativePushUrl}?pushRef=${rootStore.pushRef}`;"
  );
fs.writeFileSync(pushFile, push);
const canvasFile = path.join(editor, "src/features/workflows/canvas/components/Canvas.vue");
let canvas = fs.readFileSync(canvasFile, "utf8");
const bridge = `
// The original canvas publishes its objects and camera into the OS registry.
const krontermHost = inject('kronterm:surface-role', 'root') === 'workflow' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;
if (krontermHost) {
    const canvasToken = Symbol('workflow-scene');
    krontermHost.activeCanvasToken = canvasToken;
    krontermHost.fitWorkflow = () => onFitView();
    onUnmounted(() => { if(krontermHost.activeCanvasToken === canvasToken) { krontermHost.onObjects?.([]); delete krontermHost.setSelection; delete krontermHost.moveNode; delete krontermHost.removeNode; delete krontermHost.fitWorkflow; } });
    let objectSignature = '';
    let applyingSelection = false;
    watch([graphNodes, () => workflowDocumentStore.value?.allNodes], ([nodes, canonicalNodes]) => {
        if(krontermHost.activeCanvasToken !== canvasToken) return;
        const canonicalIds = new Set((canonicalNodes || []).map(node => node.id));
        const objects = nodes.filter(node => canonicalIds.has(node.id)).map(node => ({ id: node.id, name: node.data?.name, position: {x: node.computedPosition?.x ?? node.position.x, y: node.computedPosition?.y ?? node.position.y}, dimensions: {...node.dimensions}, type: node.data?.type }));
        const signature = JSON.stringify(objects);
        if (signature !== objectSignature) { objectSignature = signature; krontermHost.onObjects?.(objects); }
    }, { deep: true, immediate: true });
    krontermHost.getSelection = () => selectedNodesAndGroups.value.map(node => node.id);
    krontermHost.setSelection = (ids: string[]) => { applyingSelection = true; removeSelectedNodes(selectedNodesAndGroups.value); addSelectedNodes(ids.map(id => findNode(id)).filter(Boolean)); void nextTick(() => { applyingSelection = false; }); };
    const requireMutableNode = (id: string) => {
        if(krontermHost.activeCanvasToken !== canvasToken || !findNode(id)) throw new Error('Workflow node is unavailable');
        if(props.readOnly || props.suppressInteraction || krontermHost.documentMutation?.value) throw new Error('Workflow is read only');
    };
    krontermHost.moveNode = (id: string, position: any) => { requireMutableNode(id); if(!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) throw new Error('Invalid node position'); onUpdateNodePosition(id, position); };
    krontermHost.removeNode = (id: string) => { requireMutableNode(id); onDeleteNode(id); };
    watch(selectedNodesAndGroups, (nodes) => { if(!applyingSelection) krontermHost.onSelection?.(nodes[0]?.id); });
}
`;
if (canvas.includes("// The original canvas publishes"))
  canvas =
    canvas.slice(0, canvas.indexOf("// The original canvas publishes")).trimEnd() +
    "\n" +
    canvas.slice(canvas.indexOf("</script>", canvas.indexOf("// The original canvas publishes")));
canvas = canvas.replace("</script>", bridge + "\n</script>");
fs.writeFileSync(canvasFile, canvas);
const nodeFile = path.join(editor, "src/features/workflows/canvas/components/elements/nodes/CanvasNode.vue");
let node = fs.readFileSync(nodeFile, "utf8");
if (!node.includes("data-os-object-kind"))
  node = node.replace(
    ':data-node-name="data.name"',
    'data-os-object-kind="workflow-node"\n\t\t:data-os-object-id="`workflow:${nativeWorkflowHost?.workflowId}:${id}`"\n\t\t:data-node-name="data.name"'
  );
if (!node.includes("const nativeWorkflowHost ="))
  node = node.replace("</script>", "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n</script>");
node = node.replace(
  "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;",
  "const nativeWorkflowHost = inject('kronterm:surface-role', 'root') === 'workflow' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;"
);
if (!node.includes("\tinject,\n")) node = node.replace("\tcomputed,\n", "\tcomputed,\n\tinject,\n");
node = node.replace(
  'data-os-object-kind="workflow-node"',
  ":data-os-object-kind=\"nativeWorkflowHost ? 'workflow-node' : undefined\""
);
node = node.replace(
  ':data-os-object-id="`workflow:${nativeWorkflowHost?.workflowId}:${id}`"',
  ':data-os-object-id="nativeWorkflowHost ? `workflow:${nativeWorkflowHost.workflowId}:${id}` : undefined"'
);
fs.writeFileSync(nodeFile, node);
const pickerFile = path.join(editor, "src/features/shared/nodeCreator/components/NodeCreator.vue");
let picker = fs.readFileSync(pickerFile, "utf8");
if (!picker.includes("nativePickerTarget")) {
  picker = picker.replace(
    "</script>",
    "const nativePickerTarget = (window as any).__KRONTERM_WORKFLOW_HOST__?.pickerTarget ?? ref(null);\n</script>"
  );
  picker = picker
    .replace(
      "<template>",
      '<template>\n<Teleport :to="nativePickerTarget || \'body\'" :disabled="!nativePickerTarget">'
    )
    .replace("</template>\n\n<style", "</Teleport>\n</template>\n\n<style");
}
fs.writeFileSync(pickerFile, picker);
applyNativeWidgetPicker(editor);
patchNativeComposition(editor, path.join(root, "editor"));
const rootStoreFile = path.join(root, "upstream/packages/frontend/@n8n/stores/src/useRootStore.ts");
let rootStore = fs.readFileSync(rootStoreFile, "utf8");
if (!rootStore.includes("setNativeBaseUrl:"))
  rootStore = rootStore.replace(
    "\treturn {\n\t\tbaseUrl,",
    "\treturn {\n\t\tsetNativeBaseUrl: (value: string) => { if((window as any).__KRONTERM_WORKFLOW_HOST__) state.value.baseUrl=value; },\n\t\tbaseUrl,"
  );
fs.writeFileSync(rootStoreFile, rootStore);

createWorldCore(editor, path.join(root, "editor"));
let worldCanvas = fs.readFileSync(canvasFile, "utf8");
if (!worldCanvas.includes(":auto-pan-on-node-drag"))
  worldCanvas = worldCanvas.replace(
    "\t\t:pan-on-scroll=",
    '\t\t:auto-pan-on-node-drag="!krontermHost"\n\t\t:auto-pan-on-connect="!krontermHost"\n\t\t:elevate-nodes-on-select="!krontermHost"\n\t\t:pan-on-scroll='
  );
if (!worldCanvas.includes("krontermHost?.worldTarget ||"))
  worldCanvas = worldCanvas.replace(
    '<CanvasArrowHeadMarker :id="arrowHeadMarkerId" />',
    `<Teleport :to="krontermHost?.worldTarget || 'body'" :disabled="!krontermHost?.worldTarget"><CanvasArrowHeadMarker :id="arrowHeadMarkerId" /></Teleport>`
  );
fs.writeFileSync(canvasFile, worldCanvas);

const config = `import { mergeConfig, defineConfig } from 'vite';
import original from './vite.config.mts';
import {resolve} from 'node:path';
export default mergeConfig(original, defineConfig({
 base:'./',
 define:{'process.env.NODE_ENV':JSON.stringify('production'),'process.env':{}},
 resolve:{alias:[{find:/^@vue-flow\\/core$/,replacement:resolve('src/kronterm-vue-flow-core.mjs')},{find:/^axios$/,replacement:resolve('src/kronterm-native-axios.ts')},{find:/^axios-native$/,replacement:resolve('node_modules/axios/index.js')}]},
 build:{outDir:resolve('../../../../../../public/workflow-native'),emptyOutDir:true,cssCodeSplit:false,
 lib:{entry:resolve('src/kronterm-native.ts'),formats:['es'],fileName:()=> 'editor.js',cssFileName:'editor'},
 rolldownOptions:{output:{codeSplitting:undefined}},
 },
}));`;
fs.writeFileSync(path.join(editor, "vite.kronterm.config.mts"), config);
const command = spawnSync(
  process.execPath,
  [path.join(editor, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.kronterm.config.mts"],
  { cwd: editor, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } }
);
if (command.status !== 0) process.exit(command.status || 1);
const output = path.join(root, "../../public/workflow-native");
for (const filename of fs.readdirSync(output))
  if (filename.endsWith(".css")) {
    const target = path.join(output, filename);
    fs.writeFileSync(
      target,
      fs
        .readFileSync(target, "utf8")
        .replaceAll("body:not([data-theme])", ":host(:not([data-theme]))")
        .replace(/body\[data-theme=([^\]]+)\]/g, ":host([data-theme=$1])")
        .replaceAll(":root", ":host")
        .replace(/(?<![\w-])body(?![\w-])/g, ":host")
        .replace(/(?<![\w-])html(?![\w-])/g, ":host")
        .replace(/(?<![\w(])\[data-theme=([^\]]+)\]/g, ":host([data-theme=$1])")
    );
  }
console.log("Built original n8n components for the KronTerm DOM host.");
