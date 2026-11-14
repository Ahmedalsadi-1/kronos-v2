// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ComputersPanel } from "./computers";
import { PhoneFrame } from "./phone-frame";

vi.mock("@/app/view/agent-surface-cursor", () => ({
    AgentSurfaceCursor: ({ surfaceId, coordinates }) => (
        <div data-agent-surface={surfaceId} data-coordinates={coordinates} />
    ),
}));

vi.mock("@/app/components/system-ui", () => ({
    SystemMaterial: ({ children, ...props }) => <div {...props}>{children}</div>,
    SystemToolbar: ({ children, ...props }) => <div {...props}>{children}</div>,
    SystemButton: ({ children, size, variant, ...props }) => <button {...props}>{children}</button>,
}));

it("makes the frame side buttons invoke their hardware actions", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onButton = vi.fn();
    await act(async () =>
        root.render(
            <PhoneFrame platform="ios" onButton={onButton}>
                <span>Screen</span>
            </PhoneFrame>
        )
    );
    for (const [label, action] of [
        ["Power button", "power"],
        ["Volume up", "volume-up"],
        ["Volume down", "volume-down"],
    ]) {
        await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`).click());
        expect(onButton).toHaveBeenLastCalledWith(action);
    }
    await act(async () => root.unmount());
});

it.each([16 / 9, 3 / 4, 0.5])("preserves landscape and tablet capture proportions (%s)", async (ratio) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () =>
        root.render(
            <PhoneFrame platform="ios" screenAspectRatio={ratio}>
                <span>Screen</span>
            </PhoneFrame>
        )
    );
    const frame = container.querySelector<HTMLElement>(".kt-phone-frame-adaptive");
    expect(frame).not.toBeNull();
    expect(frame.style.getPropertyValue("--device-aspect")).toBe(String(ratio));
    await act(async () => root.unmount());
});

it("keeps hardware controls visible but prevents competing input during a pending device action", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onButton = vi.fn();
    await act(async () =>
        root.render(
            <PhoneFrame platform="android" onButton={onButton} controlsDisabled>
                <span>Screen</span>
            </PhoneFrame>
        )
    );
    for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
        expect(button.disabled).toBe(true);
        button.click();
    }
    expect(onButton).not.toHaveBeenCalled();
    await act(async () =>
        root.render(
            <PhoneFrame platform="android" onButton={onButton}>
                <span>Screen</span>
            </PhoneFrame>
        )
    );
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Power button"]').click());
    expect(onButton).toHaveBeenCalledWith("power");
    await act(async () => root.unmount());
});

it("renders the interactive phone with compact device actions", async () => {
    const target = {
        id: "android:test",
        name: "Android",
        runtime: "emulator",
        kind: "android-emulator",
        status: "booted",
        controlOwner: "user",
        controlGeneration: 1,
        capabilities: ["home", "back", "type", "screenshot", "tap", "rotate"],
        labs: true,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    const controller = { act: vi.fn() } as any;
    await act(async () =>
        root.render(
            <ComputersPanel
                compact
                controller={controller}
                state={{
                    targets: [target as any],
                    selectedId: target.id,
                    loading: false,
                    busy: false,
                    error: "",
                    snapshot: {
                        target,
                        imageDataUrl: "data:image/png;base64,c2NyZWVu",
                        capturedAt: "2026-10-07T00:00:00Z",
                    } as any,
                    session: { id: "session" } as any,
                }}
            />
        )
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector(".kt-phone-frame-android .kt-phone-screen img")).not.toBeNull();
    expect(container.querySelector(".kt-phone-hardware")?.getAttribute("viewBox")).toBe("0 0 380 830");
    expect(
        container.querySelector('[data-agent-surface="device:android:test"]')?.getAttribute("data-coordinates")
    ).toBe("normalized");
    expect(container.querySelector('[aria-label="Simulator controls"]')).toBeNull();
    expect(container.querySelector('[aria-label="Home"]')).not.toBeNull();
    for (const [label, action] of [
        ["Home", "home"],
        ["Capture screen", "screenshot"],
        ["Rotate device", "rotate"],
    ]) {
        await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`).click());
        if (action === "rotate") {
            expect(controller.act).toHaveBeenLastCalledWith(action, { orientation: "landscape-left" });
        } else {
            expect(controller.act).toHaveBeenLastCalledWith(action);
        }
    }
    expect(container.textContent).not.toContain("Disconnect");
    expect(container.querySelector('[aria-label="Device actions"]')).toBeNull();
    expect(container.querySelector(".kt-computers-owner")).toBeNull();
    expect(container.querySelector(".kt-computers-capture-label")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    await act(async () => root.unmount());
});

it("freezes selection without device input and cancels with Escape or ownership changes", async () => {
    const target = {
        id: "android:test",
        name: "Android",
        runtime: "emulator",
        kind: "android-emulator",
        status: "booted",
        controlOwner: "user",
        controlGeneration: 1,
        capabilities: ["tap", "screenshot", "home"],
        labs: true,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const controller = { act: vi.fn() } as any;
    const selectRegion = () => {
        const toolbar = container.querySelector<HTMLIFrameElement>('iframe[name="kronterm-screen-selector"]');
        return act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    source: toolbar.contentWindow,
                    data: { channel: "kronterm:screen-selector", action: "region" },
                })
            );
        });
    };
    const render = (generation = 1, imageDataUrl = "frozen-frame") =>
        act(async () =>
            root.render(
                <ComputersPanel
                    controller={controller}
                    state={{
                        targets: [{ ...target, controlGeneration: generation } as any],
                        selectedId: target.id,
                        loading: false,
                        busy: false,
                        error: "",
                        snapshot: {
                            target: { ...target, controlGeneration: generation },
                            imageDataUrl,
                            capturedAt: 1,
                        } as any,
                    }}
                />
            )
        );
    try {
        await render();
        await selectRegion();
        expect(container.querySelector(".kt-computers-tap")).toBeNull();
        await render(1, "new-live-frame");
        expect(container.querySelector<HTMLImageElement>(".kt-device-selection-frame img").getAttribute("src")).toBe(
            "frozen-frame"
        );
        const frame = container.querySelector<HTMLElement>(".kt-device-selection-frame");
        expect(document.activeElement).toBe(frame);
        await act(async () => {
            frame.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            frame.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
            document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        expect(controller.act).not.toHaveBeenCalled();
        expect(container.querySelector(".kt-computers-tap")).not.toBeNull();
        await selectRegion();
        await render(2);
        expect(container.querySelector(".kt-device-selection")).toBeNull();
        expect(controller.act).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

it("rotates an already landscape simulator back to portrait using its captured dimensions", async () => {
    const target = {
        id: "ios:test",
        name: "iPad",
        kind: "ios-simulator",
        runtime: "iOS",
        status: "booted",
        controlOwner: "user",
        controlGeneration: 1,
        capabilities: ["rotate"],
        labs: true,
    };
    const controller = { act: vi.fn().mockResolvedValue(undefined) };
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () =>
            root.render(
                <ComputersPanel
                    controller={controller as any}
                    state={
                        {
                            targets: [target],
                            selectedId: target.id,
                            loading: false,
                            busy: false,
                            error: "",
                            snapshot: {
                                target,
                                imageDataUrl: "data:image/png;base64,c2NyZWVu",
                                capturedAt: "2026-10-26T09:00:00Z",
                            },
                        } as any
                    }
                />
            )
        );
        const image = container.querySelector("img");
        Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
        await act(async () => image.dispatchEvent(new Event("load")));
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Rotate device"]').click());
        expect(controller.act).toHaveBeenCalledWith("rotate", { orientation: "portrait" });
    } finally {
        await act(async () => root.unmount());
    }
});
