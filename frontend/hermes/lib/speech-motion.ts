// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "nanostores";

export const $speechMotion = atom({ available: false, level: 0 });
const FrameSeconds = 0.05;

export function speechEnvelope(samples: Float32Array, sampleRate: number): number[] {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
    const frame = Math.max(1, Math.round(sampleRate * FrameSeconds));
    const levels: number[] = [];
    for (let offset = 0; offset < samples.length; offset += frame) {
        const end = Math.min(samples.length, offset + frame);
        let square = 0;
        for (let i = offset; i < end; i++) square += Number.isFinite(samples[i]) ? samples[i] * samples[i] : 0;
        levels.push(Math.min(1, Math.sqrt(square / (end - offset)) * 4));
    }
    return levels;
}

function publish(level: number, available = true): void {
    const value = Math.round(Math.max(0, Math.min(1, level)) * 100) / 100;
    const previous = $speechMotion.get();
    if (previous.level !== value || previous.available !== available) $speechMotion.set({ available, level: value });
}

export function scheduledSpeechMotion(context: AudioContext) {
    const frames: { at: number; until: number; level: number }[] = [];
    const timer = window.setInterval(() => {
        const now = context.currentTime;
        while (frames.length && frames[0].until <= now) frames.shift();
        const frame = frames[0];
        publish(context.state === "running" && frame && frame.at <= now ? frame.level : 0);
    }, 50);
    return {
        schedule(samples: Float32Array, sampleRate: number, at: number) {
            const envelope = speechEnvelope(samples, sampleRate);
            envelope.forEach((level, index) =>
                frames.push({
                    at: at + index * FrameSeconds,
                    until: Math.min(at + (index + 1) * FrameSeconds, at + samples.length / sampleRate),
                    level,
                })
            );
        },
        stop() {
            window.clearInterval(timer);
            frames.length = 0;
            publish(0, false);
        },
    };
}

export function audioElementSpeechMotion(audio: HTMLAudioElement, dataUrl: string): () => void {
    let alive = true;
    let envelope: number[];
    // Decode a separate copy; attaching a media source would change playback ownership and autoplay behavior.
    if (typeof OfflineAudioContext !== "undefined" && dataUrl.startsWith("data:audio/")) {
        const decoder = new OfflineAudioContext(1, 1, 24_000);
        void fetch(dataUrl)
            .then((response) => response.arrayBuffer())
            .then((bytes) => decoder.decodeAudioData(bytes))
            .then((buffer) => {
                if (alive) envelope = speechEnvelope(buffer.getChannelData(0), buffer.sampleRate);
            })
            .catch(() => {});
    }
    const timer = window.setInterval(() => {
        if (!envelope) return;
        publish(!audio.paused && !audio.ended ? (envelope[Math.floor(audio.currentTime / FrameSeconds)] ?? 0) : 0);
    }, 50);
    return () => {
        alive = false;
        window.clearInterval(timer);
        publish(0, false);
    };
}
