// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AppStreamView } from "./appstream";

const setting = vi.hoisted(() => ({ live: false }));

vi.mock("@/app/store/global", async () => {
    const { atom } = await import("jotai");
    const enabled = atom(false);
    const live = atom(true);
    return { getSettingsKeyAtom: () => (setting.live ? live : enabled) };
});

vi.mock("@/app/view/waterflow-overlay", () => ({ WaterFlowOverlay: () => null }));
vi.mock("@/app/view/agent-surface-cursor", () => ({ AgentSurfaceCursor: () => null }));

let dispose: () => void;
afterEach(() => {
    dispose?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setting.live = false;
});

it("requires explicit consent before substituting snapshots for failed live capture", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setting.live = true;
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const model = {
        blockId: "quality",
        statusAtom: atom("streaming"),
        streamUrlAtom: atom("http://localhost/stream"),
        mediaStreamAtom: atom(null),
        transportAtom: atom("legacy-snapshot"),
        captureFallbackReasonAtom: atom("Permission denied"),
        errorAtom: atom(""),
        inputErrorAtom: atom(""),
        appNameAtom: atom("Calculator"),
        startStream: vi.fn(async () => {}),
        retryLiveCapture: vi.fn(async () => {}),
        dispose: vi.fn(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    dispose = () => {
        act(() => root.unmount());
        host.remove();
    };
    await act(async () =>
        root.render(<AppStreamView model={model as any} blockId="quality" blockRef={null} contentRef={null} />)
    );
    expect(host.textContent).toContain("Permission denied");
    expect(fetch).not.toHaveBeenCalled();
    await act(async () =>
        [...host.querySelectorAll("button")].find((button) => button.textContent === "Use slow snapshot mode").click()
    );
    expect(fetch).toHaveBeenCalledOnce();
});

it("coalesces trackpad events instead of launching an input request for each wheel tick", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    const model = {
        blockId: "scroll-test",
        statusAtom: atom("streaming"),
        streamUrlAtom: atom(""),
        mediaStreamAtom: atom(null),
        transportAtom: atom("legacy-snapshot"),
        captureFallbackReasonAtom: atom(""),
        errorAtom: atom(""),
        inputErrorAtom: atom(""),
        appNameAtom: atom("Test"),
        startStream: vi.fn(async () => {}),
        dispose: vi.fn(),
        sendScroll: vi.fn(async () => {}),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    dispose = () => {
        act(() => root.unmount());
        host.remove();
    };
    await act(async () =>
        root.render(<AppStreamView model={model as any} blockId="scroll-test" blockRef={null} contentRef={null} />)
    );
    const canvas = host.querySelector("canvas");
    await act(async () => {
        for (let index = 0; index < 3; index++)
            canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, bubbles: true }));
        vi.advanceTimersByTime(80);
    });
    expect(model.sendScroll).toHaveBeenCalledTimes(1);
    expect(model.sendScroll).toHaveBeenCalledWith("down", 3);
});

it("forwards printable characters as text and preserves native keyboard shortcuts", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const model = {
        blockId: "typing",
        statusAtom: atom("streaming"),
        streamUrlAtom: atom(""),
        mediaStreamAtom: atom(null),
        transportAtom: atom("legacy-snapshot"),
        captureFallbackReasonAtom: atom(""),
        errorAtom: atom(""),
        inputErrorAtom: atom(""),
        appNameAtom: atom("Test"),
        startStream: vi.fn(async () => {}),
        dispose: vi.fn(),
        sendType: vi.fn(async () => {}),
        sendKeyPress: vi.fn(async () => {}),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    dispose = () => {
        act(() => root.unmount());
        host.remove();
    };
    await act(async () =>
        root.render(<AppStreamView model={model as any} blockId="typing" blockRef={null} contentRef={null} />)
    );
    const canvas = host.querySelector("canvas");
    await act(async () => {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "é", bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Process", isComposing: true, bubbles: true }));
    });
    expect(model.sendType).toHaveBeenCalledOnce();
    expect(model.sendType).toHaveBeenCalledWith("é");
    expect(model.sendKeyPress).toHaveBeenCalledOnce();
    expect(model.sendKeyPress).toHaveBeenCalledWith("super+a");
});

it("aborts hidden snapshot requests and resumes once without reconnecting the application", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    let intersection: IntersectionObserverCallback;
    vi.stubGlobal(
        "IntersectionObserver",
        class {
            constructor(callback: IntersectionObserverCallback) {
                intersection = callback;
            }
            observe() {}
            disconnect() {}
        }
    );
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn((_url, options) => {
            signals.push(options.signal);
            return new Promise(() => {});
        })
    );
    const model = {
        blockId: "visibility-test",
        statusAtom: atom("streaming"),
        streamUrlAtom: atom("http://localhost/stream"),
        mediaStreamAtom: atom(null),
        transportAtom: atom("legacy-snapshot"),
        captureFallbackReasonAtom: atom(""),
        errorAtom: atom(""),
        inputErrorAtom: atom(""),
        appNameAtom: atom("Test"),
        startStream: vi.fn(async () => {}),
        dispose: vi.fn(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    dispose = () => {
        act(() => root.unmount());
        host.remove();
    };
    await act(async () =>
        root.render(<AppStreamView model={model as any} blockId="stream-test" blockRef={null} contentRef={null} />)
    );
    expect(signals).toHaveLength(1);
    hidden = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(signals[0].aborted).toBe(true);
    hidden = false;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(signals).toHaveLength(2);
    await act(async () => intersection([{ isIntersecting: false }] as any, null));
    expect(signals[1].aborted).toBe(true);
    await act(async () => intersection([{ isIntersecting: true }] as any, null));
    expect(signals).toHaveLength(3);
    expect(model.startStream).toHaveBeenCalledOnce();
});
