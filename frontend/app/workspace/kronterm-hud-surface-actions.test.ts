// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { handleKronTermHudSurfaceAction } from "./kronterm-hud-surface-actions";

function makeContext() {
    return {
        isKnownBlock: (id: string) => ["browser", "terminal", "island"].includes(id),
        isDetached: (id: string) => id === "island",
        setMode: vi.fn(),
        setBackground: vi.fn(),
        showWorkspaceBlock: vi.fn(),
        showDetachedBlock: vi.fn(async () => true),
        hideDetachedBlock: vi.fn(async () => true),
    };
}

describe("HUD live widget actions", () => {
    it("propagates asynchronous workspace failures before reporting success", async () => {
        const context = makeContext();
        context.showWorkspaceBlock.mockImplementationOnce(async () => {
            throw new Error("Surface unmounted");
        });
        await expect(
            handleKronTermHudSurfaceAction({ action: "hud.open", blockid: "browser" }, context)
        ).rejects.toThrow("Surface unmounted");
    });

    it("reveals the existing browser in HUD without creating a native duplicate", async () => {
        const context = makeContext();
        await handleKronTermHudSurfaceAction({ action: "hud.open", blockid: "browser" }, context);
        expect(context.setMode).toHaveBeenCalledWith("hud");
        expect(context.showWorkspaceBlock).toHaveBeenCalledWith("browser");
        expect(context.showDetachedBlock).not.toHaveBeenCalled();
        expect(context.setBackground).toHaveBeenCalledWith("browser", false);
    });

    it("backgrounds a live terminal without closing or refocusing it", async () => {
        const context = makeContext();
        await handleKronTermHudSurfaceAction({ action: "hud.background", blockid: "terminal" }, context);
        expect(context.setBackground).toHaveBeenCalledWith("terminal", true);
        expect(context.showWorkspaceBlock).not.toHaveBeenCalled();
        expect(context.setMode).not.toHaveBeenCalled();
    });

    it("hides and restores the same detached island", async () => {
        const context = makeContext();
        await handleKronTermHudSurfaceAction({ action: "hud.background", blockid: "island" }, context);
        await handleKronTermHudSurfaceAction({ action: "hud.restore", blockid: "island" }, context);
        expect(context.hideDetachedBlock).toHaveBeenCalledWith("island");
        expect(context.showDetachedBlock).toHaveBeenCalledWith("island");
        expect(context.showWorkspaceBlock).not.toHaveBeenCalled();
    });

    it("rejects unknown identities before changing the presentation", async () => {
        const context = makeContext();
        await expect(
            handleKronTermHudSurfaceAction({ action: "hud.open", blockid: "other-tab" }, context)
        ).rejects.toThrow("Widget not found");
        expect(context.setMode).not.toHaveBeenCalled();
        expect(context.showWorkspaceBlock).not.toHaveBeenCalled();
    });

    it("does not claim successful backgrounding when the native island is unavailable", async () => {
        const context = makeContext();
        context.hideDetachedBlock.mockResolvedValueOnce(false);
        await expect(
            handleKronTermHudSurfaceAction({ action: "hud.background", blockid: "island" }, context)
        ).rejects.toThrow("unavailable");
        expect(context.setBackground).not.toHaveBeenCalled();
    });

    it("validates modes and leaves non-HUD actions to the workspace provider", async () => {
        const context = makeContext();
        await expect(
            handleKronTermHudSurfaceAction({ action: "hud.mode", presentation: "bad" }, context)
        ).rejects.toThrow("HUD mode");
        expect(await handleKronTermHudSurfaceAction({ action: "resize", blockid: "browser" }, context)).toBeUndefined();
        await handleKronTermHudSurfaceAction({ action: "hud.mode", presentation: "hud" }, context);
        expect(context.setMode).toHaveBeenCalledExactlyOnceWith("hud");
    });
});
