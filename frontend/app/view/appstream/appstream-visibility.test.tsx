// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AppStreamView } from "./appstream";

vi.mock("@/app/store/global", async () => {
    const { atom } = await import("jotai");
    const enabled = atom(false);
    return { getSettingsKeyAtom: () => enabled };
});

vi.mock("@/app/view/waterflow-overlay", () => ({ WaterFlowOverlay: () => null }));

let dispose: () => void;
afterEach(() => {
    dispose?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
