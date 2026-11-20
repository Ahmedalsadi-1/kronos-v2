// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type GestureTarget = { isDestroyed(): boolean; send(channel: string, direction: string): void };
type GestureWindow = {
    isFocused(): boolean;
    isDestroyed(): boolean;
    on(event: "swipe", listener: (event: unknown, direction: string) => void): unknown;
    off(event: "swipe", listener: (event: unknown, direction: string) => void): unknown;
    once(event: "closed", listener: () => void): unknown;
};

export function installOSOverviewGestures(
    window: GestureWindow,
    target: () => GestureTarget | undefined,
    platform = process.platform,
    browserSwipe?: (direction: "left" | "right") => void
): () => void {
    if (platform !== "darwin") return () => {};
    const swipe = (_event: unknown, direction: string) => {
        if (window.isDestroyed() || !window.isFocused()) return;
        if (direction === "left" || direction === "right") {
            browserSwipe?.(direction);
            return;
        }
        if (direction !== "up" && direction !== "down") return;
        const contents = target();
        if (!contents || contents.isDestroyed()) return;
        contents.send("os-overview-gesture", direction);
    };
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        window.off("swipe", swipe);
    };
    window.on("swipe", swipe);
    window.once("closed", dispose);
    return dispose;
}
