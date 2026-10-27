import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import { createInterface, type Interface } from "node:readline";
import { ComputerUseLatency } from "./computer-use-latency.js";
import { ToolOperationContext } from "./tool-execution.js";

type JsonRpcResponse = {
    id?: number;
    result?: unknown;
    error?: {
        code?: number;
        message?: string;
    };
};

export type KronComputerUseContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export type KronComputerUseToolResult = {
    content: KronComputerUseContent[];
    isError?: boolean;
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
};

export type KronComputerUseCall = {
    name: string;
    args?: Record<string, unknown>;
};

const RequestTimeoutMs = 120_000;
const SequenceActions = new Set([
    "click",
    "type_text",
    "press_key",
    "scroll",
    "drag",
    "set_value",
    "perform_secondary_action",
]);

export function validateComputerUseSequence(calls: KronComputerUseCall[]): void {
    if (!Array.isArray(calls) || calls.length < 1 || calls.length > 13)
        throw new Error("Use between 1 and 12 app actions and an optional final observation");
    const app = calls[0]?.args?.app;
    if (typeof app !== "string" || !app.trim()) throw new Error("A sequence requires an explicit app target");
    let actions = 0;
    for (const [index, call] of calls.entries()) {
        if (!call || call.args?.app !== app) throw new Error("Every sequence action must target the same app");
        if (call.name === "get_app_state" && index === calls.length - 1) continue;
        if (!SequenceActions.has(call.name)) throw new Error("Unsupported sequence action");
        actions++;
    }
    if (!actions || actions > 12) throw new Error("Use between 1 and 12 app actions");
}

export class KronComputerUseClient {
    private child: ChildProcessWithoutNullStreams | null = null;
    private stdout: Interface | null = null;
    private nextRequestId = 1;
    private pending = new Map<number, PendingRequest>();
    private startPromise: Promise<void> | null = null;
    private stderrTail = "";
    private operations: Promise<void> = Promise.resolve();
    private latency = new ComputerUseLatency();
    private generation = 0;

    diagnostics(): Record<string, unknown> {
        return {
            name: "kron-computer-use",
            binary: this.resolveBinary(),
            running: this.child != null && !this.child.killed,
            visualCursor: process.env.OPEN_COMPUTER_USE_VISUAL_CURSOR !== "0",
            platform: process.platform,
            latency: this.latency.snapshot(),
        };
    }

    async callTool(name: string, args: Record<string, unknown> = {}): Promise<KronComputerUseToolResult> {
        const boundArgs = structuredClone(args);
        const signal = ToolOperationContext.getStore()?.signal;
        const generation = this.generation;
        return this.serialize(async () => {
            const phase = this.child && !this.child.killed && !this.startPromise ? "call:warm" : "call:cold";
            const started = performance.now();
            let failed = false;
            try {
                signal?.throwIfAborted();
                await this.ensureStarted();
                signal?.throwIfAborted();
                this.assertGeneration(generation);
                const result = (await this.request("tools/call", {
                    name,
                    arguments: boundArgs,
                })) as KronComputerUseToolResult;
                signal?.throwIfAborted();
                failed = result.isError === true;
                return result;
            } catch (error) {
                failed = true;
                throw error;
            } finally {
                this.latency.record(phase, performance.now() - started, failed ? "error" : "success");
            }
        });
    }

    async warm(): Promise<void> {
        const started = performance.now();
        try {
            await this.ensureStarted();
            this.latency.record("warm", performance.now() - started);
        } catch (error) {
            this.latency.record("warm", performance.now() - started, "error");
            throw error;
        }
    }

    async callSequence(calls: KronComputerUseCall[]): Promise<KronComputerUseToolResult[]> {
        validateComputerUseSequence(calls);
        const boundCalls = structuredClone(calls);
        const signal = ToolOperationContext.getStore()?.signal;
        const generation = this.generation;
        return this.serialize(async () => {
            const started = performance.now();
            let failed = false;
            try {
                signal?.throwIfAborted();
                await this.ensureStarted();
                signal?.throwIfAborted();
                const results: KronComputerUseToolResult[] = [];
                for (const call of boundCalls) {
                    signal?.throwIfAborted();
                    this.assertGeneration(generation);
                    const result = (await this.request("tools/call", {
                        name: call.name,
                        arguments: call.args ?? {},
                    })) as KronComputerUseToolResult;
                    signal?.throwIfAborted();
                    results.push(result);
                    if (result.isError) {
                        failed = true;
                        const observation = boundCalls.at(-1);
                        if (call !== observation && observation?.name === "get_app_state") {
                            signal?.throwIfAborted();
                            this.assertGeneration(generation);
                            results.push(
                                (await this.request("tools/call", {
                                    name: observation.name,
                                    arguments: observation.args ?? {},
                                })) as KronComputerUseToolResult
                            );
                        }
                        break;
                    }
                }
                return results;
            } catch (error) {
                failed = true;
                throw error;
            } finally {
                this.latency.record("sequence", performance.now() - started, failed ? "error" : "success");
            }
        });
    }

    private assertGeneration(generation: number): void {
        if (generation !== this.generation) throw new Error("kron-computer-use runtime stopped");
    }

    private serialize<T>(operation: () => Promise<T>): Promise<T> {
        const generation = this.generation;
        const queuedAt = performance.now();
        const result = this.operations.then(() => {
            this.assertGeneration(generation);
            this.latency.record("queue", performance.now() - queuedAt);
            return operation();
        });
        this.operations = result.then(
            () => undefined,
            () => undefined
        );
        return result;
    }

    async turnEnded(): Promise<void> {
        if (!this.child || this.child.killed) {
            return;
        }
        this.notify("notifications/turn-ended", {});
    }

    close(): void {
        this.generation++;
        this.stdout?.close();
        this.stdout = null;
        this.child?.kill();
        this.child = null;
        this.startPromise = null;
        this.rejectPending(new Error("kron-computer-use runtime stopped"));
    }

    private async ensureStarted(): Promise<void> {
        if (!this.startPromise && this.child && !this.child.killed) {
            return;
        }
        if (!this.startPromise) {
            const started = performance.now();
            this.startPromise = this.start().then(
                () => {
                    this.latency.record("startup", performance.now() - started);
                },
                (error) => {
                    this.latency.record("startup", performance.now() - started, "error");
                    throw error;
                }
            );
        }
        const startup = this.startPromise;
        try {
            await startup;
        } finally {
            if (this.startPromise === startup) this.startPromise = null;
        }
    }

    private async start(): Promise<void> {
        const binary = this.resolveBinary();
        this.stderrTail = "";
        const child = spawn(binary, ["mcp"], {
            env: {
                ...process.env,
                PATH: [
                    ...new Set([
                        ...(isAbsolute(binary) ? [dirname(binary)] : []),
                        ...(process.env.PATH ?? "").split(delimiter).filter(Boolean),
                        ...(process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : []),
                    ]),
                ].join(delimiter),
                OPEN_COMPUTER_USE_VISUAL_CURSOR: process.env.OPEN_COMPUTER_USE_VISUAL_CURSOR ?? "1",
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.child = child;
        child.stdin.on("error", (error) => {
            if (this.child !== child) return;
            child.kill();
            this.handleExit(error);
        });
        this.stdout = createInterface({ input: child.stdout });
        this.stdout.on("line", (line) => this.handleLine(line));
        child.stderr.on("data", (chunk: Buffer) => {
            if (this.child !== child) return;
            this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-4000);
        });
        child.once("error", (error) => {
            if (this.child === child) this.handleExit(new Error(`unable to start kron-computer-use: ${error.message}`));
        });
        child.once("exit", (code, signal) => {
            if (this.child !== child) return;
            const detail = this.stderrTail.trim();
            this.handleExit(
                new Error(`kron-computer-use exited (${signal ?? code ?? "unknown"})${detail ? `: ${detail}` : ""}`)
            );
        });
        try {
            await this.request("initialize", {
                protocolVersion: "2025-03-26",
                capabilities: {},
                clientInfo: {
                    name: "kron-term",
                    version: "1.0.0",
                },
            });
            this.notify("notifications/initialized", {});
        } catch (error) {
            if (this.child === child) {
                child.kill();
                this.handleExit(error instanceof Error ? error : new Error(String(error)));
            }
            throw error;
        }
    }

    private resolveBinary(): string {
        const configured = process.env.KRON_COMPUTER_USE_BIN;
        if (configured) {
            return configured;
        }
        const candidates = [
            join(homedir(), ".nvm", "versions", "node", "v24.13.0", "bin", "open-computer-use"),
            "/opt/homebrew/bin/open-computer-use",
            "/usr/local/bin/open-computer-use",
        ];
        return candidates.find((candidate) => existsSync(candidate)) ?? "open-computer-use";
    }

    private request(method: string, params: Record<string, unknown>): Promise<unknown> {
        const child = this.child;
        if (!child || child.killed) {
            return Promise.reject(new Error("kron-computer-use runtime is not running"));
        }
        const id = this.nextRequestId++;
        const started = performance.now();
        const operation = method === "tools/call" && typeof params.name === "string" ? params.name : method;

        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (outcome: "success" | "error" | "timeout") => {
                if (settled) return false;
                settled = true;
                this.latency.record(operation, performance.now() - started, outcome);
                return true;
            };
            const timer = setTimeout(() => {
                this.pending.delete(id);
                if (finish("timeout")) reject(new Error(`kron-computer-use ${method} timed out`));
            }, RequestTimeoutMs);
            const failure = (error: Error) => {
                clearTimeout(timer);
                this.pending.delete(id);
                if (finish("error")) reject(error);
            };
            this.pending.set(id, {
                resolve: (value) => {
                    const isError = (value as KronComputerUseToolResult)?.isError === true;
                    if (finish(isError ? "error" : "success")) resolve(value);
                },
                reject: failure,
                timer,
            });
            try {
                child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
                    if (error) failure(error);
                });
            } catch (error) {
                failure(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private notify(method: string, params: Record<string, unknown>): void {
        if (!this.child || this.child.killed) {
            return;
        }
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    }

    private handleLine(line: string): void {
        let response: JsonRpcResponse;
        try {
            response = JSON.parse(line) as JsonRpcResponse;
        } catch {
            return;
        }
        if (typeof response.id !== "number") {
            return;
        }
        const pending = this.pending.get(response.id);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(response.id);
        if (response.error) {
            pending.reject(new Error(response.error.message ?? `JSON-RPC error ${response.error.code ?? "unknown"}`));
            return;
        }
        pending.resolve(response.result);
    }

    private handleExit(error: Error): void {
        this.stdout?.close();
        this.stdout = null;
        this.child = null;
        this.rejectPending(error);
    }

    private rejectPending(error: Error): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }
}

export function previewImageUrl(result: KronComputerUseToolResult): string | undefined {
    const image = result.content.find((item) => item.type === "image");
    return image?.type === "image" ? `data:${image.mimeType};base64,${image.data}` : undefined;
}
