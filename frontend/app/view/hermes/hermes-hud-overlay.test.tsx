import { useHudComposerDrag } from "@hermes/app/hud/composer-drag";
// @vitest-environment jsdom

import { HudComposerSurfaceControls } from "@hermes/app/hud/island-controls";
import { TooltipProvider } from "@hermes/components/ui/tooltip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
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

it("moves the same shell composer to a centered viewport bottom anchor and keeps its draft", async () => {
    const { $hudComposerPosition } = await import("@hermes/store/composer-position");
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const container = document.createElement("div");
    const slot = document.createElement("div");
    slot.id = "composer-position-shell";
    slot.getBoundingClientRect = () => ({ left: 500, top: 4, width: 320, height: 48 }) as DOMRect;
    document.body.append(container, slot);
    const root = createRoot(container);
    try {
        act(() => {
            $hudComposerPosition.set("top");
            root.render(
                <HermesHudOverlay targetId={slot.id}>
                    <HermesHudFrame placement="shell" geometry={{ x: 0, y: 0, width: 320, height: 400 }}>
                        <textarea defaultValue="" />
                    </HermesHudFrame>
                </HermesHudOverlay>
            );
        });
        const layer = document.querySelector<HTMLElement>("[data-hermes-overlay-layer]");
        const frame = layer.querySelector<HTMLElement>("[data-chat-placement=shell]");
        const editor = frame.querySelector("textarea");
        editor.value = "Keep my HUD draft";
        expect(layer.style.left).toBe("500px");
        expect(layer.style.top).toBe("4px");
        act(() => $hudComposerPosition.set("bottom"));
        expect(document.querySelector("[data-hermes-overlay-layer]")).toBe(layer);
        expect(frame.querySelector("textarea")).toBe(editor);
        expect(editor.value).toBe("Keep my HUD draft");
        expect(layer.dataset.chatEdge).toBe("bottom");
        expect(layer.style.left).toBe("500px");
        expect(layer.style.width).toBe("320px");
        expect(layer.style.transform).toBe("none");
        expect(layer.style.top).toBe("auto");
        expect(layer.style.bottom).toBe("36px");
        expect(frame.style.top).toBe("auto");
        expect(frame.style.bottom).toBe("0px");
        act(() => $hudComposerPosition.set("top"));
        expect(layer.style.top).toBe("4px");
        expect(layer.style.bottom).toBe("");
        expect(frame.style.top).toBe("0px");
        expect(frame.style.bottom).toBe("");
    } finally {
        act(() => root.unmount());
        $hudComposerPosition.set("top");
        container.remove();
        slot.remove();
    }
});

it("detaches and reattaches the same mounted composer as a draggable island", async () => {
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        act(() =>
            root.render(
                <HermesHudFrame placement="shell" geometry={{ x: 45, y: 70, width: 360, height: 720 }}>
                    <TooltipProvider>
                        <div data-slot="composer-surface">
                            <textarea defaultValue="Keep the draft" />
                            <HudComposerSurfaceControls />
                        </div>
                    </TooltipProvider>
                </HermesHudFrame>
            )
        );
        const editor = container.querySelector("textarea");
        const frame = container.querySelector<HTMLElement>("[data-hermes-frame-fit]");
        act(() =>
            container.querySelector<HTMLButtonElement>('[aria-label="Detach Hermes as floating island"]').click()
        );
        expect(frame.dataset.chatPlacement).toBe("island");
        expect(frame.classList.contains("fixed")).toBe(true);
        expect(container.querySelector("textarea")).toBe(editor);
        expect(editor.value).toBe("Keep the draft");
        expect(frame.querySelector('[aria-label="Drag to move chat"]')).not.toBeNull();
        expect(frame.hasAttribute("data-hermes-frame-fit")).toBe(false);
        expect(frame.querySelector(".hermes-hud-island-handle")).toBeNull();
        expect(
            frame.querySelector('[data-slot="composer-surface"] [aria-label="Dock KronTerm Agent in the workspace"]')
        ).not.toBeNull();
        act(() => container.querySelector<HTMLButtonElement>('[aria-label="Attach Hermes to OS frame"]').click());
        expect(frame.dataset.chatPlacement).toBe("shell");
        expect(frame.classList.contains("absolute")).toBe(true);
        expect(container.querySelector("textarea")).toBe(editor);
        expect(editor.value).toBe("Keep the draft");
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});

it("places detach beside dock when the conversation mounts through a sibling portal", async () => {
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const { HermesChatMount } = await import("./hermes-chat-mount");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => {
            root.render(
                <TooltipProvider>
                    <HermesChatMount targetId="hud-controls-portal-test">
                        <div data-slot="composer-surface">
                            <textarea defaultValue="Portal draft" />
                            <HudComposerSurfaceControls />
                        </div>
                    </HermesChatMount>
                    <HermesHudFrame placement="shell" geometry={{ x: 45, y: 70, width: 360, height: 720 }}>
                        <div id="hud-controls-portal-test" />
                    </HermesHudFrame>
                </TooltipProvider>
            );
        });
        const editor = container.querySelector("textarea");
        const controls = container.querySelector("[data-hud-surface-controls]");
        expect(controls.querySelector('[aria-label="Detach Hermes as floating island"]')).not.toBeNull();
        await act(async () =>
            controls.querySelector<HTMLButtonElement>('[aria-label="Detach Hermes as floating island"]').click()
        );
        expect(container.querySelector<HTMLElement>("[data-chat-placement]").dataset.chatPlacement).toBe("island");
        expect(container.querySelector("textarea")).toBe(editor);
        expect(editor.value).toBe("Portal draft");
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

it("drags the attached HUD out of the shell and stops moving on release", async () => {
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const pointer = (type: string, x: number, y: number) => {
        const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
        Object.defineProperty(event, "pointerId", { value: 1 });
        return event;
    };
    try {
        await act(async () =>
            root.render(
                <TooltipProvider>
                    <HermesHudFrame placement="shell" geometry={{ x: 45, y: 70, width: 360, height: 720 }}>
                        <textarea defaultValue="Keep this while dragging" />
                        <HudComposerSurfaceControls />
                    </HermesHudFrame>
                </TooltipProvider>
            )
        );
        const frame = container.querySelector<HTMLElement>("[data-kronterm-hermes-hud]");
        frame.getBoundingClientRect = () => ({ left: 200, top: 100 }) as DOMRect;
        const editor = container.querySelector("textarea");
        const handle = container.querySelector<HTMLElement>("[data-hermes-island-handle]");
        let captured = false;
        handle.setPointerCapture = () => {
            captured = true;
        };
        handle.hasPointerCapture = () => captured;
        handle.releasePointerCapture = () => {
            captured = false;
        };
        act(() => container.querySelector("[data-hud-drag-handle]").dispatchEvent(pointer("pointerdown", 210, 110)));
        expect(frame.dataset.chatPlacement).toBe("island");
        expect(captured).toBe(true);
        act(() => handle.dispatchEvent(pointer("pointermove", 260, 160)));
        expect(frame.style.left).toBe("250px");
        expect(frame.style.top).toBe("150px");
        act(() => handle.dispatchEvent(pointer("pointerup", 260, 160)));
        expect(captured).toBe(false);
        act(() => handle.dispatchEvent(pointer("pointermove", 310, 210)));
        expect(frame.style.left).toBe("250px");
        expect(container.querySelector("textarea")).toBe(editor);
        expect(editor.value).toBe("Keep this while dragging");
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});

function DraggableComposerFixture() {
    const { onPointerDown } = useHudComposerDrag(true);
    return (
        <div data-test-composer="" onPointerDown={onPointerDown}>
            <textarea defaultValue="Keep my draft" />
            <HudComposerSurfaceControls />
        </div>
    );
}

it("moves the visible detached island when the real composer drag hook runs through a sibling portal", async () => {
    const { HermesHudFrame } = await import("./hermes-hud-overlay");
    const { HermesChatMount } = await import("./hermes-chat-mount");
    vi.useFakeTimers();
    const previousDesktop = window.hermesDesktop;
    const moveBy = vi.fn();
    window.hermesDesktop = {
        ...previousDesktop,
        hud: { ...previousDesktop?.hud, moveBy },
    } as typeof window.hermesDesktop;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () =>
            root.render(
                <TooltipProvider>
                    <HermesChatMount targetId="hud-real-drag">
                        <DraggableComposerFixture />
                    </HermesChatMount>
                    <HermesHudFrame placement="shell" geometry={{ x: 45, y: 70, width: 360, height: 720 }}>
                        <div id="hud-real-drag" />
                    </HermesHudFrame>
                </TooltipProvider>
            )
        );
        act(() =>
            container.querySelector<HTMLButtonElement>('[aria-label="Detach Hermes as floating island"]').click()
        );
        const frame = container.querySelector<HTMLElement>('[data-chat-placement="island"]');
        const initialX = parseFloat(frame.style.left);
        const initialY = parseFloat(frame.style.top);
        frame.getBoundingClientRect = () => ({ width: 580, height: 400 }) as DOMRect;
        const composer = container.querySelector<HTMLElement>("[data-test-composer]");
        composer.setPointerCapture = () => {};
        composer.hasPointerCapture = () => false;
        const pointer = (type: string, x: number, y: number) => {
            const event = new MouseEvent(type, { bubbles: true, screenX: x, screenY: y, button: 0 });
            Object.defineProperty(event, "pointerId", { value: 1 });
            return event;
        };
        act(() => composer.dispatchEvent(pointer("pointerdown", 200, 200)));
        act(() => vi.advanceTimersByTime(150));
        act(() => window.dispatchEvent(pointer("pointermove", 230, 220)));
        expect(parseFloat(frame.style.left)).toBe(initialX + 30);
        expect(parseFloat(frame.style.top)).toBe(initialY + 20);
        expect(moveBy).not.toHaveBeenCalled();
        expect(container.querySelector("textarea").value).toBe("Keep my draft");
        act(() => window.dispatchEvent(pointer("pointerup", 230, 220)));
        act(() => window.dispatchEvent(pointer("pointermove", 250, 250)));
        expect(parseFloat(frame.style.left)).toBe(initialX + 30);
    } finally {
        act(() => root.unmount());
        container.remove();
        window.hermesDesktop = previousDesktop;
        vi.useRealTimers();
    }
});
