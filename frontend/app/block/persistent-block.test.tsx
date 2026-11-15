// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import type { NodeModel } from "@/layout/lib/types";
import { atom } from "jotai";
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    makePersistentNodeModel,
    PersistentBlock,
    PersistentBlockProvider,
    PersistentBlockSlot,
    syncPersistentBlockGeometry,
} from "./persistent-block";

const counts = vi.hoisted(() => ({ mounts: 0, disposes: 0 }));
vi.mock("./block", () => ({
    Block: () => {
        const [identity] = useState(() => ++counts.mounts);
        useEffect(
            () => () => {
                counts.disposes++;
            },
            []
        );
        return <input data-identity={identity} defaultValue="live session" />;
    },
}));

function model(id = "browser") {
    return {
        blockId: id,
        nodeId: id,
        innerRect: atom({ width: "500px", height: "400px" }),
        isFocused: atom(false),
        focusNode: vi.fn(),
        onClose: vi.fn(),
    } as unknown as NodeModel;
}

afterEach(() => {
    counts.mounts = 0;
    counts.disposes = 0;
    vi.unstubAllGlobals();
});

describe("persistent block ownership", () => {
    it("aligns native canvas pan and zoom synchronously without another frame or live remount", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const requestFrame = vi.fn(() => 1);
        vi.stubGlobal("requestAnimationFrame", requestFrame);
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        try {
            await act(() =>
                root.render(
                    <PersistentBlockProvider blockIds={["browser", "terminal"]}>
                        <section data-world="">
                            <PersistentBlock nodeModel={model()} preview={false} />
                        </section>
                        <section data-other-world="">
                            <PersistentBlock nodeModel={model("terminal")} preview={false} />
                        </section>
                    </PersistentBlockProvider>
                )
            );
            const world = element.querySelector<HTMLElement>("[data-world]");
            const slot = world.querySelector<HTMLElement>("[data-block-slot]");
            const other = element.querySelector<HTMLElement>('[data-block-slot="terminal"]');
            const otherBounds = vi.spyOn(other, "getBoundingClientRect");
            Object.defineProperties(slot, { offsetWidth: { value: 300 }, offsetHeight: { value: 240 } });
            slot.getBoundingClientRect = () => new DOMRect(80, 120, 450, 360);
            const host = element.querySelector<HTMLElement>('[data-live-blockid="browser"]');
            const input = host.querySelector("input");
            input.value = "unsaved live input";
            const frameCount = requestFrame.mock.calls.length;
            syncPersistentBlockGeometry(world);
            expect(host.style.left).toBe("80px");
            expect(host.style.top).toBe("120px");
            expect(host.style.transform).toBe("scale(1.5,1.5)");
            slot.getBoundingClientRect = () => new DOMRect(140, 200, 600, 480);
            syncPersistentBlockGeometry(world);
            expect(host.style.left).toBe("140px");
            expect(host.style.top).toBe("200px");
            expect(host.style.transform).toBe("scale(2,2)");
            expect(requestFrame).toHaveBeenCalledTimes(frameCount);
            expect(otherBounds).not.toHaveBeenCalled();
            expect(host.querySelector("input")).toBe(input);
            expect(input.value).toBe("unsaved live input");
            expect(counts.mounts).toBe(2);
            expect(counts.disposes).toBe(0);
            await act(() => root.unmount());
            const boundsAfterUnmount = vi.spyOn(slot, "getBoundingClientRect");
            syncPersistentBlockGeometry(world);
            expect(boundsAfterUnmount).not.toHaveBeenCalled();
        } finally {
            await act(() => root.unmount());
            element.remove();
        }
    });

    it("moves a browser to an alternate slot and restores its canvas slot without remounting", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let frame: FrameRequestCallback;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frame = callback;
            return 1;
        });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        const browser = model();
        const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
        const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(240);
        const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
            return new DOMRect(this.closest("[data-test-alternate-slot]") ? 350 : 0, 0, 300, 240);
        });
        const render = (alternate: boolean) =>
            act(() =>
                root.render(
                    <PersistentBlockProvider blockIds={["browser"]}>
                        <PersistentBlock nodeModel={browser} preview={false} />
                        {alternate && (
                            <section data-test-alternate-slot="">
                                <PersistentBlockSlot blockId="browser" />
                            </section>
                        )}
                    </PersistentBlockProvider>
                )
            );
        try {
            await render(false);
            const input = element.querySelector("input");
            const host = element.querySelector<HTMLElement>("[data-live-blockid]");
            expect(host.style.left).toBe("0px");
            await render(true);
            frame(0);
            expect(host.style.left).toBe("350px");
            expect(element.querySelector("input")).toBe(input);
            await render(false);
            frame(16);
            expect(host.style.left).toBe("0px");
            expect(element.querySelector("input")).toBe(input);
            expect(counts.mounts).toBe(1);
        } finally {
            await act(() => root.unmount());
            bounds.mockRestore();
            height.mockRestore();
            width.mockRestore();
            element.remove();
        }
    });

    it("skips layout and appearance reads for inactive slots while retaining the live session", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let frame: FrameRequestCallback;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frame = callback;
            return 1;
        });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        const browser = model();
        const render = (visible: boolean) =>
            act(() =>
                root.render(
                    <PersistentBlockProvider blockIds={["browser"]}>
                        {visible && <PersistentBlock nodeModel={browser} preview={false} />}
                    </PersistentBlockProvider>
                )
            );
        try {
            await render(true);
            const input = element.querySelector("input");
            await render(false);
            const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
            const appearance = vi.spyOn(window, "getComputedStyle");
            try {
                frame(0);
                frame(16);
                expect(geometry).not.toHaveBeenCalled();
                expect(appearance).not.toHaveBeenCalled();
                expect(element.querySelector("input")).toBe(input);
                expect(element.querySelector<HTMLElement>("[data-live-blockid]").style.display).toBe("none");
            } finally {
                geometry.mockRestore();
                appearance.mockRestore();
            }
            await render(true);
            expect(element.querySelector("input")).toBe(input);
            expect(counts.mounts).toBe(1);
        } finally {
            await act(() => root.unmount());
            element.remove();
        }
    });

    it("keeps one live mount and DOM input through presentation and inactive-tab changes", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        const browser = model();
        const render = (mode: string, visible = true, ids = ["browser"]) =>
            act(() => {
                root.render(
                    <PersistentBlockProvider blockIds={ids}>
                        <section key={mode}>
                            {visible && <PersistentBlock nodeModel={browser} preview={false} />}
                        </section>
                    </PersistentBlockProvider>
                );
            });
        try {
            await render("widgets");
            const input = element.querySelector("input");
            input.value = "unsaved browser state";
            for (const mode of ["canvas", "os", "tabs", "web", "widgets"]) {
                await render(mode, mode !== "web");
                expect(element.querySelector("input")).toBe(input);
                expect(input.value).toBe("unsaved browser state");
            }
            await render("tabs", false);
            await render("tabs", true);
            expect(counts.mounts).toBe(1);
            expect(counts.disposes).toBe(0);
            await render("tabs", false, []);
            expect(counts.disposes).toBe(1);
        } finally {
            await act(() => root.unmount());
            element.remove();
        }
    });

    it("paints a collapsed HUD selection in the hidden owner and restores its placement without remounting", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let frame: FrameRequestCallback;
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn((callback) => {
                frame = callback;
                return 1;
            })
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        const browser = model();
        try {
            await act(() =>
                root.render(
                    <PersistentBlockProvider blockIds={["browser"]}>
                        <PersistentBlock nodeModel={browser} preview={false} />
                    </PersistentBlockProvider>
                )
            );
            const input = element.querySelector("input");
            input.value = "running session";
            const host = element.querySelector<HTMLElement>("[data-live-blockid]");
            expect(host.style.display).toBe("none");
            kronTermHudController.openExclusiveHud();
            kronTermHudController.selectWidget("browser", true);
            frame(0);
            expect(host.style.width).toBe("820px");
            expect(host.style.display).not.toBe("none");
            expect(document.activeElement).not.toBe(input);
            expect(browser.focusNode).not.toHaveBeenCalled();
            kronTermHudController.setActive(false);
            frame(1);
            expect(host.style.display).toBe("none");
            expect(element.querySelector("input")).toBe(input);
            expect(input.value).toBe("running session");
            expect(counts.mounts).toBe(1);
        } finally {
            kronTermHudController.setActive(false);
            visibility.mockRestore();
            await act(() => root.unmount());
            element.remove();
        }
    });

    it("does not rewrite live surface styles on idle animation frames", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let frame: FrameRequestCallback;
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn((callback) => {
                frame = callback;
                return 1;
            })
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        try {
            await act(() =>
                root.render(
                    <PersistentBlockProvider blockIds={["browser"]}>
                        <section style={{ color: "red", borderRadius: "14px" }}>
                            <PersistentBlock nodeModel={model()} preview={false} />
                        </section>
                    </PersistentBlockProvider>
                )
            );
            const host = element.querySelector<HTMLElement>("[data-live-blockid]");
            const mutations: MutationRecord[] = [];
            const observer = new MutationObserver((records) => mutations.push(...records));
            observer.observe(host, { attributes: true });
            try {
                frame(0);
                frame(16);
                await Promise.resolve();
                expect(mutations).toHaveLength(0);
                const slot = element.querySelector<HTMLElement>("[data-block-slot]");
                slot.style.color = "blue";
                frame(32);
                expect(host.style.color).toBe("rgb(0, 0, 255)");
            } finally {
                observer.disconnect();
            }
        } finally {
            await act(() => root.unmount());
            element.remove();
        }
    });

    it("clips detached content under higher OS windows and keeps its overlay inside the live owner", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let frame: FrameRequestCallback;
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn((callback) => {
                frame = callback;
                return 1;
            })
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        const browser = model();
        const rect = (x: number, y: number, width: number, height: number) => ({
            x,
            y,
            width,
            height,
            top: y,
            left: x,
            right: x + width,
            bottom: y + height,
            toJSON: () => ({}),
        });
        try {
            await act(() =>
                root.render(
                    <PersistentBlockProvider blockIds={["browser"]}>
                        <div className="os-mode-root">
                            <section className="os-window" style={{ zIndex: 2 }}>
                                <PersistentBlock
                                    nodeModel={browser}
                                    preview={false}
                                    overlay={<span data-test-overlay="">Agent active</span>}
                                />
                            </section>
                            <section className="os-window" data-front="" style={{ zIndex: 3 }} />
                        </div>
                    </PersistentBlockProvider>
                )
            );
            const slot = element.querySelector<HTMLElement>("[data-block-slot]");
            Object.defineProperties(slot, { offsetWidth: { value: 200 }, offsetHeight: { value: 100 } });
            slot.getBoundingClientRect = () => rect(100, 80, 200, 100);
            element.querySelector<HTMLElement>(".os-mode-root").getBoundingClientRect = () => rect(0, 0, 800, 600);
            const front = element.querySelector<HTMLElement>("[data-front]");
            front.getBoundingClientRect = () => rect(180, 60, 80, 90);
            const host = element.querySelector<HTMLElement>("[data-live-blockid]");
            const input = host.querySelector("input");
            frame(0);
            expect(host.style.clipPath).toBe('path("M0 70H200V100H0Z M0 0H80V70H0Z M160 0H200V70H160Z")');
            expect(host.querySelector("[data-test-overlay]")).not.toBeNull();
            expect(slot.querySelector("[data-test-overlay]")).toBeNull();
            front.style.zIndex = "1";
            frame(16);
            expect(host.style.clipPath).toBe('path("M0 0H200V100H0Z")');
            const scene = element.querySelector<HTMLElement>(".os-mode-root");
            scene.className = "workspace-canvas";
            front.setAttribute("data-live-block-occluder", "");
            frame(32);
            expect(host.style.clipPath).toBe('path("M0 70H200V100H0Z M0 0H80V70H0Z M160 0H200V70H160Z")');
            expect(host.querySelector("input")).toBe(input);
            expect(counts.mounts).toBe(1);
        } finally {
            await act(() => root.unmount());
            element.remove();
        }
    });

    it("rebinds layout atoms and methods without replacing the model held by a view", () => {
        const first = model();
        const second = model();
        globalStore.set(second.isFocused as any, true);
        const binding = makePersistentNodeModel(first);
        const retained = binding.model;
        binding.update(second);
        expect(binding.model).toBe(retained);
        expect(globalStore.get(retained.isFocused)).toBe(true);
        retained.focusNode();
        expect(second.focusNode).toHaveBeenCalledOnce();
        expect(first.focusNode).not.toHaveBeenCalled();
    });
});

describe("persistent surface OS input", () => {
    it("routes OS gestures before focus while preserving ordinary widget input and the live mount", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn(() => 1)
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        const element = document.createElement("div");
        document.body.append(element);
        const root = createRoot(element);
        const browser = model();
        const order: string[] = [];
        const pointer = vi.fn((event) => {
            order.push("capture");
            if (event.button === 1) event.preventDefault();
        });
        browser.focusNode = vi.fn(() => order.push("focus"));
        const wheel = vi.fn((event) => {
            if (event.ctrlKey) event.preventDefault();
        });
        const bubble = vi.fn();
        try {
            await act(() =>
                root.render(
                    <div onWheel={bubble}>
                        <PersistentBlockProvider blockIds={["browser"]}>
                            <PersistentBlock
                                nodeModel={browser}
                                preview={false}
                                surfaceInput={{ onPointerDownCapture: pointer, onWheel: wheel }}
                            />
                        </PersistentBlockProvider>
                    </div>
                )
            );
            const input = element.querySelector("input");
            input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
            expect(order).toEqual(["capture", "focus"]);
            input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 1 }));
            expect(order).toEqual(["capture", "focus", "capture"]);
            const scroll = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 10 });
            input.dispatchEvent(scroll);
            expect(scroll.defaultPrevented).toBe(false);
            expect(wheel).toHaveBeenCalledTimes(1);
            expect(bubble).not.toHaveBeenCalled();
            input.dispatchEvent(
                new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 10 })
            );
            expect(wheel).toHaveBeenCalledTimes(2);
            expect(counts.mounts).toBe(1);
        } finally {
            await act(() => root.unmount());
            element.remove();
        }
    });
});

it("captures explicit Hand gestures over guest surfaces without replacing the live block", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const browser = model();
    const pan = vi.fn((event) => event.preventDefault());
    const render = (capturePointer: boolean) =>
        act(() =>
            root.render(
                <PersistentBlockProvider blockIds={["browser"]}>
                    <PersistentBlock
                        nodeModel={browser}
                        preview={false}
                        surfaceInput={{ capturePointer, onPointerDownCapture: pan }}
                    />
                </PersistentBlockProvider>
            )
        );
    try {
        await render(false);
        const input = element.querySelector("input");
        expect(element.querySelector("[data-live-block-pan-capture]")).toBeNull();
        await render(true);
        const capture = element.querySelector("[data-live-block-pan-capture]");
        expect(capture).not.toBeNull();
        capture.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        expect(pan).toHaveBeenCalledTimes(1);
        expect(browser.focusNode).not.toHaveBeenCalled();
        expect(element.querySelector("input")).toBe(input);
        await render(false);
        expect(element.querySelector("[data-live-block-pan-capture]")).toBeNull();
        expect(element.querySelector("input")).toBe(input);
        expect(counts.mounts).toBe(1);
    } finally {
        await act(() => root.unmount());
        element.remove();
    }
});

it("lets native canvas gestures pass through live content and restores interaction without remounting", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let frame: FrameRequestCallback;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const browser = model();
    const pointer = vi.fn();
    const wheel = vi.fn();
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(240);
    const bounds = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(0, 0, 300, 240));
    const render = (passThrough: boolean, alternate = false) =>
        act(() =>
            root.render(
                <PersistentBlockProvider blockIds={["browser"]}>
                    <PersistentBlock
                        nodeModel={browser}
                        preview={false}
                        surfaceInput={{
                            passThrough,
                            capturePointer: true,
                            onPointerDownCapture: pointer,
                            onWheel: wheel,
                        }}
                    />
                    {alternate && <PersistentBlockSlot blockId="browser" chrome="integrated" />}
                </PersistentBlockProvider>
            )
        );
    try {
        await render(false);
        const input = element.querySelector("input");
        input.value = "unsaved widget state";
        const host = element.querySelector<HTMLElement>("[data-live-blockid]");
        expect(host.style.pointerEvents).toBe("auto");
        await render(true);
        frame(0);
        expect(host.hasAttribute("inert")).toBe(true);
        expect(host.hasAttribute("data-live-block-pass-through")).toBe(true);
        expect(host.style.pointerEvents).toBe("none");
        expect(host.querySelector("[data-live-block-pan-capture]")).toBeNull();
        input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        input.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
        expect(pointer).not.toHaveBeenCalled();
        expect(wheel).not.toHaveBeenCalled();
        expect(browser.focusNode).not.toHaveBeenCalled();
        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        try {
            kronTermHudController.openExclusiveHud();
            kronTermHudController.selectWidget("browser", true);
            frame(8);
            expect(host.hasAttribute("inert")).toBe(false);
            expect(host.hasAttribute("data-live-block-pass-through")).toBe(false);
            expect(host.style.pointerEvents).toBe("auto");
        } finally {
            kronTermHudController.setActive(false);
            visibility.mockRestore();
        }
        await render(true, true);
        frame(16);
        expect(host.hasAttribute("inert")).toBe(false);
        expect(host.hasAttribute("data-live-block-pass-through")).toBe(false);
        expect(host.style.pointerEvents).toBe("auto");
        await render(true);
        frame(32);
        expect(host.hasAttribute("inert")).toBe(true);
        await render(false);
        frame(48);
        expect(host.hasAttribute("inert")).toBe(false);
        expect(host.style.pointerEvents).toBe("auto");
        input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        expect(pointer).toHaveBeenCalledOnce();
        expect(browser.focusNode).toHaveBeenCalledOnce();
        expect(element.querySelector("input")).toBe(input);
        expect(input.value).toBe("unsaved widget state");
        expect(counts.mounts).toBe(1);
        expect(counts.disposes).toBe(0);
    } finally {
        await act(() => root.unmount());
        bounds.mockRestore();
        height.mockRestore();
        width.mockRestore();
        element.remove();
    }
});
