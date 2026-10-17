// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type NativeBackgroundDisplay = {
    displayId: number;
    spaceIds: string[];
    bounds: { x: number; y: number; width: number; height: number };
};
type DisplayChild = Pick<ChildProcess, "stdout" | "stderr" | "stdin" | "kill" | "on" | "once" | "removeListener">;
type Entry = {
    child?: DisplayChild;
    metadata?: NativeBackgroundDisplay;
    failed: boolean;
    exited: boolean;
    disposing?: boolean;
    shutdown?: Promise<void>;
};
type Options = {
    spawn?: (binary: string) => DisplayChild;
    binaryPath?: string;
    startupTimeoutMs?: number;
    registerExitCleanup?: boolean;
    now?: () => number;
    shutdownTimeoutMs?: number;
};

function helperPath(): string {
    if (process.env.KRONTERM_BACKGROUND_DISPLAY_BIN) return process.env.KRONTERM_BACKGROUND_DISPLAY_BIN;
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    const packaged = resourcesPath && path.join(resourcesPath, "native", "background-display");
    if (packaged && existsSync(packaged)) return packaged;
    return fileURLToPath(new URL("../../dist/native/background-display", import.meta.url));
}

function receipt(value: unknown): NativeBackgroundDisplay {
    const candidate = value as NativeBackgroundDisplay & { success?: boolean };
    if (
        !candidate ||
        candidate.success === false ||
        !Number.isSafeInteger(candidate.displayId) ||
        candidate.displayId <= 0 ||
        candidate.displayId > 0xffffffff ||
        !Array.isArray(candidate.spaceIds) ||
        candidate.spaceIds.length === 0 ||
        !candidate.spaceIds.every((id) => typeof id === "string" && /^[1-9]\d*$/.test(id)) ||
        !candidate.bounds ||
        ![candidate.bounds.x, candidate.bounds.y, candidate.bounds.width, candidate.bounds.height].every(
            Number.isFinite
        ) ||
        candidate.bounds.width !== 1280 ||
        candidate.bounds.height !== 800
    )
        throw new Error("Native background display returned invalid identity or bounds.");
    return { displayId: candidate.displayId, spaceIds: [...candidate.spaceIds], bounds: { ...candidate.bounds } };
}

export class NativeBackgroundDisplays {
    private entries = new Map<string, Entry>();
    private attempts: number[] = [];
    private readonly spawnChild: (binary: string) => DisplayChild;
    private readonly exitCleanup = () => {
        for (const entry of this.entries.values()) entry.child?.kill();
    };

    constructor(private options: Options = {}) {
        this.spawnChild = options.spawn ?? ((binary) => spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] }));
        if (options.registerExitCleanup !== false) process.once("exit", this.exitCleanup);
    }

    async create(owner: string): Promise<NativeBackgroundDisplay> {
        if (!owner?.trim()) throw new Error("A trusted native display owner is required.");
        if (this.entries.has(owner)) throw new Error("This caller already owns a native background display.");
        if (this.entries.size) throw new Error("Only one native background display is supported at a time.");
        const now = (this.options.now ?? Date.now)();
        this.attempts = this.attempts.filter((time) => now - time < 86400000);
        if (
            [
                [60000, 4],
                [600000, 12],
                [86400000, 32],
            ].some(([window, limit]) => this.attempts.filter((time) => now - time < window).length >= limit)
        )
            throw new Error("Native background display creation rate limit reached.");
        this.attempts.push(now);
        const entry: Entry = { failed: false, exited: false };
        this.entries.set(owner, entry);
        try {
            const child = this.spawnChild(this.options.binaryPath ?? helperPath());
            entry.child = child;
            child.stdin?.on("error", () => {
                entry.failed = true;
            });
            const exited = () => {
                entry.failed = true;
                entry.exited = true;
                if (entry.disposing && this.entries.get(owner) === entry) this.entries.delete(owner);
            };
            child.on("exit", exited);
            child.on("close", exited);
            child.on("error", () => {
                entry.failed = true;
            });
            const metadata = await new Promise<NativeBackgroundDisplay>((resolve, reject) => {
                let stdout = "";
                let stderr = "";
                let settled = false;
                const finish = (error?: Error, result?: NativeBackgroundDisplay) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    child.stdout?.removeListener("data", onData);
                    child.stderr?.removeListener("data", onStderr);
                    child.removeListener("error", onError);
                    child.removeListener("exit", onExit);
                    if (error) reject(error);
                    else resolve(result!);
                };
                const onError = () => finish(new Error("Native background display helper could not start."));
                const onExit = () => finish(new Error("Native background display helper exited before readiness."));
                const onStderr = (chunk: Buffer | string) => {
                    stderr = (stderr + chunk.toString()).slice(-8192);
                };
                const onData = (chunk: Buffer | string) => {
                    stdout += chunk.toString();
                    if (Buffer.byteLength(stdout) > 16384) {
                        finish(new Error("Native background display receipt exceeded the size limit."));
                        return;
                    }
                    const end = stdout.indexOf("\n");
                    if (end < 0) return;
                    try {
                        finish(undefined, receipt(JSON.parse(stdout.slice(0, end))));
                    } catch {
                        finish(new Error("Native background display returned an invalid readiness receipt."));
                    }
                };
                const timer = setTimeout(
                    () => finish(new Error("Native background display startup timed out.")),
                    Math.min(Math.max(this.options.startupTimeoutMs ?? 45000, 1), 45000)
                );
                child.stdout?.on("data", onData);
                child.stderr?.on("data", onStderr);
                child.once("error", onError);
                child.once("exit", onExit);
                if (!child.stdout || !child.stdin) onError();
            });
            if (entry.failed) throw new Error("Native background display helper exited during readiness.");
            entry.metadata = metadata;
            // Drain persistent pipes without retaining helper diagnostics or future output.
            child.stdout?.resume();
            child.stderr?.resume();
            return structuredClone(metadata);
        } catch (error) {
            try {
                await this.dispose(owner);
            } catch {
                throw new Error(
                    "Native background display startup failed and helper shutdown could not be confirmed; replacement displays remain blocked.",
                    { cause: error }
                );
            }
            throw error;
        }
    }

    get(owner: string): NativeBackgroundDisplay | undefined {
        const entry = this.entries.get(owner);
        if (!entry) return undefined;
        if (entry.failed || !entry.metadata) throw new Error("Owned native background display is unavailable.");
        return structuredClone(entry.metadata);
    }

    async dispose(owner: string): Promise<void> {
        const entry = this.entries.get(owner);
        if (!entry) return;
        if (entry.shutdown) return entry.shutdown;
        entry.failed = true;
        entry.disposing = true;
        if (!entry.child || entry.exited) {
            this.entries.delete(owner);
            return;
        }
        const child = entry.child;
        const timeoutMs = Math.min(Math.max(this.options.shutdownTimeoutMs ?? 2000, 1), 5000);
        const waitForExit = () =>
            new Promise<boolean>((resolve) => {
                if (entry.exited) {
                    resolve(true);
                    return;
                }
                const finish = (exited: boolean) => {
                    clearTimeout(timer);
                    child.removeListener("exit", onExit);
                    child.removeListener("close", onExit);
                    resolve(exited);
                };
                const onExit = () => finish(true);
                const timer = setTimeout(() => finish(entry.exited), timeoutMs);
                child.once("exit", onExit);
                child.once("close", onExit);
            });
        const terminate = (signal: NodeJS.Signals) => {
            try {
                child.kill(signal);
            } catch {
                /* Keep the reservation until an exit is observed. */
            }
        };
        entry.shutdown = (async () => {
            terminate("SIGTERM");
            if (!(await waitForExit())) {
                terminate("SIGKILL");
                if (!(await waitForExit())) {
                    throw new Error(
                        "Native background display helper shutdown could not be confirmed; replacement displays remain blocked."
                    );
                }
            }
            if (this.entries.get(owner) === entry) this.entries.delete(owner);
        })();
        return entry.shutdown;
    }
}

export const nativeBackgroundDisplays = new NativeBackgroundDisplays();
