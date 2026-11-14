// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { NativeHudFallback } from "./native-hud-fallback";

const api = vi.hoisted(() => ({
    setHudWindowMode: vi.fn(),
    requestNativeHudExit: vi.fn(),
    requestNativeHudLaunch: vi.fn(),
}));
vi.mock("@/store/global", () => ({ getApi: () => api }));

test("keeps retry, preview launchers and explicit exit accessible after a native failure", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<NativeHudFallback sessionId="existing-session" />));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(api.setHudWindowMode).toHaveBeenCalledWith(true, "existing-session");
    for (const [label, app] of [
        ["Browser", "web"],
        ["Sandbox", "machines"],
        ["Android (Labs)", "android"],
        ["iPhone (Labs)", "iphone"],
        ["Streamed apps", "apps"],
        ["Files", "files"],
        ["Terminal", "terminal"],
        ["Widget", "widget"],
    ]) {
        await act(async () => (host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click());
        expect(api.requestNativeHudLaunch).toHaveBeenLastCalledWith(app);
    }
    await act(async () => (host.querySelector('[aria-label="Return to workspace"]') as HTMLButtonElement).click());
    expect(api.requestNativeHudExit).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
});
