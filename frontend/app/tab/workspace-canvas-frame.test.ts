// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { makeCanvasFrameScheduler } from "./workspace-canvas-frame";

function harness() {
    let nextId = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const apply = vi.fn();
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
        callbacks.set(++nextId, callback);
        return nextId;
    });
    const cancelFrame = vi.fn((id: number) => callbacks.delete(id));
    const scheduler = makeCanvasFrameScheduler<number>(apply, requestFrame, cancelFrame);
    const tick = () => {
        const scheduled = [...callbacks.values()];
        callbacks.clear();
        scheduled.forEach((callback) => callback(0));
    };
    return { scheduler, apply, requestFrame, cancelFrame, tick, callbacks };
}

describe("canvas interaction frames", () => {
    it("does geometry work once per display frame while preserving the latest pointer position", () => {
        const { scheduler, apply, requestFrame, tick } = harness();
        for (let frame = 0; frame < 60; frame++) {
            for (let sample = 0; sample < 10; sample++) {
                scheduler.schedule(frame * 10 + sample);
            }
            tick();
        }
        expect(requestFrame).toHaveBeenCalledTimes(60);
        expect(apply).toHaveBeenCalledTimes(60);
        expect(apply.mock.calls.map(([position]) => position)).toEqual(
            Array.from({ length: 60 }, (_, frame) => frame * 10 + 9)
        );
    });

    it("flushes the last movement before pointerup persistence and cancels the deferred frame", () => {
        const { scheduler, apply, tick, callbacks } = harness();
        scheduler.schedule(10);
        scheduler.schedule(20);
        scheduler.flush();
        expect(apply).toHaveBeenCalledExactlyOnceWith(20);
        expect(callbacks.size).toBe(0);
        tick();
        scheduler.flush();
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it("discards queued work after unmount and can schedule a subsequent interaction", () => {
        const { scheduler, apply, tick, callbacks } = harness();
        scheduler.schedule(10);
        scheduler.cancel();
        expect(callbacks.size).toBe(0);
        tick();
        scheduler.flush();
        expect(apply).not.toHaveBeenCalled();
        scheduler.schedule(30);
        tick();
        expect(apply).toHaveBeenCalledExactlyOnceWith(30);
    });

    it("allows an applied update to enqueue work for the next frame", () => {
        const { scheduler, apply, tick } = harness();
        apply.mockImplementationOnce(() => scheduler.schedule(20));
        scheduler.schedule(10);
        tick();
        expect(apply).toHaveBeenCalledExactlyOnceWith(10);
        tick();
        expect(apply.mock.calls).toEqual([[10], [20]]);
    });
});
