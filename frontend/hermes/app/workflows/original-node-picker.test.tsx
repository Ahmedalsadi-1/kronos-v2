// @vitest-environment jsdom
import { $krontermInspectorOpen, $krontermInspectorSection } from "@hermes/lib/kronterm-sidebar";
import { $workflowPickerComfyTarget, $workflowPickerCommandTarget, $workflowPickerSource } from "@hermes/store/command-palette";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OriginalExecutionsPanel, OriginalNodePicker } from "./original-node-picker";
vi.mock("./workflow-context", () => ({
    useWorkflowContext: () => ({ tabId: "tab-a", workflowId: "flow-a", hasExecutions: true }),
}));
vi.mock("./workspace-widget-picker", () => ({
    WorkspaceWidgetPicker: ({ query, embedded }) => (
        <div data-widget-query={query} data-embedded={embedded}>
            Live widget nodes
        </div>
    ),
}));

it("keeps the native search and closes the popup with Escape", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const onClose = vi.fn();
    const search = document.createElement("input");
    search.dataset.testId = "node-creator-search-bar";
    const mount = (event: Event) => {
        const target = (event as CustomEvent).detail.target as HTMLElement | null;
        if (target) (target.shadowRoot ?? target.attachShadow({ mode: "open" })).append(search);
    };
    window.addEventListener("kronterm:original-node-picker", mount);
    try {
        await act(async () => root.render(<OriginalNodePicker tabId="tab-a" onClose={onClose} />));
        const popup = document.querySelector('[aria-label="Workflow node picker"]');
        expect(element.contains(popup)).toBe(false);
        expect(popup.querySelector('[aria-label="Workflow nodes"]').shadowRoot.contains(search)).toBe(true);
        expect(popup.textContent).not.toContain("Find form nodes");
        await act(async () => popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(onClose).toHaveBeenCalledOnce();
    } finally {
        await act(async () => root.unmount());
        window.removeEventListener("kronterm:original-node-picker", mount);
        element.remove();
        vi.unstubAllGlobals();
    }
});

it("keeps widgets, KronRender and commands in the original picker and shares its scoped search", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const original = document.createElement("div");
    original.dataset.testId = "node-creator";
    const slot = document.createElement("div");
    original.append(slot);
    const send = (target: HTMLElement, query = "", tabId = "tab-a") =>
        act(async () => {
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-widget-picker-target", { detail: { target, query, tabId } })
            );
        });
    try {
        await act(async () => root.render(<OriginalNodePicker tabId="tab-a" onClose={() => {}} />));
        const nativeTarget = document.querySelector(
            '[aria-label="Workflow node picker"] [aria-label="Workflow nodes"]'
        );
        nativeTarget.append(original);
        expect(element.querySelector("[data-widget-query]")).toBeNull();
        await send(slot, "Browser", "tab-b");
        expect(slot.childElementCount).toBe(0);
        await send(slot, "Browser");
        expect(slot.querySelector("[data-widget-query]")?.getAttribute("data-widget-query")).toBe("Browser");
        expect(slot.querySelector("[data-embedded]")?.getAttribute("data-embedded")).toBe("true");
        const catalogs = [$workflowPickerComfyTarget, $workflowPickerCommandTarget];
        for (const catalog of catalogs) {
            expect(catalog.get()?.query).toBe("Browser");
            expect(catalog.get()?.element.parentElement).toBe(slot);
        }
        await send(slot, "Terminal");
        expect(slot.textContent).toBe("Live widget nodes");
        expect(slot.firstElementChild.getAttribute("data-widget-query")).toBe("Terminal");
        expect(catalogs.map((catalog) => catalog.get()?.query)).toEqual(["Terminal", "Terminal"]);
        const replacement = document.createElement("div");
        original.append(replacement);
        await send(replacement, "Browser");
        await act(async () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-widget-picker-target", {
                    detail: { tabId: "tab-a", target: null, previousTarget: slot },
                })
            )
        );
        expect(replacement.textContent).toBe("Live widget nodes");
        await send(null);
        expect(catalogs.map((catalog) => catalog.get())).toEqual([null, null]);
        expect(replacement.childElementCount).toBe(0);
        expect(slot.childElementCount).toBe(0);
        expect(document.querySelector('[aria-label="Workflow node picker"] [aria-label="Workflow nodes"]')).toBe(
            nativeTarget
        );
    } finally {
        await act(async () => root.unmount());
        element.remove();
        vi.unstubAllGlobals();
    }
});

it("switches to dedicated KronRender search even when native n8n results are available", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const original = document.createElement("div");
    const slot = document.createElement("div");
    original.append(slot);
    $workflowPickerSource.set("n8n");
    try {
        await act(async () => root.render(<OriginalNodePicker tabId="tab-a" onClose={() => {}} />));
        const nativeTarget = document.querySelector<HTMLElement>('[aria-label="Workflow nodes"]');
        nativeTarget.append(original);
        await act(async () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-widget-picker-target", {
                    detail: { tabId: "tab-a", target: slot, query: "Webhook" },
                })
            )
        );
        expect($workflowPickerCommandTarget.get()?.query).toBe("Webhook");

        const sources = document.querySelector('[aria-label="Workflow catalog"]');
        const sourceButton = (label: string) =>
            Array.from(sources.querySelectorAll("button")).find((button) => button.textContent === label);
        await act(async () => sourceButton("KronRender nodes").click());
        const search = document.querySelector<HTMLInputElement>('[aria-label="Search KronRender nodes"]');
        expect(search).not.toBeNull();
        expect(document.activeElement).toBe(search);
        expect(nativeTarget.hidden).toBe(true);
        expect($workflowPickerComfyTarget.get()).toMatchObject({ query: "", tabId: "tab-a" });
        expect($workflowPickerCommandTarget.get()).toBeNull();

        const result = document.createElement("button");
        result.dataset.krontermPickerResult = "";
        vi.spyOn(result, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
        $workflowPickerComfyTarget.get().element.append(result);
        const select = vi.fn();
        result.addEventListener("click", select);
        search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement).toBe(result);
        result.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(select).toHaveBeenCalledOnce();
        result.remove();

        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, "pixel");
            search.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect($workflowPickerComfyTarget.get()?.query).toBe("pixel");

        await act(async () => sourceButton("KronRender models").click());
        expect(sourceButton("KronRender models").getAttribute("aria-pressed")).toBe("true");
        expect(document.querySelector('[aria-label="Search KronRender models"]')).toBe(search);
        expect(search.value).toBe("pixel");

        await act(async () => sourceButton("All nodes").click());
        expect(nativeTarget.hidden).toBe(false);
        expect($workflowPickerCommandTarget.get()?.query).toBe("Webhook");
    } finally {
        await act(async () => root.unmount());
        $workflowPickerSource.set(null);
        element.remove();
        vi.unstubAllGlobals();
    }
});

it("keeps inspector execution history in the side panel when a canvas dock exists", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    const dock = document.createElement("div");
    document.body.append(element, dock);
    const root = createRoot(element);
    const surfaces = vi.fn();
    const visibility = vi.fn();
    const target = (tabId = "tab-a") =>
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-executions-dock-target", { detail: { tabId, target: dock } })
        );
    window.addEventListener("kronterm:workflow-surface", surfaces);
    window.addEventListener("kronterm:workflow-executions-dock-visibility", visibility);
    try {
        await act(async () => {
            $krontermInspectorOpen.set(true);
            $krontermInspectorSection.set("workflow-executions");
            root.render(<OriginalExecutionsPanel active />);
        });
        expect(element.querySelector('[aria-label="Workflow execution history"]')).not.toBeNull();
        await act(async () => target("other-tab"));
        expect(dock.childElementCount).toBe(0);
        await act(async () => target());
        const history = element.querySelector('[aria-label="Workflow execution history"]');
        expect(history).not.toBeNull();
        expect(dock.childElementCount).toBe(0);
        expect(surfaces.mock.calls.at(-1)[0].detail).toMatchObject({
            target: history,
            surface: "executions",
            tabId: "tab-a",
        });
        expect(visibility).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        element.remove();
        dock.remove();
        window.removeEventListener("kronterm:workflow-surface", surfaces);
        window.removeEventListener("kronterm:workflow-executions-dock-visibility", visibility);
        vi.unstubAllGlobals();
    }
});

it("opens dock-only history independently of inspector visibility and closes through its scoped owner", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    const dock = document.createElement("div");
    document.body.append(element, dock);
    const root = createRoot(element);
    const close = vi.fn();
    window.addEventListener("kronterm:workflow-executions-dock-close", close);
    try {
        await act(async () => {
            $krontermInspectorOpen.set(false);
            $krontermInspectorSection.set("workflow-nodes");
            root.render(<OriginalExecutionsPanel active dockOnly />);
        });
        expect(element.childElementCount).toBe(0);
        await act(async () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-executions-dock-target", {
                    detail: { tabId: "tab-a", target: dock },
                })
            )
        );
        expect(dock.querySelector('[aria-label="Workflow execution history"]')).not.toBeNull();
        expect(element.childElementCount).toBe(0);
        await act(async () => dock.querySelector("button").click());
        expect(close.mock.calls.at(-1)[0].detail).toEqual({ tabId: "tab-a" });
        expect($krontermInspectorSection.get()).toBe("workflow-nodes");
        expect($krontermInspectorOpen.get()).toBe(false);
    } finally {
        await act(async () => root.unmount());
        window.removeEventListener("kronterm:workflow-executions-dock-close", close);
        element.remove();
        dock.remove();
        vi.unstubAllGlobals();
    }
});
