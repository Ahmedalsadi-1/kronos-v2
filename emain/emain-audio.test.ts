// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { audioTranscribeFile, runAudioEngine, stopAudioEngine } from "./emain-audio";

const mocks = vi.hoisted(() => ({ proc: null as any }));
vi.mock("node:child_process", () => ({ spawn: () => mocks.proc }));
vi.mock("node:fs", () => ({ existsSync: () => true, statSync: () => ({ isFile: () => true, size: 100 }) }));
vi.mock("./emain-platform", () => ({ getWaveDataDir: () => "/audio-test" }));

beforeEach(() => {
    mocks.proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { destroyed: false, write: vi.fn((_value, callback) => callback?.()) },
        kill: vi.fn(),
    });
});
afterEach(() => {
    mocks.proc.emit("exit", 0, null);
});
async function ready() {
    const waiting = runAudioEngine();
    mocks.proc.stdout.emit("data", Buffer.from('{"method":"ready"}\n'));
    expect(await waiting).toBe(true);
}

test("joins partial protocol lines and correlates file transcript results", async () => {
    await ready();
    const pending = audioTranscribeFile("/audio.wav");
    const request = JSON.parse(mocks.proc.stdin.write.mock.calls[0][0]);
    const response = JSON.stringify({
        id: request.id,
        result: { segments: [{ start: 0, end: 2, text: "Recorded words" }] },
    });
    mocks.proc.stdout.emit("data", Buffer.from(response.slice(0, 17)));
    mocks.proc.stdout.emit("data", Buffer.from(response.slice(17) + "\n"));
    expect(await pending).toEqual({ segments: [{ start: 0, end: 2, text: "Recorded words" }] });
});
test("engine errors reject the correct request and release its slot", async () => {
    await ready();
    const pending = audioTranscribeFile("/audio.wav");
    const rejection = expect(pending).rejects.toThrow("Cached model missing");
    const request = JSON.parse(mocks.proc.stdin.write.mock.calls[0][0]);
    mocks.proc.stdout.emit(
        "data",
        Buffer.from(JSON.stringify({ id: request.id, error: { message: "Cached model missing" } }) + "\n")
    );
    await rejection;
    const next = audioTranscribeFile("/audio.wav");
    const stopped = expect(next).rejects.toThrow("stopped");
    stopAudioEngine();
    await stopped;
});
test("rejects concurrent file transcription and malformed response timing", async () => {
    await ready();
    const pending = audioTranscribeFile("/audio.wav");
    const invalid = expect(pending).rejects.toThrow("invalid transcript");
    await expect(audioTranscribeFile("/second.wav")).rejects.toThrow("already running");
    const request = JSON.parse(mocks.proc.stdin.write.mock.calls[0][0]);
    mocks.proc.stdout.emit(
        "data",
        Buffer.from(
            JSON.stringify({ id: request.id, result: { segments: [{ start: 5, end: 1, text: "Bad" }] } }) + "\n"
        )
    );
    await invalid;
});
