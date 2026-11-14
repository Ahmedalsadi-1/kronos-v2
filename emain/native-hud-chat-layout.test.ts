// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, test, vi } from "vitest";
import { NativeHudChatLayout } from "./native-hud-chat-layout";

afterEach(() => vi.useRealTimers());

test("a newer measured layout cancels fallback and stale revisions cannot reopen chat", () => {
    vi.useFakeTimers();
    const host = { setIntent: vi.fn(), hide: vi.fn(), present: vi.fn(), previewBounds: () => undefined };
    const layout = new NativeHudChatLayout(host);
    const event = {
        event: "chat-layout" as const,
        x: -1000,
        y: 0,
        width: 1000,
        height: 800,
        inset: 32,
        layoutRevision: 1,
        chatIntent: true,
        layoutReady: false,
    };
    layout.apply(event);
    expect(layout.phase).toBe("measuring");
    layout.apply({ ...event, layoutRevision: 2, layoutReady: true });
    vi.advanceTimersByTime(1001);
    expect(host.present).toHaveBeenCalledOnce();
    expect(host.present.mock.calls[0][1]).toBe(true);
    layout.apply({ ...event, layoutRevision: 3, chatIntent: false });
    layout.apply({ ...event, layoutRevision: 2, layoutReady: true });
    expect(layout.phase).toBe("closed");
    expect(host.present).toHaveBeenCalledOnce();
});

test("recovery cancels missing-measurement timers before the companion is replaced", () => {
    vi.useFakeTimers();
    const host = { setIntent: vi.fn(), hide: vi.fn(), present: vi.fn(), previewBounds: () => undefined };
    const layout = new NativeHudChatLayout(host);
    layout.apply({
        event: "chat-layout",
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        inset: 32,
        layoutRevision: 1,
        chatIntent: true,
        layoutReady: false,
    });
    layout.cancel();
    vi.advanceTimersByTime(1001);
    expect(host.present).not.toHaveBeenCalled();
});
