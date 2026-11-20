// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const TinyVocaOrigin = "http://127.0.0.1:8089";
const MaxWaveBytes = 4 * 1024 * 1024;

export async function synthesizePenVoice(text: unknown): Promise<ArrayBuffer> {
    if (typeof text !== "string" || !text.trim() || text.length > 360) {
        throw new Error("Invalid Tiny Voca phrase.");
    }
    const response = await fetch(TinyVocaOrigin + "/speech", {
        method: "POST",
        body: JSON.stringify({ text, voice: 0 }),
        redirect: "error",
        signal: AbortSignal.timeout(3000),
    });
    const length = Number(response.headers.get("content-length"));
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/wav") ||
        !Number.isSafeInteger(length) || length <= 44 || length > MaxWaveBytes) {
        await response.body?.cancel();
        throw new Error("Tiny Voca is unavailable.");
    }
    const wave = await response.arrayBuffer();
    if (wave.byteLength !== length || new DataView(wave).getUint32(0) !== 0x52494646) {
        throw new Error("Tiny Voca returned invalid audio.");
    }
    return wave;
}
