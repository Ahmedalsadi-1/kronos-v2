// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PenTaskGroupMenu } from "./pen-task-group-menu";

it("opens only on explicit clicks and excludes kept and unrelated tabs from cleanup", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onOpen = vi.fn(), onClose = vi.fn(async () => {}), onToggle = vi.fn(), onKeep = vi.fn();
    try {
        await act(async () => root.render(<PenTaskGroupMenu
            group={{ id: "task", title: "Research", status: "completed", tabIds: ["owned", "kept"], actions: [{ id: "action", title: "Read page", timestamp: 1, status: "completed", blockId: "owned", image: "data:image/png;base64,a", result: "Page read" }] }}
            tabs={[{ id: "owned", app: "browser", title: "Test page" }, { id: "kept", app: "browser" }, { id: "personal", app: "browser" }]}
            keptTabs={["kept"]} collapsed={false} onToggle={onToggle} onOpen={onOpen} onClose={onClose} onKeep={onKeep} />));
        expect(onOpen).not.toHaveBeenCalled();
        const button = (text: string) => [...document.querySelectorAll("button")].find((item) => item.textContent === text)!;
        await act(async () => button("⋯").click());
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
        await act(async () => button("Keep tab").click());
        expect(onKeep).toHaveBeenCalledWith("owned");
        await act(async () => button("Close task tabs").click());
        expect(onClose).toHaveBeenCalledWith(["owned"]);
        await act(async () => button("Open tab").click());
        expect(onOpen).toHaveBeenCalledWith("owned");
        expect(document.querySelector("img").alt).toBe("Captured after Read page");
    } finally { await act(async () => root.unmount()); host.remove(); }
});
