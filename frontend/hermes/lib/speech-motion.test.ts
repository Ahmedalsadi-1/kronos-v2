// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test, vi } from "vitest";
import { $speechMotion, scheduledSpeechMotion, speechEnvelope } from "./speech-motion";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    $speechMotion.set({ available: false, level: 0 });
});

describe("speech motion follows delivered audio samples", () => {
    test("keeps silence closed and normalizes spoken amplitude", () => {
        const samples = new Float32Array(100);
        samples.fill(0.125, 50);
        expect(speechEnvelope(samples, 1000)).toEqual([0, 0.5]);
    });
    test("bounds loud samples and includes partial final frames", () => {
        const samples = new Float32Array(51).fill(2);
        expect(speechEnvelope(samples, 1000)).toEqual([1, 1]);
        expect(speechEnvelope(samples, 0)).toEqual([]);
        expect(speechEnvelope(new Float32Array([Number.NaN]), 1000)).toEqual([0]);
    });
    test("follows the playback clock, stays quiet during suspension, and cleans up", () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", globalThis);
        const context = { currentTime: 0, state: "running" };
        const motion = scheduledSpeechMotion(context as AudioContext);
        motion.schedule(new Float32Array(100).fill(0.125), 1000, 1);
        vi.advanceTimersByTime(50);
        expect($speechMotion.get().level).toBe(0);
        context.currentTime = 1.025;
        vi.advanceTimersByTime(50);
        expect($speechMotion.get().level).toBe(0.5);
        context.state = "suspended";
        vi.advanceTimersByTime(50);
        expect($speechMotion.get().level).toBe(0);
        context.state = "running";
        context.currentTime = 1.2;
        vi.advanceTimersByTime(50);
        expect($speechMotion.get().level).toBe(0);
        motion.stop();
        expect($speechMotion.get()).toEqual({ available: false, level: 0 });
        expect(vi.getTimerCount()).toBe(0);
    });
});
