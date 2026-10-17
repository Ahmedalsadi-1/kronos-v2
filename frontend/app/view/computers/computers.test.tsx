// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ComputersPanel } from "./computers";

vi.mock("@/app/components/system-ui", () => ({
    SystemMaterial: ({ children, ...props }) => <div {...props}>{children}</div>,
    SystemToolbar: ({ children, ...props }) => <div {...props}>{children}</div>,
    SystemButton: ({ children, size, variant, ...props }) => <button {...props}>{children}</button>,
}));

it("keeps phone screen and bottom controls while removing surrounding chrome", async () => {
    const target = {
        id: "android:test",
        name: "Android",
        runtime: "emulator",
        kind: "android-emulator",
        status: "booted",
        controlOwner: "user",
        controlGeneration: 1,
        capabilities: ["home", "back", "type", "screenshot", "tap"],
        labs: true,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () =>
        root.render(
            <ComputersPanel
                compact
                controller={{} as any}
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
    expect(container.querySelector('[aria-label="Simulator controls"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Home"]')).not.toBeNull();
    expect(container.textContent).toContain("Disconnect");
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
    const root = createRoot(container);
    const controller = { act: vi.fn() } as any;
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
        await act(async () =>
            container.querySelector<HTMLButtonElement>('[aria-label="Select screen region (Labs)"]').click()
        );
        expect(container.querySelector(".kt-computers-tap")).toBeNull();
        await render(1, "new-live-frame");
        expect(container.querySelector<HTMLImageElement>(".kt-device-selection-frame img").getAttribute("src")).toBe(
            "frozen-frame"
        );
        const frame = container.querySelector<HTMLElement>(".kt-device-selection-frame");
        await act(async () => {
            frame.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            frame.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
            frame.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        expect(controller.act).not.toHaveBeenCalled();
        expect(container.querySelector(".kt-computers-tap")).not.toBeNull();
        await act(async () =>
            container.querySelector<HTMLButtonElement>('[aria-label="Select screen region (Labs)"]').click()
        );
        await render(2);
        expect(container.querySelector(".kt-device-selection")).toBeNull();
        expect(controller.act).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
    }
});
