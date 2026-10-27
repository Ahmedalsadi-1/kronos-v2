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

it("anchors OS chat below the shell without changing the saved floating geometry", async () => {
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const geometry = { x: 45, y: 70, width: 360, height: 720 };
    try {
        act(() =>
            root.render(
                <HermesHudFrame placement="top" geometry={geometry}>
                    <button>Chat</button>
                </HermesHudFrame>
            )
        );
        const frame = container.querySelector<HTMLElement>("[data-chat-placement=top]");
        expect(frame.style.left).toBe("50%");
        expect(frame.style.bottom).toBe("");
        expect(frame.style.top).toBe("64px");
        expect(frame.style.maxWidth).toContain("100vw");
        act(() =>
            root.render(
                <HermesHudFrame geometry={geometry}>
                    <button>Chat</button>
                </HermesHudFrame>
            )
        );
        const floating = container.querySelector<HTMLElement>("[data-chat-placement=floating]");
        expect(floating.style.left).toBe("45px");
        expect(floating.style.top).toBe("70px");
        expect(floating.style.bottom).toBe("");
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});

it("anchors shell chat to its slot while rendering above clipped widget ancestors", async () => {
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const container = document.createElement("div");
    const slot = document.createElement("div");
    slot.id = "hermes-hud-shell-test";
    slot.className = "os-shell-left";
    document.body.append(container, slot);
    const root = createRoot(container);
    try {
        act(() =>
            root.render(
                <HermesHudOverlay targetId={slot.id}>
                    <HermesHudFrame placement="shell" geometry={{ x: 45, y: 70, width: 360, height: 720 }}>
                        <button>Chat</button>
                    </HermesHudFrame>
                </HermesHudOverlay>
            )
        );
        const frame = document.body.querySelector<HTMLElement>("[data-chat-placement=shell]");
        expect(frame).not.toBeNull();
        expect(frame.style.left).toBe("0px");
        expect(frame.style.top).toBe("0px");
        expect(frame.style.width).toBe("100%");
        expect(frame.classList.contains("absolute")).toBe(true);
        expect(document.querySelector("[data-hermes-overlay-layer]").parentElement).toBe(document.body);
        expect(slot.contains(frame)).toBe(false);
        expect(document.querySelector<HTMLElement>("[data-hermes-overlay-layer]").style.zIndex).toBe("4500");
    } finally {
        act(() => root.unmount());
        container.remove();
        slot.remove();
    }
});
