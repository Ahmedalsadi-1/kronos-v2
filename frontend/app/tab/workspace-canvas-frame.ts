// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function finishCanvasPan(
    eventType: string,
    elapsedSinceMovement: number,
    startMomentum: () => void,
    persist: () => void
) {
    if (eventType === "pointerup" && elapsedSinceMovement < 80) {
        startMomentum();
        return;
    }
    persist();
}

export function makeCanvasFrameScheduler<T>(
    apply: (value: T) => void,
    requestFrame: (callback: FrameRequestCallback) => number,
    cancelFrame: (id: number) => void
) {
    let frame: number | null = null;
    let pending: { value: T } | null = null;
    const flush = () => {
        if (frame != null) {
            cancelFrame(frame);
            frame = null;
        }
        const next = pending;
        pending = null;
        if (next) {
            apply(next.value);
        }
    };
    return {
        schedule(value: T) {
            pending = { value };
            if (frame == null) {
                frame = requestFrame(() => {
                    frame = null;
                    flush();
                });
            }
        },
        flush,
        cancel() {
            if (frame != null) {
                cancelFrame(frame);
                frame = null;
            }
            pending = null;
        },
    };
}
