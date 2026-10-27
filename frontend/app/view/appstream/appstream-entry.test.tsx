// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AppStreamEntry } from "./appstream-entry";

vi.mock("./appstream", () => ({
    AppStreamView: ({ model }) => {
        useEffect(() => {
            void model.startStream();
            return () => model.dispose();
        }, [model]);
        return <div>Host stream</div>;
    },
}));

let dispose: () => void;
afterEach(() => {
    dispose?.();
    vi.unstubAllGlobals();
});

it("opens the requested app directly and releases capture on unmount", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const model = {
        blockId: "app",
        appNameAtom: atom("Calculator"),
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
        root.render(<AppStreamEntry model={model as any} blockId="app" blockRef={null} contentRef={null} />)
    );
    expect(host.textContent).toContain("Host stream");
    expect(model.startStream).toHaveBeenCalledOnce();
    expect(host.querySelector("button")).toBeNull();
    dispose();
    dispose = undefined;
    expect(model.dispose).toHaveBeenCalledOnce();
});
