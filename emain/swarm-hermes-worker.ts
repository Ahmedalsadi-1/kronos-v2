// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { JsonRpcGatewayClient, type GatewayEvent } from "../frontend/hermes-shared/json-rpc-gateway";
import type { HermesConnectionDescriptor, HermesSurfaceContext } from "./hermes-runtime";
import { SwarmWorkerError } from "./swarm-worker-error";
import { registerSwarmWorker } from "./swarm-worker-registry";

const MaxResponseBytes = 32768;

async function connect(gateway: JsonRpcGatewayClient, url: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    let onAbort: () => void;
    const stopped = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
        await Promise.race([gateway.connect(url), stopped]);
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}

export async function runSwarmHermesWorker(input: {
    connection: HermesConnectionDescriptor;
    context: HermesSurfaceContext;
    prompt: string;
    signal: AbortSignal;
    timeoutMs?: number;
    onSession?: (sessionId: string) => void;
    onEvent?: (event: GatewayEvent) => void;
}) {
    const timeout = AbortSignal.timeout(Math.min(input.timeoutMs ?? 300000, 300000));
    const signal = AbortSignal.any([input.signal, timeout]);
    const gateway = new JsonRpcGatewayClient({
        socketFactory: (url) => new WebSocket(url) as unknown as globalThis.WebSocket,
    });
    let sessionId: string;
    let grant: ReturnType<typeof registerSwarmWorker>;
    let unsubscribe: () => void;
    let unsubscribeState: () => void;
    let onAbort: () => void;
    let dispatched = false;
    let complete = false;
    let interruptedByUser = false;
    let drained = false;
    let announced = false;
    let text: string;
    try {
        try {
            await connect(gateway, input.connection.wsUrl, signal);
            const created = await gateway.request<{ session_id: string; stored_session_id: string }>(
                "session.create",
                {
                    source: "desktop",
                    title: input.context.swarmPlanning ? "MACU planning" : "MACU swarm worker",
                    close_on_disconnect: true,
                    idempotency_key: randomUUID(),
                },
                30000,
                signal
            );
            sessionId = created.session_id;
            if (typeof sessionId !== "string" || !sessionId)
                throw new Error("Hermes did not return a worker identity.");
            grant = registerSwarmWorker([sessionId, created.stored_session_id].filter(Boolean), input.context);
            const { waitForSwarmGuard } = await import("./kronterm-tool-server");
            await waitForSwarmGuard(signal);
            signal.throwIfAborted();
            text = await new Promise<string>((resolve, reject) => {
                onAbort = () => reject(signal.reason);
                signal.addEventListener("abort", onAbort, { once: true });
                unsubscribeState = gateway.onState((state) => {
                    if (state === "closed" || state === "error") {
                        reject(new Error("Swarm worker disconnected; effects may be incomplete."));
                    }
                });
                let streamedBytes = 0;
                unsubscribe = gateway.onAny((event) => {
                    if (event.session_id !== sessionId) return;
                    const payload = event.payload as { text?: string; status?: string; message?: string };
                    if (event.type === "message.delta" && typeof payload?.text === "string") {
                        streamedBytes += Buffer.byteLength(payload.text);
                        if (streamedBytes > MaxResponseBytes) {
                            reject(new Error("Swarm response exceeded 32 KiB."));
                            return;
                        }
                    }
                    try {
                        if (event.type === "message.start" && !announced) {
                            announced = true;
                            input.onSession?.(sessionId);
                        }
                        input.onEvent?.(event);
                    } catch (error) {
                        reject(error);
                        return;
                    }
                    if (event.type === "message.complete") {
                        if (payload?.status && payload.status !== "complete") {
                            interruptedByUser = ["interrupted", "cancelled", "canceled"].includes(payload.status);
                            reject(new Error(`Swarm worker stopped: ${payload.status}`));
                        } else if (
                            typeof payload?.text !== "string" ||
                            Buffer.byteLength(payload.text) > MaxResponseBytes
                        ) {
                            reject(new Error("Invalid swarm result."));
                        } else {
                            complete = true;
                            resolve(payload.text);
                        }
                    }
                    if (
                        ["approval.request", "clarify.request", "sudo.request", "secret.request"].includes(event.type)
                    ) {
                        reject(new Error("Worker needs user input. Complete this step in its chat before retrying."));
                    }
                    if (event.type === "error") reject(new Error(payload?.message || "Swarm worker failed."));
                });
                dispatched = true;
                void gateway
                    .request("prompt.submit", { session_id: sessionId, text: input.prompt }, 300000, signal)
                    .catch(reject);
            });
        } finally {
            grant?.revoke();
            if (onAbort) signal.removeEventListener("abort", onAbort);
            unsubscribe?.();
            unsubscribeState?.();
            try {
                if (sessionId) {
                    if (dispatched && !complete) {
                        await gateway
                            .request("session.interrupt", { session_id: sessionId }, 3000)
                            .catch(() => undefined);
                    }
                    await gateway.request("session.close", { session_id: sessionId }, 3000).catch(() => undefined);
                }
            } finally {
                gateway.close();
                await grant?.drain();
                drained = true;
            }
        }
    } catch (error) {
        const failure = new SwarmWorkerError(
            error instanceof Error ? error.message : "Swarm worker stopped.",
            dispatched,
            { cause: error }
        );
        failure.settledCancellation = drained && (input.signal.aborted || interruptedByUser) && !grant?.uncertain();
        throw failure;
    }
    return { text, sessionId, evidence: grant.evidence(), observed: grant.observed(), uncertain: grant.uncertain() };
}
