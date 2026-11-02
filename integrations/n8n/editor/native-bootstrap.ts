import { useUIStore } from "@/app/stores/ui.store";
import { useNodeCreatorStore } from "@/features/shared/nodeCreator/nodeCreator.store";
import { createRenderer, nextTick, nodeOps, patchProp, ref, shallowRef, watch } from "vue";

import "@vue-flow/controls/dist/style.css";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
import "@vue-flow/node-resizer/dist/style.css";

import "@n8n/design-system/css/index.scss";
import "vue-json-pretty/lib/styles.css";

import "@/features/ai/assistant/aiBuilderDiff.scss";
import "@/main.scss";
import "./kronterm-native.css";
// Ensure i18n HMR owner is evaluated as early as possible in dev
import "@/app/dev/i18nHmr";

import App from "@/app/App.vue";
import router from "@/app/router";

import { IconBodyLoaderKey } from "@n8n/design-system";
import { loadLucideIconBody } from "@n8n/design-system/icons/lucide";
import { i18nInstance } from "@n8n/i18n";

import { GlobalComponentsPlugin } from "@/app/plugins/components";
import { GlobalDirectivesPlugin } from "@/app/plugins/directives";
import { TelemetryPlugin } from "@/app/plugins/telemetry";

import { registerShellCapabilities } from "@/app/capabilities.manifest";
import { registerComponentSlots } from "@/app/componentSlots.manifest";
import { installRenderTracker } from "@/app/dev/render-tracker";
import { registerEagerModals } from "@/app/modals.manifest";
import { registerModuleRoutes } from "@/app/moduleInitializer/moduleInitializer";
import { ChartJSPlugin } from "@/app/plugins/chartjs";
import { SentryPlugin } from "@/app/plugins/sentry";
import { registerVitePreloadErrorHandler } from "@/app/plugins/vitePreloadError";
import { registerUpgradeRedirectGuard } from "@/app/upgradeRedirectGuard.manifest";
import { useRootStore } from "@n8n/stores/useRootStore";
import { createPinia, PiniaVuePlugin } from "pinia";
import { observeNativePanels } from "./native-panel-layout.mjs";
import { createNativeSession } from "./native-session.mjs";

import type { VueScanOptions } from "z-vue-scan";

registerVitePreloadErrorHandler();
const session = createNativeSession(createPinia, {
    routes: () => registerModuleRoutes(router),
    modals: registerEagerModals,
    slots: registerComponentSlots,
    capabilities: registerShellCapabilities,
    upgradeGuard: registerUpgradeRedirectGuard,
});

export async function mount(element: HTMLElement, host: any) {
    session.prepare();
    host.sceneElement = element;
    host.disposing = false;
    host.worldCamera = shallowRef(Object.freeze({ ...host.camera }));
    host.objectOrderRef = shallowRef({ ...host.objectOrder });
    host.setViewport = (camera: any) => {
        if (![camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom <= 0)
            throw new Error("Invalid OS camera");
        host.camera = { ...camera };
        host.worldCamera.value = Object.freeze({ ...camera });
    };
    host.setObjectOrder = (order: Record<string, number>) => {
        host.objectOrderRef.value = { ...order };
    };
    if (host.worldTarget) {
        const worldStyle = document.createElement("style");
        worldStyle.textContent =
            ":host{display:contents!important;position:static!important;transform:none!important;z-index:auto!important;isolation:auto!important;contain:none!important;overflow:visible!important;background:transparent!important}:host([hidden]){display:none!important}";
        host.worldTarget.getRootNode().appendChild(worldStyle);
        host.worldTarget.style.cssText =
            "display:contents;position:static;transform:none;z-index:auto;isolation:auto;contain:none;overflow:visible;pointer-events:none";
    }
    const originalVars = new Map<HTMLElement, Map<string, string>>();
    const originalThemes = new Map<HTMLElement, string | null>();
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)");
    host.appearance = ref("light");
    const cssVars = new Map<string, string>();
    const surfaceHosts = () =>
        Array.from(
            new Set(
                [
                    element,
                    host.worldTarget,
                    host.chromeTarget,
                    host.toolsTarget,
                    host.focusTarget,
                    host.headerTarget,
                    host.logsTarget,
                    host.detailTarget,
                    host.pickerTarget?.value,
                    host.executionTarget?.value,
                ]
                    .filter(Boolean)
                    .map((target: HTMLElement) => ((target.getRootNode() as ShadowRoot).host as HTMLElement) || target)
            )
        );
    const applySurfaceTheme = () => {
        const osTheme =
            host.theme ||
            document.documentElement.getAttribute("data-theme") ||
            document.body.getAttribute("data-theme") ||
            (document.documentElement.classList.contains("dark") ? "dark" : "system");
        host.appearance.value = osTheme === "system" ? (preferredTheme.matches ? "dark" : "light") : osTheme;
        for (const target of surfaceHosts()) {
            if (!originalThemes.has(target)) originalThemes.set(target, target.getAttribute("data-theme"));
            if (osTheme === "system") target.removeAttribute("data-theme");
            else target.setAttribute("data-theme", osTheme);
        }
    };
    host.setTheme = (theme: string) => {
        host.theme = theme;
        applySurfaceTheme();
    };
    host.setCssVar = (name: string, value: string) => {
        cssVars.set(name, value);
        for (const target of surfaceHosts()) {
            if (!originalVars.has(target)) originalVars.set(target, new Map());
            const saved = originalVars.get(target)!;
            if (!saved.has(name)) saved.set(name, target.style.getPropertyValue(name));
            if (target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
        }
    };
    const syncSurfaceStyles = () => {
        applySurfaceTheme();
        for (const [name, value] of cssVars) host.setCssVar(name, value);
    };
    const themeObserver = new MutationObserver(applySurfaceTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
    preferredTheme.addEventListener("change", applySurfaceTheme);
    applySurfaceTheme();
    const pinia = session.stores;

    const root = element.getRootNode() as ShadowRoot;
    host.querySelector = (selector: string) =>
        root.querySelector(selector) ??
        host.worldTarget?.querySelector(selector) ??
        host.detailTarget?.getRootNode()?.querySelector?.(selector) ??
        null;
    host.shouldHandleEvent = (event: Event) =>
        !host.documentMutation?.value &&
        event.composedPath().some((target) => surfaceHosts().includes(target as HTMLElement));
    const renderer = createRenderer({
        ...nodeOps,
        patchProp,
        querySelector: (selector: string) =>
            root.querySelector(selector) ??
            host.detailTarget?.getRootNode()?.querySelector?.(selector) ??
            root.querySelector("#app-modals") ??
            host.detailTarget ??
            element,
    });
    const app = renderer.createApp(App);

    app.provide(IconBodyLoaderKey, loadLucideIconBody);

    app.use(SentryPlugin);

    app.use(TelemetryPlugin);
    app.use(PiniaVuePlugin);
    app.use(GlobalComponentsPlugin);
    app.use(GlobalDirectivesPlugin);
    app.use(pinia);
    (useRootStore(pinia) as any).setNativeBaseUrl?.((window as any).BASE_PATH);
    app.use(router);
    app.use(i18nInstance);
    app.use(ChartJSPlugin);

    // Opt-in component re-render counter for the canvas performance benchmark.
    // No-op unless the N8N_RENDER_TRACKING localStorage flag is set, so it is
    // inert for real users. Must run before mount so the mixin covers every
    // component.
    installRenderTracker(app);

    if (import.meta.env.VUE_SCAN) {
        const { default: VueScan } = await import("z-vue-scan");
        app.use<VueScanOptions>(VueScan, {
            enable: true,
        });
    }

    host.documentMutation = ref(false);
    host.managementOpen = ref(false);
    host.beginDocumentMutation = async () => {
        const state = host.getDocumentState?.();
        if (!state || state.dirty) throw new Error("Save local workflow edits before applying Hermes changes.");
        host.documentMutation.value = true;
        await nextTick();
        return state;
    };
    host.endDocumentMutation = () => {
        host.documentMutation.value = false;
    };
    const pickerPark = document.createElement("div");
    pickerPark.hidden = true;
    element.appendChild(pickerPark);
    host.pickerParked = ref(true);
    host.pickerTarget = ref(pickerPark);
    host.executionTarget = ref(null);
    host.setExecutionTarget = (target: HTMLElement | null) => {
        host.executionTarget.value = target;
        syncSurfaceStyles();
    };
    host.setPickerTarget = (target: HTMLElement | null) => {
        host.pickerParked.value = !target;
        host.pickerTarget.value = target || pickerPark;
        syncSurfaceStyles();
        if (target) void nextTick(() => target.querySelector("input")?.focus());
    };
    host.openPicker = async () => {
        if (host.managementOpen.value) {
            await router.push(host.editorPath || "/workflow/" + host.workflowId);
            if (!router.currentRoute.value.meta.nodeView) return;
        }
        const store = useNodeCreatorStore(pinia);
        if (!store.isCreateNodeActive) store.openNodeCreatorForRegularNodes(host.workflowId, "canvas");
    };
    const stopPicker = watch(
        () => useNodeCreatorStore(pinia).isCreateNodeActive,
        (open) => {
            if (open) host.onInspector?.("nodes");
        },
        { flush: "sync" }
    );
    const stopDirty = watch(
        () => useUIStore(pinia).stateIsDirty,
        (dirty) => {
            if (!host.isReconcilingDocument) host.onDirty?.(dirty);
        },
        { flush: "sync" }
    );
    const stopRoute = router.afterEach((route) => {
        if (route.meta.layout === "workflow" && route.meta.nodeView) host.editorPath = route.fullPath;
        const id = String(route.params.workflowId || "");
        if (id && id !== "new") host.workflowId = id;
        host.onRoute?.(route.fullPath, id);
    });
    const stopPanels = observeNativePanels(host);
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        host.disposing = true;
        stopPanels();
        stopDirty();
        stopPicker();
        stopRoute();
        app.unmount();
        pickerPark.remove();
        themeObserver.disconnect();
        preferredTheme.removeEventListener("change", applySurfaceTheme);
        for (const [target, vars] of originalVars)
            for (const [name, value] of vars)
                value ? target.style.setProperty(name, value) : target.style.removeProperty(name);
        for (const [target, theme] of originalThemes)
            theme == null ? target.removeAttribute("data-theme") : target.setAttribute("data-theme", theme);
        if ((window as any).__KRONTERM_WORKFLOW_HOST__ === host) delete (window as any).__KRONTERM_WORKFLOW_HOST__;
    };
    try {
        await router.isReady();
        await router.replace(host.path || "/workflow/new");
        app.mount(element);
        host.navigate = (path: string) =>
            router.currentRoute.value.fullPath === path ? Promise.resolve() : router.push(path);
        return dispose;
    } catch (error) {
        dispose();
        throw error;
    }
}
