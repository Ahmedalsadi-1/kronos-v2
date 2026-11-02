import fs from "node:fs";
import path from "node:path";
export function patchNativeComposition(editor, sources) {
  fs.copyFileSync(path.join(sources, "native-host.css"), path.join(editor, "src/kronterm-native.css"));
  for (const name of ["KronTermHostFrame.vue", "KronTermHostLayout.vue", "KronTermRouteScope.vue"])
    fs.copyFileSync(path.join(sources, name), path.join(editor, "src/app/layouts", name));
  const patch = (name, modify) => {
    const file = path.join(editor, "src", name);
    fs.writeFileSync(file, modify(fs.readFileSync(file, "utf8")));
  };
  patch("app/App.vue", (value) => {
    if (!value.includes("const nativeWorkflowHost ="))
      value = value.replace(
        "</script>",
        "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n</script>"
      );
    if (!value.includes("kronterm-native-modal-root"))
      value = value.replace(
        "<AppModals />",
        '<Teleport :to="nativeWorkflowHost?.detailTarget || \'body\'" :disabled="!nativeWorkflowHost?.detailTarget"><div class="kronterm-native-modal-root"><AppModals /></div></Teleport>'
      );
    return value;
  });
  patch("app/stores/ui.utils.ts", (value) => {
    if (!value.includes("nativeWorkflowHost"))
      value = value.replace(
        "export function applyThemeToBody(theme: ThemeOption, window_?: Window) {",
        "export function applyThemeToBody(theme: ThemeOption, window_?: Window) {\n    const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n    if(nativeWorkflowHost && (!window_ || window_ === window)) return;"
      );
    return value;
  });
  patch("app/stores/ui.store.ts", (value) =>
    value
      .replace(
        "getComputedStyle(document.body)",
        "getComputedStyle((window as any).__KRONTERM_WORKFLOW_HOST__?.sceneElement || document.body)"
      )
      .replace(
        "return theme.value === 'system' ? preferredSystemTheme.value : theme.value;",
        "return (window as any).__KRONTERM_WORKFLOW_HOST__?.appearance?.value ?? (theme.value === 'system' ? preferredSystemTheme.value : theme.value);"
      )
  );
  patch("app/composables/useExposeCssVar.ts", (value) => {
    if (!value.includes("nativeWorkflowHost"))
      value = value.replace(
        "export function useExposeCssVar(name: string, value: MaybeRef<string>) {",
        "export function useExposeCssVar(name: string, value: MaybeRef<string>) {\n    const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n    if(nativeWorkflowHost) { const stop = watch(() => toValue(value), latest => nativeWorkflowHost.setCssVar?.(name, latest), {immediate:true}); onBeforeUnmount(stop); return; }"
      );
    return value;
  });
  patch("../../@n8n/composables/src/useStyles.ts", (value) => {
    if (!value.includes("nativeWorkflowHost"))
      value = value.replace(
        "document.documentElement.style.setProperty(variableName, `${value}`);",
        "const nativeWorkflowHost = typeof window !== 'undefined' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;\n        if(nativeWorkflowHost) nativeWorkflowHost.setCssVar?.(variableName, String(value));\n        else document.documentElement.style.setProperty(variableName, `${value}`);"
      );
    return value;
  });
  patch("app/init/toastNotifier.ts", (value) =>
    value.replace(
      "return ElNotification(options);",
      "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n        return ElNotification(nativeWorkflowHost ? {...options, appendTo:nativeWorkflowHost.chromeTarget || nativeWorkflowHost.detailTarget || nativeWorkflowHost.sceneElement} : options);"
    )
  );
  patch("../../@n8n/design-system/src/composables/useMessage.ts", (value) => {
    if (value.includes("nativeMessageOptions")) return value;
    value = value.replace(
      "export type MessageBoxConfirmResult",
      "const nativeMessageOptions = () => { const host = typeof window !== 'undefined' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null; return host?.detailTarget ? {appendTo:host.detailTarget, lockScroll:false} : {}; };\nexport type MessageBoxConfirmResult"
    );
    return value.replaceAll(
      "dangerouslyUseHTMLString: true,",
      "dangerouslyUseHTMLString: true,\n            ...nativeMessageOptions(),"
    );
  });
  patch("features/workflows/canvas/components/WorkflowCanvas.vue", (value) => {
    if (!value.includes("const nativeWorkflowHost ="))
      value = value.replace(
        "</script>",
        "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n</script>"
      );
    if (!value.includes("import { inject } from 'vue';"))
      value = value.replace("</script>", "import { inject } from 'vue';\n</script>");
    value = value.replace(
      "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;",
      "const nativeWorkflowHost = inject('kronterm:surface-role', 'root') === 'workflow' ? (window as any).__KRONTERM_WORKFLOW_HOST__ : null;"
    );
    return value.replace(
      '<div id="canvas" :class="$style.canvas">',
      '<div id="canvas" :class="$style.canvas" :style="nativeWorkflowHost ? {background: \'transparent\'} : undefined">'
    );
  });
  patch("app/composables/useBackendStatus.ts", (value) => {
    if (!value.includes("nativeHost?.request"))
      value = value.replace(
        "const response = await fetch(healthUrl, {",
        `const nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;
            if(nativeHost?.request) {
                const requestId = crypto.randomUUID();
                const cancel = () => { void nativeHost.cancelRequest?.(requestId); };
                controller.signal.addEventListener('abort', cancel, {once:true});
                try {
                    const result = await nativeHost.request({route:settingsStore.endpointHealth,method:'GET',requestId});
                    return result.status >= 200 && result.status < 300 && result.data?.status === 'ok';
                } finally { controller.signal.removeEventListener('abort', cancel); }
            }
            const response = await fetch(healthUrl, {`
      );
    return value;
  });
  patch("../../@n8n/stores/src/versions.store.ts", (value) => {
    for (const name of ["fetchVersions", "fetchWhatsNew"]) {
      const start = `const ${name} = async () => {`;
      const guard = "\n        if(typeof window !== 'undefined' && (window as any).__KRONTERM_WORKFLOW_HOST__) return;";
      if (!value.includes(start + guard)) value = value.replace(start, start + guard);
    }
    return value;
  });
  patch("app/composables/useKeybindings.ts", (value) => {
    if (!value.includes("nativeHost?.shouldHandleEvent"))
      value = value.replace(
        "function onKeyDown(event: KeyboardEvent) {",
        "function onKeyDown(event: KeyboardEvent) {\n        const nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n        if(nativeHost?.shouldHandleEvent && !nativeHost.shouldHandleEvent(event)) return;"
      );
    return value;
  });
  patch("app/composables/useHistoryHelper.ts", (value) => {
    if (!value.includes("nativeHost?.shouldHandleEvent"))
      value = value.replace(
        "function handleKeyDown(event: KeyboardEvent) {",
        "function handleKeyDown(event: KeyboardEvent) {\n        const nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n        if(nativeHost?.shouldHandleEvent && !nativeHost.shouldHandleEvent(event)) return;"
      );
    return value.replace(
      'document.querySelector(`${ELEMENT_UI_OVERLAY_SELECTOR}:not([style*="display: none"])`)',
      '((window as any).__KRONTERM_WORKFLOW_HOST__?.querySelector || document.querySelector.bind(document))(`${ELEMENT_UI_OVERLAY_SELECTOR}:not([style*="display: none"])`)'
    );
  });
  patch("../../@n8n/composables/src/useClipboard.ts", (value) => {
    if (!value.includes("nativeHost?.shouldHandleEvent"))
      value = value.replace(
        "function onPaste(event: ClipboardEvent) {",
        "function onPaste(event: ClipboardEvent) {\n        const nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n        if(nativeHost?.shouldHandleEvent && !nativeHost.shouldHandleEvent(event)) return;"
      );
    return value;
  });
  patch("app/layouts/BaseLayout.vue", (value) => {
    if (value.includes("KronTermHostFrame")) return value;
    return value
      .replace(
        "import { onMounted, useTemplateRef } from 'vue';",
        "import { onMounted, useTemplateRef } from 'vue';\nimport KronTermHostFrame from './KronTermHostFrame.vue';\nconst nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;"
      )
      .replace(
        "<template>",
        '<template>\n<KronTermHostFrame v-if="nativeHost" @mounted="emit(\'mounted\', $event)"><template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template></KronTermHostFrame>'
      )
      .replace('<div ref="layout"', '<div v-else ref="layout"');
  });
  patch("app/components/app/AppLayout.vue", (value) => {
    if (value.includes("KronTermHostLayout")) return value;
    return value
      .replace(
        "import { defineAsyncComponent, ref } from 'vue';",
        "import { defineAsyncComponent, ref } from 'vue';\nimport KronTermHostLayout from '@/app/layouts/KronTermHostLayout.vue';\nconst nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;"
      )
      .replace(
        '<div v-if="!initialized" />',
        '<KronTermHostLayout v-if="nativeHost" />\n\t<div v-else-if="!initialized" />'
      );
  });
  patch("app/layouts/WorkflowLayout.vue", (value) => {
    if (!value.includes("import { useNDVStore }"))
      value = value.replace(
        "import BaseLayout from './BaseLayout.vue';",
        "import BaseLayout from './BaseLayout.vue';\nimport { useNDVStore } from '@/features/ndv/shared/ndv.store';\nimport { nextTick } from 'vue';"
      );
    if (!value.includes("const nativeRole ="))
      value = value.replace(
        "import { watch, onMounted, onBeforeUnmount, provide } from 'vue';",
        "import { watch, onMounted, onBeforeUnmount, provide, inject } from 'vue';\nconst nativeRole = inject('kronterm:surface-role', 'standalone');\nconst nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;"
      );
    if (!value.includes("if(nativeRole === 'management') { isLoading.value = false; return; }"))
      value = value.replace(
        "onMounted(async () => {",
        "onMounted(async () => {\n    if(nativeRole === 'management') { isLoading.value = false; return; }"
      );
    if (!value.includes("if(nativeRole === 'management') return;")) {
      value = value.replace(
        "onBeforeUnmount(() => {",
        "onBeforeUnmount(() => {\n    if(nativeRole === 'management') return;"
      );
      value = value.replace(
        "async (newId, oldId) => {",
        "async (newId, oldId) => {\n        if(nativeRole === 'management') return;"
      );
    }
    value = value.replace(/if\(nativeRole !== 'management'\) /g, "");
    value = value
      .replace(
        "pushConnectionStore.pushConnect();",
        "if(nativeRole !== 'management') pushConnectionStore.pushConnect();"
      )
      .replace(
        "pushConnectionStore.pushDisconnect();",
        "if(nativeRole !== 'management') pushConnectionStore.pushDisconnect();"
      );
    if (value.includes("if (nativeHost && nativeRole !== 'management') {"))
      value =
        value.slice(0, value.indexOf("if (nativeHost && nativeRole !== 'management') {")) +
        value.slice(
          value.indexOf(
            "const { setup: setupPostMessages",
            value.indexOf("if (nativeHost && nativeRole !== 'management') {")
          )
        );
    value = value.replace(
      "const { setup: setupPostMessages",
      `if (nativeHost && nativeRole !== 'management') {
    nativeHost.getDocumentState = () => currentWorkflowDocumentStore.value?.hydrated ? ({ workflowId: currentWorkflowDocumentStore.value.workflowId, dirty: uiStore.stateIsDirty, versionId: currentWorkflowDocumentStore.value.versionId, checksum: currentWorkflowDocumentStore.value.checksum }) : null;
    nativeHost.refreshDocument = async (draft: any) => {
        const document = currentWorkflowDocumentStore.value;
        if (!document || !draft || document.workflowId !== draft.id) throw new Error('The workflow document is not ready.');
        if (uiStore.stateIsDirty) throw new Error('Save the local workflow edits before applying Hermes changes.');
        const ndv = useNDVStore(document.documentId);
        const activeNodeId = ndv.activeNode?.id;
        const selectedIds = nativeHost.getSelection?.() || [];
        nativeHost.isReconcilingDocument = true;
        try {
            document.hydrate(draft);
            const active = activeNodeId ? document.getNodeById(activeNodeId) : null;
            if (active) ndv.setActiveNodeName(active.name, 'canvas_default_view');
            uiStore.markStateClean();
            await nextTick();
            nativeHost.setSelection?.(selectedIds);
        } finally { nativeHost.isReconcilingDocument = false; }
        nativeHost.onDirty?.(uiStore.stateIsDirty);
        return { workflowId: document.workflowId, versionId: document.versionId };
    };
}
const { setup: setupPostMessages`
    );
    value = value.replace(
      "provide(InstanceAiEditorCapabilityKey, useInstanceAiHandoffCapability());",
      "provide(InstanceAiEditorCapabilityKey, nativeHost ? {openWorkflow: async () => { nativeHost.openChat?.(); }, openCredential: async (context) => {nativeHost.openChat?.({credential:context}); return false;} } : useInstanceAiHandoffCapability());"
    );
    return value;
  });
  patch("app/views/NodeView.vue", (value) => {
    if (!value.includes("const nativeWorkflowHost ="))
      value = value.replace(
        "</script>",
        "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n</script>"
      );
    if (!value.includes("nativeWorkflowHost?.onInspector"))
      value = value.replace(
        "function onToggleNodeCreator(options: ToggleNodeCreatorOptions) {",
        "function onToggleNodeCreator(options: ToggleNodeCreatorOptions) {\n    if(options.createNodeActive) nativeWorkflowHost?.onInspector?.('nodes');"
      );
    value = value
      .split("\n")
      .filter((line) => !line.includes("__KRONTERM_WORKFLOW_HOST__ && !(to.meta.layout"))
      .join("\n");
    value = value.replace(
      "onBeforeRouteLeave(async (to, from, next) => {",
      "onBeforeRouteLeave(async (to, from, next) => {\n    if ((window as any).__KRONTERM_WORKFLOW_HOST__ && !(to.meta.layout === 'workflow' && to.meta.nodeView)) { next(); return; }"
    );
    value = value
      .split("\n")
      .filter((line) => !line.includes("__KRONTERM_WORKFLOW_HOST__?.documentMutation?.value ||"))
      .join("\n");
    value = value.replace(
      "return !(window as any).__KRONTERM_WORKFLOW_HOST__?.documentMutation?.value && !ndvStore.value.activeNode && uiStore.activeModals.length === 0;",
      "return !(window as any).__KRONTERM_WORKFLOW_HOST__?.managementOpen?.value && !(window as any).__KRONTERM_WORKFLOW_HOST__?.documentMutation?.value && !ndvStore.value.activeNode && uiStore.activeModals.length === 0;"
    );
    value = value.replace(
      "return !ndvStore.value.activeNode && uiStore.activeModals.length === 0;",
      "return !(window as any).__KRONTERM_WORKFLOW_HOST__?.managementOpen?.value && !(window as any).__KRONTERM_WORKFLOW_HOST__?.documentMutation?.value && !ndvStore.value.activeNode && uiStore.activeModals.length === 0;"
    );
    if (!value.includes("function onOpenChat() {\n    const nativeHost"))
      value = value.replace(
        "function onOpenChat() {",
        "function onOpenChat() {\n    const nativeHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n    if(nativeHost?.openChat) { nativeHost.openChat(); return; }"
      );
    value = value.replace(
      '<div :class="$style.wrapper">',
      '<div :class="$style.wrapper" :style="nativeWorkflowHost ? {height:\'100%\'} : undefined">'
    );
    if (!value.includes("kronterm-focus-portal"))
      value = value
        .replace(
          "\n\t\t<FocusSidebar",
          '\n\t\t<Teleport :to="nativeWorkflowHost?.focusTarget || nativeWorkflowHost?.detailTarget || \'body\'" :disabled="!(nativeWorkflowHost?.focusTarget || nativeWorkflowHost?.detailTarget)"><div class="kronterm-focus-portal">\n\t\t<FocusSidebar'
        )
        .replace("\n\t</div>\n</template>", "\n\t\t</div></Teleport>\n\t</div>\n</template>");
    value = value.replace(
      ':to="nativeWorkflowHost?.detailTarget || \'body\'" :disabled="!nativeWorkflowHost?.detailTarget"><div class="kronterm-focus-portal">',
      ':to="nativeWorkflowHost?.focusTarget || nativeWorkflowHost?.detailTarget || \'body\'" :disabled="!(nativeWorkflowHost?.focusTarget || nativeWorkflowHost?.detailTarget)"><div class="kronterm-focus-portal">'
    );
    if (!value.includes("kronterm-execution-controls")) {
      value = value.replace(
        '<div v-if="!isCanvasReadOnly || canExecuteOnCanvas" :class="$style.executionButtonsContainer">',
        '<Teleport :to="nativeWorkflowHost?.chromeTarget || \'body\'" :disabled="!nativeWorkflowHost?.chromeTarget"><div class="kronterm-execution-controls" data-workflow-controls><div v-if="!isCanvasReadOnly || canExecuteOnCanvas" :class="$style.executionButtonsContainer">'
      );
      value = value.replace("\n\t\t\t<N8nCallout\n", "\n\t\t\t</div></Teleport>\n\t\t\t<N8nCallout\n");
    }
    if (!value.includes("nativeWorkflowHost?.managementOpen?.value) void nativeWorkflowHost.navigate"))
      value = value.replace(
        "async function onSetNodeActivated(id: string, event?: MouseEvent) {",
        "async function onSetNodeActivated(id: string, event?: MouseEvent) {\n    if(nativeWorkflowHost?.managementOpen?.value) void nativeWorkflowHost.navigate('/workflow/' + workflowId.value);"
      );
    value = value.replace(
      "const isCanvasReadOnly = computed(() => {\n\treturn (",
      "const isCanvasReadOnly = computed(() => {\n\treturn (\n        (window as any).__KRONTERM_WORKFLOW_HOST__?.documentMutation?.value ||"
    );
    return value;
  });
  patch("app/components/MainHeader/MainHeader.vue", (value) => {
    if (!value.includes("const nativeWorkflowHost ="))
      value = value.replace(
        "</script>",
        "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n</script>"
      );
    value = value.replace(
      'v-if="!settingsStore.isCanvasOnly"',
      'v-if="!settingsStore.isCanvasOnly || nativeWorkflowHost"'
    );
    value = value.replace(/settingsStore\.isCanvasOnly(?: && !nativeWorkflowHost)+/g, "settingsStore.isCanvasOnly");
    value = value.replace(
      "[$style['canvas-only']]: settingsStore.isCanvasOnly",
      "[$style['canvas-only']]: settingsStore.isCanvasOnly && !nativeWorkflowHost"
    );
    value = value.replace(
      ':floating="settingsStore.isCanvasOnly"',
      ':floating="settingsStore.isCanvasOnly && !nativeWorkflowHost"'
    );
    const nativeExecutionTab = "\n    if(nativeWorkflowHost && tab === MAIN_HEADER_TABS.EXECUTIONS) { nativeWorkflowHost.onInspector?.('executions'); return; }";
    const tabSelection = "function onTabSelected(tab: MAIN_HEADER_TABS, event: MouseEvent) {";
    if (!value.includes(tabSelection + nativeExecutionTab)) value = value.replace(tabSelection, tabSelection + nativeExecutionTab);
    value = value.replace('v-show="!hideMenuBar"', 'v-show="!hideMenuBar || nativeWorkflowHost"');
    return value;
  });
  patch("features/workflows/canvas/components/Canvas.vue", (value) => {
    value = value.replace(
      ':pan-on-drag="panningMouseButton"',
      ':pan-on-drag="krontermHost ? false : panningMouseButton"'
    );
    value = value.replace(
      "\n\t\tpan-on-scroll\n",
      '\n\t\t:pan-on-scroll="!krontermHost"\n\t\t:zoom-on-scroll="!krontermHost"\n\t\t:zoom-on-pinch="!krontermHost"\n\t\t:zoom-on-double-click="!krontermHost"\n\t\t:prevent-scrolling="!krontermHost"\n'
    );
    value = value.replace(':class="classes"', ":class=\"[classes, krontermHost ? 'kronterm-passive-scene' : null]\"");
    value = value.replace(
      ':style="selectionBoxStyle"',
      ":style=\"[selectionBoxStyle, krontermHost ? { background: 'transparent', pointerEvents: 'none' } : {}]\""
    );
    value = value.replace(
      '<CanvasBackground :viewport="viewport"',
      '<CanvasBackground v-if="!krontermHost" :viewport="viewport"'
    );
    value = value.replace(/if \(!\(window as any\)\.__KRONTERM_WORKFLOW_HOST__\) /g, "");
    value = value.replace(
      "useViewportAutoAdjust(viewportRef, viewport, setViewport);",
      "if (!(window as any).__KRONTERM_WORKFLOW_HOST__) useViewportAutoAdjust(viewportRef, viewport, setViewport);"
    );
    value = value
      .split("\n")
      .map((line) =>
        line.includes("useViewportAutoAdjust(viewportRef, viewport, setViewport);")
          ? "if (!(window as any).__KRONTERM_WORKFLOW_HOST__ || inject('kronterm:surface-role', 'root') !== 'workflow') useViewportAutoAdjust(viewportRef, viewport, setViewport);"
          : line
      )
      .join("\n");

    if (!value.includes("krontermHost.onReady?."))
      value = value.replace(
        "onPaneReady(async () => {",
        "onPaneReady(async () => {\n    if (krontermHost) { await setViewport(krontermHost.camera || {x:0,y:0,zoom:1}); isPaneReady.value = true; krontermHost.onReady?.(); return; }"
      );
    if (!value.includes("krontermHost.lastFittedWorkflowId"))
      value = value.replace(
        "onNodesInitialized(() => {",
        "onNodesInitialized(() => {\n    if(krontermHost && krontermHost.lastFittedWorkflowId !== workflowDocumentStore.value?.workflowId) { krontermHost.lastFittedWorkflowId = workflowDocumentStore.value?.workflowId; void nextTick(() => onFitView()); }"
      );
    if (!value.includes("scope:'workflow'")) {
      value = value.replace(
        "async function onFitBounds(nodes: GraphNode[]) {",
        "async function onFitBounds(nodes: GraphNode[]) {\n    if(krontermHost) { krontermHost.onCameraIntent?.({fitBounds:getRectOfNodes(nodes),scope:'workflow'});return; }"
      );
      value = value.replace(
        "async function onFitView() {",
        "async function onFitView() {\n    if(krontermHost) { krontermHost.onCameraIntent?.({fitBounds:getRectOfNodes(graphNodes.value),scope:'workflow'});return; }"
      );
      value = value.replace(
        "async function onZoomTo(zoomLevel: number) {",
        "async function onZoomTo(zoomLevel: number) {\n    if(krontermHost) { const camera=krontermHost.camera || viewport.value; const ratio=zoomLevel/camera.zoom; krontermHost.onCameraIntent?.({camera:{x:dimensions.value.width/2-(dimensions.value.width/2-camera.x)*ratio,y:dimensions.value.height/2-(dimensions.value.height/2-camera.y)*ratio,zoom:zoomLevel}}); return; }"
      );
      value = value.replace(
        "async function onZoomIn() {",
        "async function onZoomIn() {\n    if(krontermHost) return onZoomTo(viewport.value.zoom * 1.2);"
      );
      value = value.replace(
        "async function onZoomOut() {",
        "async function onZoomOut() {\n    if(krontermHost) return onZoomTo(viewport.value.zoom / 1.2);"
      );
    }
    if (!value.includes("krontermHost.openChat?.({nodeIds:")) {
      value = value.replace(
        "function onAddToAi(id: string) {",
        "function onAddToAi(id: string) {\n    if(krontermHost) { krontermHost.openChat?.({nodeIds:[id]}); return; }"
      );
      value = value.replace(
        "const doc = workflowDocumentStore.value;\n\tawait addSelectedNodesToChat",
        "const doc = workflowDocumentStore.value;\n    if(krontermHost) { krontermHost.openChat?.({nodeIds:ids,workflowId:doc.workflowId}); return; }\n\tawait addSelectedNodesToChat"
      );
    }
    if (!value.includes("kronterm-minimap-controls"))
      value = value
        .replace(
          '<Transition name="minimap">',
          '<Teleport :to="krontermHost?.chromeTarget || \'body\'" :disabled="!krontermHost?.chromeTarget"><div class="kronterm-minimap-controls"><Transition name="minimap">'
        )
        .replace(
          "</Transition>\n\n\t\t<CanvasControlButtons",
          "</Transition></div></Teleport>\n\n\t\t<CanvasControlButtons"
        )
        .replace(
          '</Transition>\n\n\t\t<Teleport :to="krontermHost?.chromeTarget',
          '</Transition></div></Teleport>\n\n\t\t<Teleport :to="krontermHost?.chromeTarget'
        );
    value = value.replace(
      "if(krontermHost) { krontermHost.onCameraIntent?.({fitBounds:getRectOfNodes(graphNodes.value),scope:'workflow'});return; }",
      "if(krontermHost) { if(!initialized.value) return; krontermHost.onCameraIntent?.({fitBounds:getRectOfNodes(graphNodes.value),scope:'workflow'});return; }"
    );
    if (!value.includes("data-workflow-controls")) {
      value = value.replace(
        "\n\t\t<CanvasControlButtons",
        '\n\t\t<Teleport :to="krontermHost?.chromeTarget || \'body\'" :disabled="!krontermHost?.chromeTarget"><div class="kronterm-canvas-controls" data-workflow-controls>\n\t\t<CanvasControlButtons'
      );
      value = value.replace(
        "\n\t\t<Suspense>\n\t\t\t<ContextMenu",
        "\n\t\t</div></Teleport>\n\t\t<Suspense>\n\t\t\t<ContextMenu"
      );
    }
    value = value.replace(
      ':to="krontermHost?.chromeTarget || \'body\'" :disabled="!krontermHost?.chromeTarget"><div class="kronterm-canvas-controls"',
      ':to="krontermHost?.toolsTarget || krontermHost?.chromeTarget || \'body\'" :disabled="!krontermHost?.chromeTarget"><div class="kronterm-canvas-controls"'
    );
    return value;
  });
  patch("features/shared/nodeCreator/views/NodeCreation.vue", (value) => {
    if (!value.includes("const nativeWorkflowHost ="))
      value = value.replace(
        "</script>",
        "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\n</script>"
      );
    value = value.replace(
      'v-if="!createNodeActive"',
      'v-if="!createNodeActive || nativeWorkflowHost?.pickerParked?.value"'
    );
    if (!value.includes("kronterm-add-controls")) {
      value = value.replace(
        "\n\t<N8nButtonList",
        '\n\t<Teleport :to="nativeWorkflowHost?.chromeTarget || \'body\'" :disabled="!nativeWorkflowHost?.chromeTarget"><div class="kronterm-add-controls" data-workflow-controls>\n\t<N8nButtonList'
      );
      value = value.replace("\n\t</N8nButtonList>", "\n\t</N8nButtonList>\n\t</div></Teleport>");
    }
    value = value.replace(
      ':to="nativeWorkflowHost?.chromeTarget || \'body\'" :disabled="!nativeWorkflowHost?.chromeTarget"><div class="kronterm-add-controls"',
      ':to="nativeWorkflowHost?.toolsTarget || nativeWorkflowHost?.chromeTarget || \'body\'" :disabled="!nativeWorkflowHost?.chromeTarget"><div class="kronterm-add-controls"'
    );
    value = value.replace(
      'v-if="!createNodeActive || nativeWorkflowHost?.pickerParked?.value"',
      'v-if="nativeWorkflowHost?.toolsTarget || !createNodeActive || nativeWorkflowHost?.pickerParked?.value"'
    );
    for (const name of ["onAskAssistantButtonClick", "onInstanceAiCanvasActionClick"]) {
      const start = `async function ${name}() {`;
      const guard =
        "\n    if ((window as any).__KRONTERM_WORKFLOW_HOST__?.openChat) { (window as any).__KRONTERM_WORKFLOW_HOST__.openChat(); return; }";
      if (!value.includes(start + guard)) value = value.replace(start, start + guard);
    }
    return value;
  });
  patch("features/shared/nodeCreator/nodeCreator.store.ts", (value) => {
    const signature = "}: ToggleNodeCreatorOptions & { workflowId: string }) {";
    const action = "\n        if(createNodeActive) (window as any).__KRONTERM_WORKFLOW_HOST__?.onInspector?.('nodes');";
    if (!value.includes(signature + action)) value = value.replace(signature, signature + action);
    return value;
  });
  fs.copyFileSync(path.join(sources, "native-node-focus.mjs"), path.join(editor, "src/kronterm-native-node-focus.mjs"));
  patch("features/workflows/canvas/components/Canvas.vue", (value) => {
    if (!value.includes("import { focusNativeNode }"))
      value = value.replace(
        /<script[^>]*setup[^>]*>/,
        (match) => match + `\nimport { focusNativeNode } from '@/kronterm-native-node-focus.mjs';`
      );
    if (!value.includes("let nativeNodeDragged"))
      value = value.replace(
        "function onNodeDragStart(event: NodeDragEvent) {",
        "let nativeNodeDragged = false;\nfunction onNodeDragStart(event: NodeDragEvent) {\n    if(krontermHost) nativeNodeDragged = true;"
      );
    if (!value.includes("requestAnimationFrame(() => { nativeNodeDragged = false; })"))
      value = value.replace(
        "function onNodeDragStop(event: NodeDragEvent) {",
        "function onNodeDragStop(event: NodeDragEvent) {\n    if(krontermHost) requestAnimationFrame(() => { nativeNodeDragged = false; });"
      );
    if (!value.includes("focusNativeNode(event, node.id"))
      value = value.replace(
        "emit('click:node', node.id, getProjectedPosition(event));",
        "emit('click:node', node.id, getProjectedPosition(event));\n    focusNativeNode(event, node.id, krontermHost, onSetNodeActivated, {nonParameterNode:node.data?.type === STICKY_NODE_TYPE,suppressInteraction:props.suppressInteraction,dragging:nativeNodeDragged});"
      );
    value = value.replace(
      "readOnly:props.readOnly || node.data?.type === STICKY_NODE_TYPE",
      "nonParameterNode:node.data?.type === STICKY_NODE_TYPE"
    );
    return value;
  });
  patch("app/views/NodeView.vue", (value) => {
    if (!value.includes("bindNativeNodeEditor"))
      value = value.replace(
        '<script setup lang="ts">',
        `<script setup lang="ts">\nimport { bindNativeNodeEditor } from '@/kronterm-native-node-focus.mjs';\nimport { inject as nativeInject } from 'vue';`
      );
    if (!value.includes("const unbindNativeNodeEditor"))
      value = value.replace(
        "</script>",
        `const unbindNativeNodeEditor = bindNativeNodeEditor(nativeInject('kronterm:surface-role', 'root') === 'workflow' ? nativeWorkflowHost : null, clearNodeActive);\nonBeforeUnmount(unbindNativeNodeEditor);\n</script>`
      );
    if (!value.includes("const unbindNativeWidgetInsertion")) {
      value = value.replace(
        "import { bindNativeNodeEditor }",
        "import { bindNativeWidgetInsertion, bindNativeNodeEditor }"
      );
      value = value.replace(
        "</script>",
        `const unbindNativeWidgetInsertion = bindNativeWidgetInsertion(nativeInject('kronterm:surface-role', 'root') === 'workflow' ? nativeWorkflowHost : null, () => !isCanvasReadOnly.value && checkIfEditingIsAllowed(), async (node: any) => {
        const result = await addNodesAndConnections([node], [], {viewport:viewportBoundaries.value,telemetry:true});
        const added = result.addedNodes[0];
        if(added){selectNodes([added.id]);nativeWorkflowHost.onSelection?.(added.id);setNodeActive(added.id, 'canvas_default_view');}
        return added;
      });
      onBeforeUnmount(unbindNativeWidgetInsertion);\n</script>`
      );
    }
    return value;
  });
  patch("features/ndv/shared/views/NodeDetailsView.vue", (value) => {
    if (!value.includes("const nativeDetailsRole ="))
      value = value.replace(
        "</script>",
        "import { inject } from 'vue';\nconst nativeDetailsRole = inject('kronterm:surface-role', 'root');\n</script>"
      );
    value = value
      .split("\n")
      .map((line) =>
        line.includes("watch(activeNode, node => nativeWorkflowHost?.onNodeEditorOpen")
          ? "watch(activeNode, node => { if(nativeDetailsRole === 'workflow') nativeWorkflowHost?.onNodeEditorOpen?.(Boolean(node)); });"
          : line
      )
      .join("\n");
    value = value.replace(
      "zIndex: APP_Z_INDEXES.NDV, position:",
      "zIndex: APP_Z_INDEXES.NDV, display: nativeDetailsRole === 'workflow' && nativeWorkflowHost.managementOpen?.value ? 'none' : undefined, position:"
    );
    if (!value.includes("const nativeWorkflowHost ="))
      value = value.replace(
        "</script>",
        "const nativeWorkflowHost = (window as any).__KRONTERM_WORKFLOW_HOST__;\nconst nativeExpanded = ref(false);\nwatch(activeNode, node => nativeWorkflowHost?.onNodeEditorOpen?.(Boolean(node)));\n</script>"
      );
    value = value.replace(
      ':to="`#${APP_MODALS_ELEMENT_ID}`"',
      ':to="nativeWorkflowHost?.detailTarget || `#${APP_MODALS_ELEMENT_ID}`"'
    );
    value = value.replace(
      ':to="nativeWorkflowHost?.detailTarget || `#${APP_MODALS_ELEMENT_ID}`"',
      ':to="(nativeDetailsRole === \'workflow\' && nativeWorkflowHost?.focusTarget) || nativeWorkflowHost?.detailTarget || `#${APP_MODALS_ELEMENT_ID}`"'
    );
    value = value.replace(/(?:v-if="!nativeWorkflowHost" )+/g, "");
    value = value.replace('data-test-id="ndv-backdrop"', 'v-if="!nativeWorkflowHost" data-test-id="ndv-backdrop"');
    value = value.replace(
      ':style="{ zIndex: APP_Z_INDEXES.NDV }"\n\t\t>',
      ":style=\"nativeWorkflowHost ? {zIndex: APP_Z_INDEXES.NDV, position: 'absolute', inset: nativeExpanded ? '8px' : 'auto 8px 8px auto', width: nativeExpanded ? 'calc(100% - 16px)' : 'min(1100px, calc(100% - 16px))', height: nativeExpanded ? 'calc(100% - 16px)' : 'min(680px, calc(100% - 16px))', pointerEvents: 'auto'} : { zIndex: APP_Z_INDEXES.NDV }\"\n\t\t>"
    );
    if (!value.includes('data-test-id="native-expand-node-editor"'))
      value = value.replace(
        "<NDVFloatingNodes",
        '<button v-if="nativeWorkflowHost" type="button" data-test-id="native-expand-node-editor" :aria-label="nativeExpanded ? \'Restore node editor\' : \'Expand node editor\'" class="kronterm-expand-node-editor" @click="nativeExpanded = !nativeExpanded">{{ nativeExpanded ? \'↙\' : \'↗\' }}</button>\n\t\t\t<NDVFloatingNodes'
      );
    value = value
      .split("\n")
      .map((line) =>
        line.includes("watch(activeNode, node => nativeWorkflowHost?.onNodeEditorOpen")
          ? "watch(activeNode, node => { if(nativeDetailsRole === 'workflow') nativeWorkflowHost?.onNodeEditorOpen?.(Boolean(node)); });"
          : line
      )
      .join("\n");
    value = value.replace(
      "zIndex: APP_Z_INDEXES.NDV, position:",
      "zIndex: APP_Z_INDEXES.NDV, display: nativeDetailsRole === 'workflow' && nativeWorkflowHost.managementOpen?.value ? 'none' : undefined, position:"
    );
    value = value.replace(
      /inset: nativeExpanded \? '8px' : 'auto 8px 8px auto', width: nativeExpanded \? 'calc\(100% - 16px\)' : 'min\(1100px, calc\(100% - 16px\)\)', height: nativeExpanded \? 'calc\(100% - 16px\)' : 'min\(680px, calc\(100% - 16px\)\)'/g,
      "inset: nativeExpanded ? '8px' : '104px 8px 8px auto', width: nativeExpanded ? 'calc(100% - 16px)' : 'min(760px, calc(100% - 16px))', height: nativeExpanded ? 'calc(100% - 16px)' : 'calc(100% - 112px)', minWidth:0, minHeight:0, maxWidth:'calc(100% - 16px)', margin:0"
    );
    if (!value.includes(":data-workflow-node-editor="))
      value = value.replace(
        'data-test-id="ndv"',
        `data-test-id="ndv"\n            :data-workflow-node-editor="nativeWorkflowHost ? '' : undefined"`
      );
    value = value.replace(
      /inset: nativeExpanded \? '8px' : '104px 8px 8px auto', width: nativeExpanded \? 'calc\(100% - 16px\)' : 'min\(760px, calc\(100% - 16px\)\)', height: nativeExpanded \? 'calc\(100% - 16px\)' : 'calc\(100% - 112px\)'/g,
      "inset: nativeWorkflowHost.dockedPanels ? '8px' : (nativeExpanded ? '8px' : '104px 8px 8px auto'), width: nativeWorkflowHost.dockedPanels ? 'calc(100% - 16px)' : (nativeExpanded ? 'calc(100% - 16px)' : 'min(760px, calc(100% - 16px))'), height: nativeWorkflowHost.dockedPanels ? 'calc(100% - 16px)' : (nativeExpanded ? 'calc(100% - 16px)' : 'calc(100% - 112px)')"
    );
    if (!value.includes("watch(nativeExpanded,"))
      value = value.replace(
        "const nativeExpanded = ref(false);",
        "const nativeExpanded = ref(false);\nwatch(nativeExpanded, expanded => nativeWorkflowHost?.onDetailExpanded?.(expanded));"
      );
    value = value.replace('aria-modal="true"', `:aria-modal="nativeWorkflowHost ? 'false' : 'true'"`);
    return value;
  });
}
