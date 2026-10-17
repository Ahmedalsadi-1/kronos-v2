// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { getWaveDataDir } from "./emain-platform";

let audioProc: ChildProcess = null;
let nextRequestId = 1;
let readyPromise: Promise<boolean> | null = null;
let readyResolve: ((ready: boolean) => void) | null = null;
let status = "idle";
let callbacks: AudioCallbacks = {};
const FileRequests = new Map<
    number,
    {
        resolve: (value: AudioFileTranscript) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }
>();
export type AudioFileTranscript = { segments: { start: number; end: number; text: string }[]; language?: string };

function rejectFileRequests(message: string): void {
    for (const request of FileRequests.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(message));
    }
    FileRequests.clear();
}

type AudioCallbacks = {
    onStatusChange?: (status: string) => void;
    onTranscript?: (text: string) => void;
    onError?: (message: string) => void;
};

export async function runAudioEngine(): Promise<boolean> {
    if (audioProc) {
        return readyPromise ?? true;
    }
    const audioEngineDir = resolveAudioEngineDir();
    const mainPy = join(audioEngineDir, "main.py");
    const python = resolvePythonBinary();
    if (!audioEngineDir || !existsSync(mainPy) || !python) {
        callbacks.onError?.("Audio engine is unavailable");
        updateStatus("idle");
        return false;
    }
    readyPromise = new Promise((resolve) => {
        readyResolve = resolve;
    });
    const dataDir = getWaveDataDir();
    const proc = spawn(python, [mainPy], {
        cwd: audioEngineDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            PATH: buildPathEnv(),
            WAVE_DATA_DIR: dataDir,
        },
    });
    audioProc = proc;

    let outputBuffer = "";
    proc.stdout.on("data", (chunk: Buffer) => {
        outputBuffer += chunk.toString();
        let newline: number;
        while ((newline = outputBuffer.indexOf("\n")) >= 0) {
            const line = outputBuffer.slice(0, newline).trim();
            outputBuffer = outputBuffer.slice(newline + 1);
            if (!line) continue;
            try {
                handleAudioMessage(JSON.parse(line));
            } catch {
                console.log("[audio-engine:stdout]", line);
            }
        }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
        console.log("[audio-engine:stderr]", chunk.toString().trim());
    });

    proc.on("error", (err) => {
        console.log("[audio-engine] failed to start", err);
        rejectFileRequests("Audio engine stopped before transcription completed");
        audioProc = null;
        callbacks.onError?.(err.message);
        updateStatus("idle");
        readyResolve?.(false);
        readyResolve = null;
        readyPromise = null;
    });

    proc.on("exit", (code, signal) => {
        console.log("[audio-engine] exited", code !== null ? `code=${code}` : `signal=${signal}`);
        rejectFileRequests("Audio engine stopped before transcription completed");
        audioProc = null;
        updateStatus("idle");
        readyResolve?.(false);
        readyResolve = null;
        readyPromise = null;
    });

    return readyPromise;
}

function resolveAudioEngineDir(): string {
    const candidates = [
        join(process.cwd(), "audio-engine"),
        join(__dirname, "..", "audio-engine"),
        join(process.resourcesPath ?? "", "audio-engine"),
    ];
    return candidates
        .filter((candidate): candidate is string => Boolean(candidate))
        .find((candidate) => existsSync(join(candidate, "main.py")));
}

function resolvePythonBinary(): string {
    const candidates = [
        process.env.PYTHON,
        process.env.PYTHON3,
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
        join(os.homedir(), ".local", "bin", "python3"),
    ];
    return candidates
        .filter((candidate): candidate is string => Boolean(candidate))
        .find((candidate) => existsSync(candidate));
}

function buildPathEnv(): string {
    return ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", process.env.PATH ?? ""]
        .filter(Boolean)
        .join(":");
}

function handleAudioMessage(msg: any): void {
    const request = FileRequests.get(msg.id);
    if (request) {
        FileRequests.delete(msg.id);
        clearTimeout(request.timer);
        if (msg.error) {
            request.reject(new Error(msg.error.message ?? "Transcription failed"));
            return;
        }
        const result = msg.result;
        if (
            !result ||
            !Array.isArray(result.segments) ||
            result.segments.length > 100_000 ||
            result.segments.some(
                (segment) =>
                    !Number.isFinite(segment.start) ||
                    !Number.isFinite(segment.end) ||
                    segment.start < 0 ||
                    segment.end <= segment.start ||
                    typeof segment.text !== "string"
            )
        ) {
            request.reject(new Error("Audio engine returned an invalid transcript"));
            return;
        }
        request.resolve(result);
        return;
    }
    const method = msg.method ?? msg.type;
    const params = msg.params ?? {};
    switch (method) {
        case "ready":
            readyResolve?.(true);
            readyResolve = null;
            readyPromise = null;
            updateStatus("idle");
            break;
        case "listening":
            updateStatus(params.listening ? "listening" : "idle");
            break;
        case "speaking":
            updateStatus(params.text ? "speaking" : "idle");
            break;
        case "transcript":
            callbacks.onTranscript?.(params.text ?? msg.text ?? "");
            updateStatus("idle");
            break;
        case "state":
            updateStatus(params.status ?? msg.status ?? status);
            break;
        case "error":
            callbacks.onError?.(params.message ?? msg.message ?? "Audio engine error");
            updateStatus("error");
            break;
    }
}

function sendAudioCommand(method: string, params: Record<string, any> = {}): void {
    if (!audioProc?.stdin || audioProc.stdin.destroyed) {
        callbacks.onError?.("Audio engine is not running");
        return;
    }
    audioProc.stdin.write(`${JSON.stringify({ id: nextRequestId++, method, params })}\n`);
}

function updateStatus(nextStatus: string): void {
    status = nextStatus;
    callbacks.onStatusChange?.(status);
}

export function registerAudioCallbacks(nextCallbacks: AudioCallbacks): void {
    callbacks = nextCallbacks;
}

export function audioGetStatus(): string {
    return status;
}

export function audioStartListening(): void {
    sendAudioCommand("start_listening");
}

export function audioStopListening(): void {
    sendAudioCommand("stop_listening");
}

export function audioSpeak(text: string): void {
    sendAudioCommand("speak", { text });
}

export function audioSetWakeWord(enabled: boolean): void {
    sendAudioCommand("set_wake_word", { enabled });
}

export function audioShutdown(): void {
    sendAudioCommand("shutdown");
    stopAudioEngine();
}

export function stopAudioEngine(): void {
    rejectFileRequests("Audio engine stopped before transcription completed");
    if (audioProc) {
        audioProc.kill("SIGTERM");
        setTimeout(() => {
            if (audioProc) audioProc.kill("SIGKILL");
        }, 3000);
    }
}

export function audioTranscribeFile(file: string): Promise<AudioFileTranscript> {
    if (typeof file !== "string" || !file.startsWith("/") || file.length > 4096)
        return Promise.reject(new Error("Choose an absolute local audio file"));
    try {
        const stat = statSync(file);
        if (!stat.isFile() || stat.size > 500_000_000) throw new Error("Choose an audio file under 500 MB");
    } catch (error) {
        return Promise.reject(error);
    }
    if (!audioProc?.stdin || audioProc.stdin.destroyed || readyPromise)
        return Promise.reject(new Error("Start the audio engine and wait until it is ready"));
    if (FileRequests.size > 0) return Promise.reject(new Error("A file transcription is already running"));
    return new Promise((resolve, reject) => {
        const id = nextRequestId++;
        const timer = setTimeout(() => {
            FileRequests.delete(id);
            reject(
                new Error("Transcription timed out. The engine may still be processing; restart it before retrying.")
            );
        }, 10 * 60_000);
        FileRequests.set(id, { resolve, reject, timer });
        audioProc.stdin.write(
            `${JSON.stringify({ id, method: "transcribe_file", params: { path: file } })}\n`,
            (error) => {
                if (!error || !FileRequests.has(id)) return;
                FileRequests.delete(id);
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}
