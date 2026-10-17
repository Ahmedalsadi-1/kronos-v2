// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { ComputerTargetSessions } from "./computer-target-sessions";

const frame = { imageDataUrl: "data:image/png;base64,aGVsbG8=", capturedAt: 1 };
const makeRuntime = () => ({
    attachLive: vi.fn(async () => ({}) as any),
    liveFrame: vi.fn(async () => frame),
    detachLive: vi.fn(async () => {}),
});

describe("live device sessions", () => {
    it("binds frames and stop to the owning workspace and fences duplicate viewers", async () => {
        const runtime = makeRuntime();
        const sessions = new ComputerTargetSessions(runtime);
        try {
            const session = await sessions.start("device", 0, 1);
            await expect(sessions.start("device", 0, 2)).rejects.toThrow("already open");
            await expect(sessions.frame(session.id, 2)).rejects.toThrow("unavailable");
            await expect(sessions.stop(session.id, 2)).rejects.toThrow("unavailable");
            expect(await sessions.frame(session.id, 1)).toMatchObject({ sequence: 1, sessionId: session.id });
            await sessions.closeOwner(1);
            expect(runtime.detachLive).toHaveBeenCalledWith("device");
            await expect(sessions.frame(session.id, 1)).rejects.toThrow("unavailable");
        } finally {
            await sessions.dispose();
        }
    });

    it("discards late frames and prevents a new attach until detach finishes", async () => {
        const runtime = makeRuntime();
        let finishFrame: (value: typeof frame) => void;
        let finishStop: () => void;
        runtime.liveFrame.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishFrame = resolve;
                })
        );
        runtime.detachLive.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishStop = resolve;
                })
        );
        const sessions = new ComputerTargetSessions(runtime);
        try {
            const session = await sessions.start("device", 0, 1);
            const reading = sessions.frame(session.id, 1);
            const stopping = sessions.stop(session.id, 1);
            await expect(sessions.start("device", 0, 2)).rejects.toThrow("already open");
            finishFrame(frame);
            await expect(reading).rejects.toThrow("closed");
            finishStop();
            await stopping;
            expect((await sessions.start("device", 0, 2)).targetId).toBe("device");
        } finally {
            await sessions.dispose();
        }
    });

    it("rejects nonimage frames from the helper boundary", async () => {
        const runtime = makeRuntime();
        runtime.liveFrame.mockResolvedValue({ imageDataUrl: "file:///private/data", capturedAt: 1 });
        const sessions = new ComputerTargetSessions(runtime);
        try {
            const session = await sessions.start("device", 0, 1);
            await expect(sessions.frame(session.id, 1)).rejects.toThrow("invalid live frame");
        } finally {
            await sessions.dispose();
        }
    });
});
