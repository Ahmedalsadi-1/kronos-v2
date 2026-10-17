// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { emptyProductivityState } from "../../types/productivity";
import { PersonalProductivity, type PersonalProductivityBridge } from "./personal-productivity";

vi.mock("./coucou-workbench-appearance", () => ({ useCoucouWorkbenchAppearance: () => ({}) }));
let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
});
async function mount(api: PersonalProductivityBridge) {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<PersonalProductivity api={api} />));
}
it("uses live changes rather than a late stale initial snapshot", async () => {
    let initial: (value: any) => void;
    let change: (value: any) => void;
    await mount({
        getProductivityState: () =>
            new Promise((resolve) => {
                initial = resolve;
            }),
        updateProductivity: vi.fn(),
        onProductivityState: (callback) => {
            change = callback;
            return () => {};
        },
    });
    const state = emptyProductivityState();
    state.tasks.push({ id: "live", title: "Live task", status: "open", createdAt: 0, updatedAt: 0 });
    await act(async () => {
        change(state);
        initial(emptyProductivityState());
    });
    expect(container.textContent).toContain("Live task");
});
it("shows failed commands without falsely completing the task", async () => {
    const state = emptyProductivityState();
    state.tasks.push({ id: "task", title: "Keep me open", status: "open", createdAt: 0, updatedAt: 0 });
    const update = vi.fn().mockRejectedValue(new Error("Disk unavailable"));
    await mount({
        getProductivityState: async () => state,
        updateProductivity: update,
        onProductivityState: () => () => {},
    });
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => checkbox.click());
    expect(update).toHaveBeenCalledWith({ type: "task.status", id: "task", status: "completed" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Disk unavailable");
    expect(checkbox.checked).toBe(false);
});
