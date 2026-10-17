import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Surface } from "../types";
import { ComposerWidgetDock, selectDockSurface } from "./composer-widget-dock";
const surface = (id: string, updatedAt: number, status: Surface["status"] = "live"): Surface => ({
    id,
    updatedAt,
    status,
    kind: "terminal",
    title: id,
    subtitle: "",
    hostId: "local",
    hostLabel: "This iPhone",
    hostColor: "purple",
    attention: "none",
    capabilities: ["focus"],
    previewText: "actual guest output",
});
it("prioritizes agent-used and working widgets over the last used one", () => {
    const items = [surface("terminal", 1), surface("browser", 2), surface("desktop", 3, "working")];
    expect(selectDockSurface(items, "terminal", "browser")).toBe("browser");
    expect(selectDockSurface(items, "terminal")).toBe("desktop");
    expect(
        selectDockSurface(
            items.filter((item) => item.id !== "desktop"),
            "terminal"
        )
    ).toBe("terminal");
});
it("renders multiple widgets together with one enlarged and opens the exact clicked surface", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onOpen = vi.fn();
    const items = [surface("terminal", 1), surface("desktop", 2)];
    try {
        await act(async () =>
            root.render(<ComposerWidgetDock surfaces={items} lastUsedId="terminal" onOpen={onOpen} />)
        );
        expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2);
        expect(container.querySelectorAll(".is-active")).toHaveLength(1);
        await act(async () => container.querySelectorAll<HTMLButtonElement>("button")[1].click());
        expect(onOpen).toHaveBeenCalledWith(items[1]);
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
