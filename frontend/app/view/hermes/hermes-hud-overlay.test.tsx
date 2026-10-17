// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { HermesHudOverlay } from "./hermes-hud-overlay";

it("escapes clipped workspace ancestors and stays above focused live widgets without blocking the desktop", () => {
    const workspace = document.createElement("div");
    workspace.style.cssText = "overflow:hidden;transform:translateZ(0);height:120px";
    document.body.append(workspace);
    const root = createRoot(workspace);
    try {
        act(() =>
            root.render(
                <HermesHudOverlay>
                    <button style={{ pointerEvents: "auto" }}>Send message</button>
                </HermesHudOverlay>
            )
        );
        const layer = document.querySelector<HTMLElement>("[data-hermes-overlay-layer]");
        expect(layer.parentElement).toBe(document.body);
        expect(workspace.contains(layer)).toBe(false);
        expect(Number(getComputedStyle(layer).zIndex)).toBeGreaterThan(600);
        expect(getComputedStyle(layer).pointerEvents).toBe("none");
        expect(getComputedStyle(layer.querySelector("button")).pointerEvents).toBe("auto");
    } finally {
        act(() => root.unmount());
        workspace.remove();
    }
    expect(document.querySelector("[data-hermes-overlay-layer]")).toBeNull();
});
