// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function penVoiceSynthesizer(desktop?: (text: string) => Promise<ArrayBuffer>) {
    if (desktop) return desktop;
    if (!import.meta.env.DEV || location.origin !== "http://localhost:9124") return undefined;

    // An already-open dev window can hot-reload the composer before its preload reloads.
    return async (text: string) => {
        const response = await fetch("http://127.0.0.1:8089/speech", {
            method: "POST",
            body: JSON.stringify({ text, voice: 0 }),
            redirect: "error",
            signal: AbortSignal.timeout(3000),
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/wav")) {
            throw new Error("Tiny Voca is unavailable.");
        }
        return response.arrayBuffer();
    };
}
