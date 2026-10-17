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
import { makePersistentNodeModel, PersistentBlock, PersistentBlockProvider } from "./persistent-block";

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
