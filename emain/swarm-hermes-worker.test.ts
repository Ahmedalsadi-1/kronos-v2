// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayEvent } from "../frontend/hermes-shared/json-rpc-gateway";
import type { HermesConnectionDescriptor, HermesSurfaceContext } from "./hermes-runtime";
import { runSwarmHermesWorker } from "./swarm-hermes-worker";
import { resolveSwarmWorker } from "./swarm-worker-registry";

const Gateway = vi.hoisted(() => ({
    connect: vi.fn(),
    request: vi.fn(),
    close: vi.fn(),
    onState: vi.fn(() => vi.fn()),
    onAny: vi.fn<(listener: (event: GatewayEvent) => void) => () => void>(() => vi.fn()),
    guard: vi.fn(),
}));

vi.mock("../frontend/hermes-shared/json-rpc-gateway", () => ({
    JsonRpcGatewayClient: class {
        connect = Gateway.connect;
        request = Gateway.request;
        close = Gateway.close;
        onState = Gateway.onState;
        onAny = Gateway.onAny;
    },
}));

vi.mock("./kronterm-tool-server", () => ({ waitForSwarmGuard: Gateway.guard }));

const Connection = { wsUrl: "ws://localhost:1234" } as HermesConnectionDescriptor;
const Context: HermesSurfaceContext = { tabId: "tab", workspaceId: "workspace", swarmRunId: "run" };

describe("swarm Hermes worker", () => {
    let sessionId: string;

    beforeEach(() => {
        vi.clearAllMocks();
        sessionId = randomUUID();
        Gateway.connect.mockResolvedValue(undefined);
        Gateway.guard.mockResolvedValue(undefined);
        Gateway.request.mockImplementation(async (method) => {
            if (method === "session.create") return { session_id: sessionId, stored_session_id: randomUUID() };
        });
    });

    it("refuses to submit a prompt when the tool guard has not loaded", async () => {
        Gateway.guard.mockRejectedValueOnce(new Error("No worker guard"));
        await expect(
            runSwarmHermesWorker({
                connection: Connection,
                context: Context,
                prompt: "Run",
                signal: new AbortController().signal,
            })
        ).rejects.toMatchObject({ dispatched: false, message: "No worker guard" });
        expect(Gateway.request.mock.calls.map(([method]) => method)).toEqual(["session.create", "session.close"]);
        expect(() => resolveSwarmWorker(Context, sessionId)).toThrow(/authority has ended/);
    });

    it("can cancel a blocked connection before dispatch", async () => {
        const controller = new AbortController();
        Gateway.connect.mockImplementationOnce(() => new Promise(() => {}));
        const outcome = runSwarmHermesWorker({
            connection: Connection,
            context: Context,
            prompt: "Run",
            signal: controller.signal,
        });
        controller.abort(new Error("Stop"));
        await expect(outcome).rejects.toMatchObject({ dispatched: false, message: "Stop" });
        expect(Gateway.request).not.toHaveBeenCalled();
        expect(Gateway.close).toHaveBeenCalledOnce();
    });

    it("revokes new effects after completion and harvests evidence only after draining", async () => {
        const signal = new AbortController().signal;
        let resolveCapture: (result: unknown) => void;
        const capture = new Promise((resolve) => {
            resolveCapture = resolve;
        });
        const result = runSwarmHermesWorker({
            connection: Connection,
            context: Context,
            prompt: "Run",
            signal,
            onSession: (id) => {
                const worker = resolveSwarmWorker(Context, id);
                void worker.trackOutcome("widget_snapshot", {}, false, capture);
            },
        });
        await vi.waitFor(() => expect(Gateway.onAny).toHaveBeenCalledOnce());
        Gateway.onAny.mock.calls[0][0]({
            session_id: sessionId,
            type: "message.start",
            payload: {},
        } as GatewayEvent);
        Gateway.onAny.mock.calls[0][0]({
            session_id: sessionId,
            type: "message.complete",
            payload: { status: "complete", text: "Observed" },
        } as GatewayEvent);
        await vi.waitFor(() => expect(Gateway.close).toHaveBeenCalledOnce());
        expect(() => resolveSwarmWorker(Context, sessionId)).toThrow(/authority has ended/);
        resolveCapture({ content: [{ type: "image", data: "screenshot" }] });
        await expect(result).resolves.toMatchObject({
            text: "Observed",
            observed: true,
            evidence: ["widget_snapshot observed target (run:1)"],
            uncertain: false,
        });
    });

    it("marks a cancellation after submission as dispatched and interrupts the worker", async () => {
        const controller = new AbortController();
        const outcome = runSwarmHermesWorker({
            connection: Connection,
            context: Context,
            prompt: "Run",
            signal: controller.signal,
        });
        await vi.waitFor(() => expect(Gateway.request.mock.calls.map(([method]) => method)).toContain("prompt.submit"));
        controller.abort(new Error("Stop"));
        await expect(outcome).rejects.toMatchObject({ dispatched: true, message: "Stop", settledCancellation: true });
        expect(Gateway.request.mock.calls.map(([method]) => method)).toEqual([
            "session.create",
            "prompt.submit",
            "session.interrupt",
            "session.close",
        ]);
    });
});
