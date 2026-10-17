// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { useNativeHudMode } from "./use-native-hud-mode";

const mode = vi.hoisted(() => vi.fn());
vi.mock("@/store/global", () => ({ getApi: () => ({ setHudWindowMode: mode }) }));

function Host({ active = true }: { active?: boolean }) {
    useNativeHudMode(active, false, () => "session-1");
    return null;
}

test("preserves exclusive notch mode across StrictMode replay and renderer remounts until explicit exit", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mode.mockClear();
    const container = document.createElement("div");
    let root = createRoot(container);
    await act(async () =>
        root.render(
            <StrictMode>
                <Host />
            </StrictMode>
        )
    );
    expect(document.documentElement.hasAttribute("data-kronterm-hud-mode")).toBe(true);
    await act(async () => root.unmount());
    expect(mode.mock.calls.every(([active]) => active === true)).toBe(true);
    root = createRoot(container);
    await act(async () => root.render(<Host />));
    expect(mode).toHaveBeenLastCalledWith(true, "session-1", { keepWorkspaceVisible: false });
    await act(async () => root.render(<Host active={false} />));
    expect(mode).toHaveBeenLastCalledWith(false, undefined, { keepWorkspaceVisible: false });
    expect(document.documentElement.hasAttribute("data-kronterm-hud-mode")).toBe(false);
    await act(async () => root.unmount());
});
