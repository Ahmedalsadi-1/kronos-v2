// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { JsonRpcGatewayClient } from "../frontend/hermes-shared/json-rpc-gateway";
import type { HermesApiRequest, HermesConnectionDescriptor, HermesSurfaceContext } from "./hermes-runtime";
import { registerWorkflowWorker } from "./n8n-worker-scope";
import type { N8nWorkspaceCommand } from "./n8n-workspace";

const WorkflowProfile = "kronterm-workflows";
const WorkflowSoul = `# Hermes Workflow Builder
You are KronOS's workflow engineer. Work with the user on the selected n8n canvas.
Use n8n_search_nodes and n8n_get_node before choosing or configuring nodes.
Use n8n_get_workflow before editing. Preserve versionId and use n8n_edit_workflow for small changes.
You can add, remove, rename and configure nodes and connect their typed ports.
Use the configured KronOS widget nodes for workspace surfaces. Use KronOS Agent for AI work.
Keep AI agent tool connections and credentials references intact. Never print or request raw secrets.
Validate structure, inspect execution evidence, and explain the result. Never claim a run succeeded without evidence.
Only run workflows or workspace tools when the user's request authorizes their effects.
Do not recursively invoke n8n_run_agent. You are already the assigned workflow worker.
Ask the user to complete credential setup, permissions, account setup, or licensing when required.
Use the existing KronOS approval system. Do not disable authentication or permission checks.
`;

let profilePreparation: Promise<void>;
export async function prepareWorkflowProfile(api: <T>(request: HermesApiRequest) => Promise<T>): Promise<void> {
    if (profilePreparation) return profilePreparation;
    const preparation = (async () => {
        const profiles = await api<{ profiles: { name: string }[] }>({ path: "/api/profiles" });
        if (profiles.profiles.some((entry) => entry.name === WorkflowProfile)) return;
        await api({ path: "/api/profiles", method: "POST", body: { name: WorkflowProfile, clone_from_default: true } });
        await api({ path: `/api/profiles/${WorkflowProfile}/soul`, method: "PUT", body: { content: WorkflowSoul } });
    })();
    profilePreparation = preparation;
    try {
        await preparation;
    } catch (error) {
        profilePreparation = null;
        throw error;
    }
}

export async function runHermesWorkflowWorker(
    connection: HermesConnectionDescriptor,
    input: N8nWorkspaceCommand,
    context: HermesSurfaceContext,
    signal?: AbortSignal
): Promise<{ sessionId: string; storedSessionId: string; text: string; usage?: unknown }> {
    if (context.n8nWorkerId) throw new Error("Workflow workers cannot recursively start another workflow worker.");
    if (typeof input.task !== "string" || !input.task.trim() || input.task.length > 40000)
        throw new Error("Provide a workflow task of 1–40000 characters.");
    const controller = new AbortController();
    const timeoutMs = Math.min(600, Math.max(15, Number(input.timeoutSeconds) || 180)) * 1000;
    const timer = setTimeout(() => controller.abort(new Error("Hermes workflow worker timed out.")), timeoutMs);
    const abort = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const gateway = new JsonRpcGatewayClient({
        socketFactory: (url) => new WebSocket(url) as unknown as globalThis.WebSocket,
        requestTimeoutMs: Math.min(timeoutMs, 30000),
    });
    let sessionId: string;
    let storedSessionId: string;
    let release: () => void;
    let unsubscribe: () => void;
    let unsubscribeState: () => void;
    let onAbort: () => void;
    try {
        if (abort.aborted) throw new Error("Workflow worker cancelled.");
        const url = new URL(connection.wsUrl);
        url.searchParams.set("profile", WorkflowProfile);
        await gateway.connect(url.toString());
        const created = await gateway.request<{ session_id: string; stored_session_id: string }>(
            "session.create",
            {
                profile: WorkflowProfile,
                source: "desktop",
                title: "Hermes workflow worker",
                close_on_disconnect: true,
                idempotency_key: randomUUID(),
            },
            30000,
            abort
        );
        sessionId = created.session_id;
        storedSessionId = created.stored_session_id;
        release = registerWorkflowWorker([sessionId, storedSessionId], {
            ...context,
            n8nWorkerId: randomUUID(),
            n8nWorkflowId: input.workflowId,
        });
        const done = new Promise<{ sessionId: string; storedSessionId: string; text: string; usage?: unknown }>(
            (resolve, reject) => {
                onAbort = () =>
                    reject(abort.reason instanceof Error ? abort.reason : new Error("Workflow worker cancelled."));
                abort.addEventListener("abort", onAbort, { once: true });
                unsubscribeState = gateway.onState((state) => {
                    if (state === "closed" || state === "error")
                        reject(new Error("Hermes workflow connection closed."));
                });
                unsubscribe = gateway.onAny((event) => {
                    if (event.session_id !== sessionId) return;
                    const payload = event.payload as {
                        text?: string;
                        message?: string;
                        status?: string;
                        usage?: unknown;
                    };
                    if (event.type === "message.complete") {
                        if (payload?.status && payload.status !== "complete")
                            reject(new Error(payload.text || `Hermes worker ${payload.status}`));
                        else resolve({ sessionId, storedSessionId, text: payload?.text ?? "", usage: payload?.usage });
                    }
                    if (["approval.request", "clarify.request", "sudo.request", "secret.request"].includes(event.type))
                        reject(
                            new Error(
                                `Hermes worker needs user action: ${event.type}. Run this task in Hermes chat to respond to the request.`
                            )
                        );
                    if (event.type === "error") reject(new Error(payload?.message || "Hermes workflow worker failed."));
                });
                const task = `${WorkflowSoul}\nAssigned workflow: ${input.workflowId || "none selected"}\nExecution: ${input.executionId || "builder"}\nInput data: ${JSON.stringify(input.input ?? {})}\n\nUser task:\n${input.task}`;
                void gateway
                    .request("prompt.submit", { session_id: sessionId, text: task }, timeoutMs, abort)
                    .catch(reject);
            }
        );
        return await done;
    } finally {
        clearTimeout(timer);
        if (onAbort) abort.removeEventListener("abort", onAbort);
        unsubscribe?.();
        unsubscribeState?.();
        if (sessionId) {
            await gateway.request("session.interrupt", { session_id: sessionId }, 3000).catch(() => undefined);
            await gateway.request("session.close", { session_id: sessionId }, 3000).catch(() => undefined);
        }
        release?.();
        gateway.close();
    }
}
