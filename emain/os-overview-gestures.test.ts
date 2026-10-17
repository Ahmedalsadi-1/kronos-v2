// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { installOSOverviewGestures } from "./os-overview-gestures";

test("native vertical swipes follow the active tab and ignore background windows", () => {
    const window = Object.assign(new EventEmitter(), { isFocused: () => true, isDestroyed: () => false });
    const first = { isDestroyed: () => false, send: vi.fn() };
    const second = { isDestroyed: () => false, send: vi.fn() };
    let target = first;
    installOSOverviewGestures(window, () => target, "darwin");
    window.emit("swipe", {}, "up");
    expect(first.send).toHaveBeenCalledWith("os-overview-gesture", "up");
    target = second;
    window.emit("swipe", {}, "down");
    expect(second.send).toHaveBeenCalledWith("os-overview-gesture", "down");
    window.emit("swipe", {}, "left");
    window.isFocused = () => false;
    window.emit("swipe", {}, "up");
    expect(second.send).toHaveBeenCalledTimes(1);
    window.emit("closed");
    expect(window.listenerCount("swipe")).toBe(0);
});

test("unsupported platforms and destroyed renderers receive no gesture", () => {
    const window = Object.assign(new EventEmitter(), { isFocused: () => true, isDestroyed: () => false });
    const send = vi.fn();
    installOSOverviewGestures(window, () => ({ isDestroyed: () => false, send }), "linux");
    expect(window.listenerCount("swipe")).toBe(0);
    const dispose = installOSOverviewGestures(window, () => ({ isDestroyed: () => true, send }), "darwin");
    window.emit("swipe", {}, "up");
    expect(send).not.toHaveBeenCalled();
    dispose();
    dispose();
    expect(window.listenerCount("swipe")).toBe(0);
});
