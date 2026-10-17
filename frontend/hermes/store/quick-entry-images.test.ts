// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { initQuickEntryBridge, setQuickEntrySubmitHandler } from "./quick-entry";

let dispose: () => void;
afterEach(() => {
    dispose?.();
    setQuickEntrySubmitHandler(null);
    delete window.hermesDesktop;
});

it("retains local PNG bytes on the submit bridge and sanitizes filenames", () => {
    let incoming: (payload: unknown) => void;
    window.hermesDesktop = {
        quickEntry: {
            onSubmit: (callback) => {
                incoming = callback;
                return () => {};
            },
        },
    } as any;
    const handler = vi.fn();
    setQuickEntrySubmitHandler(handler);
    dispose = initQuickEntryBridge();
    incoming({
        target: "current",
        text: "Inspect screen",
        images: [
            { filename: "../capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" },
            { filename: "remote.png", dataUrl: "https://example.com/remote.png" },
        ],
    });
    expect(handler).toHaveBeenCalledExactlyOnceWith({
        target: "current",
        text: "Inspect screen",
        images: [{ filename: "capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }],
    });
});
