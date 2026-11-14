// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { $hudComposerPosition } from "@hermes/store/composer-position";
import type { ReactGrabAPI, ToolbarState } from "react-grab";
import { installSelectorToolbarChrome, SelectorToolbarStyles } from "./selector-toolbar-chrome";

const Actions = [
    ["select", "Select"],
    ["pan", "Pan canvas"],
    ["note", "Add note"],
    ["rectangle", "Add rectangle"],
    ["ellipse", "Add ellipse"],
    ["diamond", "Add decision"],
    ["connector", "Connect objects"],
    ["fit-all", "Fit all objects"],
    ["workflow-fit", "Fit workflow"],
    ["zoom-in", "Zoom in"],
    ["zoom-out", "Zoom out"],
    ["tidy", "Tidy workflow"],
    ["workflow-nodes", "Add workflow node"],
    ["workflow-note", "Add workflow note"],
    ["workflow-focus", "Focus workflow"],
    ["workflow-assistant", "Ask workflow assistant"],
] as const;
const PluginName = "kronterm-canvas-toolbar";
const OwnerAttribute = "data-kronterm-canvas-toolbar-owner";
const ExpandedAttribute = "data-kronterm-canvas-toolbar-expanded";

let canvasToolbarSlot: HTMLElement;

export function constrainCanvasToolbar(
    state: ToolbarState,
    bounds: Pick<DOMRect, "left" | "right" | "width">,
    toolbarWidth: number,
    viewportWidth: number,
    preferredEdge: "top" | "bottom"
): ToolbarState {
    const horizontal = state.edge === "top" || state.edge === "bottom";
    const edge = horizontal ? state.edge : preferredEdge;
    const span = viewportWidth - toolbarWidth - 32;
    if (span <= 0) return { ...state, edge, ratio: 0.5 };
    const minimum = Math.max(0, (bounds.left + 8 - 16) / span);
    const maximum = Math.max(minimum, Math.min(1, (bounds.right - toolbarWidth - 8 - 16) / span));
    const ratio = Math.max(minimum, Math.min(maximum, horizontal ? state.ratio : 0.5));
    return { ...state, edge, ratio };
}

export function getCanvasToolbarSlot(): HTMLElement {
    return canvasToolbarSlot?.isConnected ? canvasToolbarSlot : null;
}

function currentCanvas(): HTMLElement {
    if (document.documentElement.hasAttribute("data-kronterm-browser-tool-owner")) return null;
    const candidates = document.querySelectorAll<HTMLElement>(
        ".os-mode-root.view-canvas.scene-freeform .os-mode-viewport"
    );
    return [...candidates].find((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return false;
        for (let element = candidate; element; element = element.parentElement) {
            const style = getComputedStyle(element);
            if (element.hidden || style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
                return false;
        }
        return true;
    });
}

export function registerCanvasToolbar(
    api: Pick<
        ReactGrabAPI,
        | "registerPlugin"
        | "unregisterPlugin"
        | "deactivate"
        | "getToolbarState"
        | "onToolbarStateChange"
        | "setToolbarState"
    >
): () => void {
    const releaseSlot = installSelectorToolbarChrome(SelectorToolbarStyles, (target) => {
        if (canvasToolbarSlot === target) return;
        canvasToolbarSlot = target;
        window.dispatchEvent(new CustomEvent("kronterm:canvas-toolbar-slot", { detail: { target } }));
    });
    let disposed = false;
    let toolbarState = api.getToolbarState();
    let toolbarEnabled = toolbarState?.enabled ?? false;
    let unsubscribeToolbar = () => {};
    let observedCanvas: HTMLElement;
    let observedToolbar: HTMLElement;
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => syncOwner());
    const releasePosition = $hudComposerPosition.subscribe((position) => {
        const current = api.getToolbarState();
        const edge = position === "bottom" ? "top" : "bottom";
        if (current && current.edge !== edge) {
            api.setToolbarState({ ...current, edge, collapsed: current.enabled ? false : current.collapsed });
        }
    });
    const syncOwner = () => {
        const canvas = disposed ? null : currentCanvas();
        if (canvas !== observedCanvas) {
            resizeObserver?.disconnect();
            observedToolbar = null;
            if (canvas) resizeObserver?.observe(canvas);
            observedCanvas = canvas;
        }
        if (canvas && toolbarState) {
            const bounds = canvas.getBoundingClientRect();
            const toolbar = canvasToolbarSlot?.closest<HTMLElement>("[data-react-grab-toolbar]");
            if (toolbar && toolbar !== observedToolbar) {
                if (observedToolbar) resizeObserver?.unobserve(observedToolbar);
                resizeObserver?.observe(toolbar);
                observedToolbar = toolbar;
            }
            const width = toolbar?.getBoundingClientRect().width ?? 0;
            if (width > 0 && !toolbarState.collapsed) {
                const next = constrainCanvasToolbar(
                    toolbarState,
                    bounds,
                    width,
                    window.innerWidth,
                    $hudComposerPosition.get() === "bottom" ? "top" : "bottom"
                );
                if (next.edge !== toolbarState.edge || Math.abs(next.ratio - toolbarState.ratio) > 0.001) {
                    toolbarState = next;
                    api.setToolbarState(next);
                }
            }
        }
        if (!disposed && toolbarState?.edge) {
            document.documentElement.dataset.krontermSelectorEdge = toolbarState.edge;
            document.documentElement.style.setProperty("--kronterm-selector-position", `${toolbarState.ratio * 100}vw`);
        }
        const available = !disposed && Boolean(currentCanvas());
        const expanded = available && toolbarEnabled && !toolbarState?.collapsed;
        if (
            document.documentElement.hasAttribute(OwnerAttribute) === available &&
            document.documentElement.hasAttribute(ExpandedAttribute) === expanded
        )
            return;
        document.documentElement.toggleAttribute(OwnerAttribute, available);
        document.documentElement.toggleAttribute(ExpandedAttribute, expanded);
        window.dispatchEvent(new CustomEvent("kronterm:canvas-toolbar-owner", { detail: { available, expanded } }));
    };
    const observer = new MutationObserver(syncOwner);
    const closeToolbar = () => {
        if (disposed || !currentCanvas()) return;
        api.deactivate();
        const current = api.getToolbarState() ?? toolbarState;
        if (!current) return;
        toolbarState = { ...current, enabled: false, collapsed: true };
        toolbarEnabled = false;
        api.setToolbarState(toolbarState);
        syncOwner();
    };
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        observer.disconnect();
        resizeObserver?.disconnect();
        window.removeEventListener("resize", syncOwner);
        releaseSlot();
        unsubscribeToolbar();
        releasePosition();
        delete document.documentElement.dataset.krontermSelectorEdge;
        document.documentElement.style.removeProperty("--kronterm-selector-position");
        window.removeEventListener("kronterm-browser-tool-owner", syncOwner);
        window.removeEventListener("kronterm:canvas-toolbar-close", closeToolbar);
        syncOwner();
    };
    const runAction = (action: (typeof Actions)[number][0]) => {
        if (disposed || !toolbarEnabled || !currentCanvas()) return;
        api.deactivate();
        window.dispatchEvent(new CustomEvent("kronterm:canvas-toolbar-action", { detail: { action } }));
    };
    api.registerPlugin({
        name: PluginName,
        actions: Actions.map(([action, label]) => ({
            id: `kronterm-canvas-${action}`,
            label,
            showInToolbarMenu: true,
            enabled: () => !disposed && toolbarEnabled && Boolean(currentCanvas()),
            onAction: () => runAction(action),
        })),
        setup: () => ({
            cleanup: () => {
                cleanup();
                return undefined;
            },
        }),
    });
    let handlingToolbarAction = false;
    unsubscribeToolbar = api.onToolbarStateChange((state) => {
        toolbarState = state;
        toolbarEnabled = state.enabled;
        syncOwner();
        if (disposed || handlingToolbarAction) return;
        const selected = Actions.find(([action]) => state.defaultAction === `kronterm-canvas-${action}`);
        if (!selected) return;
        handlingToolbarAction = true;
        try {
            runAction(selected[0]);
            api.setToolbarState({ ...state, defaultAction: "copy" });
        } finally {
            handlingToolbarAction = false;
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden"],
    });
    window.addEventListener("kronterm-browser-tool-owner", syncOwner);
    window.addEventListener("resize", syncOwner);
    window.addEventListener("kronterm:canvas-toolbar-close", closeToolbar);
    syncOwner();
    let released = false;
    return () => {
        if (released) return;
        released = true;
        cleanup();
        api.unregisterPlugin(PluginName);
    };
}
