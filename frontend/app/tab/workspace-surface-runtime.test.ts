// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { controlWorkspaceSurface, registerWorkspaceSurfaceModeProvider } from "./workspace-surface-runtime";

describe("workspace surface execution", () => {
    it("rejects an unmounted spatial surface instead of falling back to the tiled model", async () => {
        await expect(controlWorkspaceSurface("missing", { action: "focus", blockid: "browser" })).rejects.toThrow(
            "not mounted"
        );
    });

    it("waits for the runtime operation and propagates its rejection", async () => {
        let rejectOperation: (error: Error) => void;
        const operation = new Promise<{ success: boolean; message: string }>((_resolve, reject) => {
            rejectOperation = reject;
        });
        const dispose = registerWorkspaceSurfaceModeProvider("async", {
            snapshot: () => ({ presentation: "os" }),
            control: () => operation,
        });
        try {
            const settled = vi.fn();
            const result = controlWorkspaceSurface("async", { action: "os.window.close", blockid: "terminal" });
            result.then(settled, settled);
            await Promise.resolve();
            expect(settled).not.toHaveBeenCalled();
            rejectOperation(new Error("Close rejected"));
            await expect(result).rejects.toThrow("Close rejected");
        } finally {
            dispose();
        }
    });

    it("propagates unsuccessful provider results and supports synchronous Canvas controls", async () => {
        const control = vi
            .fn()
            .mockReturnValueOnce({ success: false, message: "Stale window" })
            .mockReturnValueOnce({ success: true, message: "Focused" });
        const dispose = registerWorkspaceSurfaceModeProvider("canvas", {
            snapshot: () => ({ presentation: "canvas" }),
            control,
        });
        try {
            await expect(controlWorkspaceSurface("canvas", { action: "focus" })).rejects.toThrow("Stale window");
            await expect(controlWorkspaceSurface("canvas", { action: "focus", blockid: "browser" })).resolves.toEqual({
                success: true,
                message: "Focused",
            });
        } finally {
            dispose();
        }
    });
});
