// @vitest-environment jsdom
import { $krontermInspectorOpen, $krontermInspectorSection } from "@hermes/lib/kronterm-sidebar";
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
it("mounts widget entries inside the original picker slot and follows its scoped search", async () => {
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
        await act(async () => root.render(<OriginalNodePicker />));
        const nativeTarget = element.querySelector('[aria-label="Workflow nodes"]');
        nativeTarget.append(original);
        expect(element.querySelector("[data-widget-query]")).toBeNull();
        await send(slot, "Browser", "tab-b");
        expect(slot.childElementCount).toBe(0);
        await send(slot, "Browser");
        expect(slot.querySelector("[data-widget-query]")?.getAttribute("data-widget-query")).toBe("Browser");
        expect(slot.querySelector("[data-embedded]")?.getAttribute("data-embedded")).toBe("true");
        await send(slot, "Terminal");
        expect(slot.textContent).toBe("Live widget nodes");
        expect(slot.firstElementChild.getAttribute("data-widget-query")).toBe("Terminal");
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
        expect(replacement.childElementCount).toBe(0);
        expect(slot.childElementCount).toBe(0);
        expect(element.querySelector('[aria-label="Workflow nodes"]')).toBe(nativeTarget);
    } finally {
        await act(async () => root.unmount());
        element.remove();
        vi.unstubAllGlobals();
    }
});

it("portals original execution history into the scoped OS bottom dock and releases it on close", async () => {
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
        const history = dock.querySelector('[aria-label="Workflow execution history"]');
        expect(history).not.toBeNull();
        expect(surfaces.mock.calls.at(-1)[0].detail).toMatchObject({
            target: history,
            surface: "executions",
            tabId: "tab-a",
        });
        expect(element.textContent).toContain("Execution history is open below the canvas");
        expect(visibility.mock.calls.at(-1)[0].detail).toEqual({ tabId: "tab-a", open: true });
        await act(async () => dock.querySelector("button").click());
        expect($krontermInspectorOpen.get()).toBe(false);
        expect(dock.childElementCount).toBe(0);
        expect(visibility.mock.calls.at(-1)[0].detail).toEqual({ tabId: "tab-a", open: false });
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
