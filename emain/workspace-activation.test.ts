// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test, vi } from "vitest";
import { activateExistingWorkspace } from "./workspace-activation";

function makeWindow(minimized = false) {
    return { isDestroyed: () => false, isMinimized: () => minimized, restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
}

test("reopening a hidden workspace shows and focuses its existing window", () => {
    const window = makeWindow();
    expect(activateExistingWorkspace([window])).toBe(true);
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.show.mock.invocationCallOrder[0]).toBeLessThan(window.focus.mock.invocationCallOrder[0]);
});

test("restores the last focused minimized window instead of opening another workspace", () => {
    const first = makeWindow();
    const preferred = makeWindow(true);
    expect(activateExistingWorkspace([first, preferred], preferred)).toBe(true);
    expect(preferred.restore).toHaveBeenCalledOnce();
    expect(preferred.show).toHaveBeenCalledOnce();
    expect(first.show).not.toHaveBeenCalled();
});

test("requests creation only when no live workspace exists", () => {
    const window = { ...makeWindow(), isDestroyed: () => true };
    expect(activateExistingWorkspace([window], window)).toBe(false);
    expect(window.show).not.toHaveBeenCalled();
    expect(activateExistingWorkspace([], makeWindow())).toBe(false);
});
