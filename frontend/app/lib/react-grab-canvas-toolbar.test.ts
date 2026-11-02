// @vitest-environment jsdom
import { $hudComposerPosition } from "@hermes/store/composer-position";
import type { Plugin, ToolbarState } from "react-grab";
import { expect, it, vi } from "vitest";
import { constrainCanvasToolbar, getCanvasToolbarSlot, registerCanvasToolbar } from "./react-grab-canvas-toolbar";

it("keeps the combined toolbar horizontal and outside an open inspector", () => {
    const state: ToolbarState = { edge: "right", ratio: 0.6, enabled: true, collapsed: false };
    const bounds = { left: 270, right: 1480, width: 1210 };
    const next = constrainCanvasToolbar(state, bounds, 680, 2000, "bottom");
    expect(next.edge).toBe("bottom");
    const left = 16 + (2000 - 680 - 32) * next.ratio;
    expect(left).toBeGreaterThanOrEqual(bounds.left + 8);
    expect(left + 680).toBeLessThanOrEqual(bounds.right - 8);
    const dragged = constrainCanvasToolbar({ ...state, edge: "top", ratio: 1 }, bounds, 680, 2000, "bottom");
    expect(dragged.edge).toBe("top");
    expect(16 + (2000 - 680 - 32) * dragged.ratio + 680).toBeLessThanOrEqual(bounds.right - 8);
});

it("moves to the opposite HUD edge and releases the preference listener on cleanup", () => {
    const original = $hudComposerPosition.get();
    $hudComposerPosition.set("top");
    let state: ToolbarState = { edge: "bottom", ratio: 0.4, enabled: true, collapsed: false };
    const api = {
        registerPlugin: vi.fn(),
        unregisterPlugin: vi.fn(),
        deactivate: vi.fn(),
        getToolbarState: () => state,
        setToolbarState: vi.fn((next: Partial<ToolbarState>) => {
            state = { ...state, ...next };
        }),
        onToolbarStateChange: () => vi.fn(),
    };
    const cleanup = registerCanvasToolbar(api);
    try {
        $hudComposerPosition.set("bottom");
        expect(state).toMatchObject({ edge: "top", ratio: 0.4, enabled: true, collapsed: false });
        state = { ...state, collapsed: true };
        $hudComposerPosition.set("top");
        expect(state).toMatchObject({ edge: "bottom", collapsed: false });
        cleanup();
        api.setToolbarState.mockClear();
        $hudComposerPosition.set("bottom");
        expect(api.setToolbarState).not.toHaveBeenCalled();
    } finally {
        cleanup();
        $hudComposerPosition.set(original);
    }
});

it("registers supported canvas menu actions and dispatches only from a visible OS canvas", async () => {
    const root = document.createElement("div");
    root.className = "os-mode-root view-canvas scene-freeform";
    const viewport = document.createElement("div");
    viewport.className = "os-mode-viewport has-workflow-panels";
    viewport.getBoundingClientRect = () => ({ width: 800, height: 600 }) as DOMRect;
    root.append(viewport);
    document.body.append(root);
    let toolbarListener: (state: ToolbarState) => void;
    const unsubscribeToolbar = vi.fn();
    const api = {
        registerPlugin: vi.fn<(plugin: Plugin) => void>(),
        unregisterPlugin: vi.fn(),
        deactivate: vi.fn(),
        getToolbarState: () => ({ enabled: true }) as ToolbarState,
        setToolbarState: vi.fn(),
        onToolbarStateChange: (listener: (state: ToolbarState) => void) => {
            toolbarListener = listener;
            return unsubscribeToolbar;
        },
    };
    const actions = vi.fn();
    const owner = vi.fn();
    window.addEventListener("kronterm:canvas-toolbar-action", actions);
    window.addEventListener("kronterm:canvas-toolbar-owner", owner);
    const cleanup = registerCanvasToolbar(api);
    try {
        const plugin = api.registerPlugin.mock.calls[0][0];
        expect(plugin.name).toBe("kronterm-canvas-toolbar");
        expect(plugin.actions).toHaveLength(16);
        expect(plugin.actions.every((action) => action.showInToolbarMenu)).toBe(true);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
        for (const action of plugin.actions) await action.onAction({} as any);
        expect(api.deactivate).toHaveBeenCalledTimes(16);
        expect(actions.mock.calls.map(([event]) => event.detail.action)).toEqual([
            "select",
            "pan",
            "note",
            "rectangle",
            "ellipse",
            "diamond",
            "connector",
            "fit-all",
            "workflow-fit",
            "zoom-in",
            "zoom-out",
            "tidy",
            "workflow-nodes",
            "workflow-note",
            "workflow-focus",
            "workflow-assistant",
        ]);
        toolbarListener({ enabled: false } as ToolbarState);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")).toBe(false);
        expect((plugin.actions[0].enabled as Function)({})).toBe(false);
        await plugin.actions[0].onAction({} as any);
        expect(actions).toHaveBeenCalledTimes(16);
        toolbarListener({ enabled: true } as ToolbarState);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
        root.hidden = true;
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(false);
        expect((plugin.actions[0].enabled as Function)({})).toBe(false);
        await plugin.actions[0].onAction({} as any);
        expect(actions).toHaveBeenCalledTimes(16);
        root.hidden = false;
        root.classList.remove("scene-freeform");
        await plugin.actions[0].onAction({} as any);
        expect(actions).toHaveBeenCalledTimes(16);
        root.classList.add("scene-freeform");
        document.documentElement.setAttribute("data-kronterm-browser-tool-owner", "");
        window.dispatchEvent(new Event("kronterm-browser-tool-owner"));
        await plugin.actions[0].onAction({} as any);
        expect(actions).toHaveBeenCalledTimes(16);
        document.documentElement.removeAttribute("data-kronterm-browser-tool-owner");
        window.dispatchEvent(new Event("kronterm-browser-tool-owner"));
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
        cleanup();
        expect(api.unregisterPlugin).toHaveBeenCalledWith("kronterm-canvas-toolbar");
        cleanup();
        expect(api.unregisterPlugin).toHaveBeenCalledTimes(1);
        expect(unsubscribeToolbar).toHaveBeenCalledTimes(1);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(false);
        expect(owner.mock.calls.at(-1)[0].detail).toEqual({ available: false, expanded: false });
        await plugin.actions[0].onAction({} as any);
        expect(actions).toHaveBeenCalledTimes(16);
    } finally {
        cleanup();
        root.remove();
        document.documentElement.removeAttribute("data-kronterm-browser-tool-owner");
        window.removeEventListener("kronterm:canvas-toolbar-action", actions);
        window.removeEventListener("kronterm:canvas-toolbar-owner", owner);
    }
});

it("keeps selector ownership while its toolbar is not expanded", () => {
    const root = document.createElement("div");
    root.className = "os-mode-root view-canvas scene-freeform";
    const viewport = document.createElement("div");
    viewport.className = "os-mode-viewport";
    viewport.getBoundingClientRect = () => ({ width: 800, height: 600 }) as DOMRect;
    root.append(viewport);
    document.body.append(root);
    let report: (state: ToolbarState) => void;
    const api = {
        registerPlugin: vi.fn(),
        unregisterPlugin: vi.fn(),
        deactivate: vi.fn(),
        getToolbarState: () => null,
        setToolbarState: vi.fn(),
        onToolbarStateChange: (listener: (state: ToolbarState) => void) => {
            report = listener;
            return vi.fn();
        },
    };
    const cleanup = registerCanvasToolbar(api);
    try {
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")).toBe(false);
        expect(report).toBeTypeOf("function");
        report({ enabled: true } as ToolbarState);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
    } finally {
        cleanup();
        root.remove();
    }
});

it("runs a canvas toolbar menu selection immediately and restores Copy without moving or reopening the toolbar", () => {
    const root = document.createElement("div");
    root.className = "os-mode-root view-canvas scene-freeform";
    const viewport = document.createElement("div");
    viewport.className = "os-mode-viewport";
    viewport.getBoundingClientRect = () => ({ width: 800, height: 600 }) as DOMRect;
    root.append(viewport);
    document.body.append(root);
    let report: (state: ToolbarState) => void;
    const chosen: ToolbarState = {
        edge: "bottom",
        ratio: 0.62,
        collapsed: true,
        enabled: true,
        defaultAction: "kronterm-canvas-pan",
    };
    const api = {
        registerPlugin: vi.fn(),
        unregisterPlugin: vi.fn(),
        deactivate: vi.fn(),
        getToolbarState: () => ({ ...chosen, defaultAction: "copy" }),
        onToolbarStateChange: (listener: (state: ToolbarState) => void) => {
            report = listener;
            return vi.fn();
        },
        setToolbarState: vi.fn((state: Partial<ToolbarState>) => report(state as ToolbarState)),
    };
    const dispatched = vi.fn();
    window.addEventListener("kronterm:canvas-toolbar-action", dispatched);
    const cleanup = registerCanvasToolbar(api);
    try {
        report(chosen);
        expect(dispatched).toHaveBeenCalledTimes(1);
        expect(dispatched.mock.calls[0][0].detail).toEqual({ action: "pan" });
        expect(api.deactivate).toHaveBeenCalledTimes(1);
        expect(api.setToolbarState).toHaveBeenCalledExactlyOnceWith({ ...chosen, defaultAction: "copy" });
        root.hidden = true;
        report(chosen);
        expect(dispatched).toHaveBeenCalledTimes(1);
        expect(api.setToolbarState).toHaveBeenLastCalledWith({ ...chosen, defaultAction: "copy" });
        cleanup();
        report(chosen);
        expect(dispatched).toHaveBeenCalledTimes(1);
    } finally {
        cleanup();
        root.remove();
        window.removeEventListener("kronterm:canvas-toolbar-action", dispatched);
    }
});

it("closes the expanded selector tools without handing ownership back to the fallback toolbar", () => {
    const root = document.createElement("div");
    root.className = "os-mode-root view-canvas scene-freeform";
    const viewport = document.createElement("div");
    viewport.className = "os-mode-viewport";
    viewport.getBoundingClientRect = () => ({ width: 800, height: 600 }) as DOMRect;
    root.append(viewport);
    document.body.append(root);
    let state: ToolbarState = { edge: "bottom", ratio: 0.5, enabled: true, collapsed: false, defaultAction: "copy" };
    let report: (state: ToolbarState) => void;
    const api = {
        registerPlugin: vi.fn(),
        unregisterPlugin: vi.fn(),
        deactivate: vi.fn(),
        getToolbarState: () => state,
        onToolbarStateChange: (listener: (state: ToolbarState) => void) => {
            report = listener;
            return vi.fn();
        },
        setToolbarState: vi.fn((next: Partial<ToolbarState>) => {
            state = { ...state, ...next };
            report(state);
        }),
    };
    const cleanup = registerCanvasToolbar(api);
    try {
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")).toBe(true);
        window.dispatchEvent(new Event("kronterm:canvas-toolbar-close"));
        expect(api.deactivate).toHaveBeenCalledOnce();
        expect(state).toMatchObject({ edge: "bottom", ratio: 0.5, enabled: false, collapsed: true });
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(true);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")).toBe(false);
        api.setToolbarState({ enabled: true, collapsed: false });
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")).toBe(true);
        cleanup();
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")).toBe(false);
        expect(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")).toBe(false);
        window.dispatchEvent(new Event("kronterm:canvas-toolbar-close"));
        expect(api.deactivate).toHaveBeenCalledOnce();
    } finally {
        cleanup();
        root.remove();
    }
});

it("adds an owned portal slot inside the real selector bar without replacing vendor controls", async () => {
    const api = {
        registerPlugin: vi.fn(),
        unregisterPlugin: vi.fn(),
        deactivate: vi.fn(),
        getToolbarState: () => null,
        onToolbarStateChange: () => vi.fn(),
        setToolbarState: vi.fn(),
    };
    const cleanup = registerCanvasToolbar(api);
    const host = document.createElement("div");
    host.dataset.reactGrab = "";
    const shadow = host.attachShadow({ mode: "open" });
    document.body.append(host);
    const updates = vi.fn();
    window.addEventListener("kronterm:canvas-toolbar-slot", updates);
    try {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(getCanvasToolbarSlot()).toBeNull();
        const panel = document.createElement("div");
        panel.dataset.reactGrabToolbarPanel = "";
        const content = document.createElement("div");
        const row = document.createElement("div");
        const buttons = document.createElement("div");
        const vendor = document.createElement("button");
        vendor.textContent = "Copy";
        buttons.append(vendor);
        row.append(buttons);
        content.append(row);
        panel.append(content);
        shadow.append(panel);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        const slot = getCanvasToolbarSlot();
        expect(slot).not.toBeNull();
        expect(slot.parentElement).toBe(buttons);
        expect(buttons.firstElementChild).toBe(vendor);
        expect(shadow.querySelectorAll("[data-kronterm-canvas-tools-slot]")).toHaveLength(1);
        expect(updates.mock.calls.at(-1)[0].detail.target).toBe(slot);
        const portal = document.createElement("div");
        portal.className = "os-canvas-tool-rail is-in-selector";
        slot.append(portal);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(getCanvasToolbarSlot()).toBe(slot);
        expect(shadow.querySelectorAll("[data-kronterm-canvas-tools-style]")).toHaveLength(1);
        const style = shadow.querySelector("style");
        expect(style.textContent).toContain(".os-canvas-tool-rail.is-closed{display:none!important}");
        cleanup();
        expect(getCanvasToolbarSlot()).toBeNull();
        expect(vendor.isConnected).toBe(true);
        expect(buttons.firstElementChild).toBe(vendor);
        expect(shadow.querySelector("[data-kronterm-canvas-tools-slot]")).toBeNull();
        expect(shadow.querySelector("[data-kronterm-canvas-tools-style]")).toBeNull();
        expect(updates.mock.calls.at(-1)[0].detail.target).toBeNull();
    } finally {
        cleanup();
        host.remove();
        window.removeEventListener("kronterm:canvas-toolbar-slot", updates);
    }
});
