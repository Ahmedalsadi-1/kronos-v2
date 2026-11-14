// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { hasUnsettledSwarmAttempt, registerSwarmWorker, resolveSwarmWorker, revokeSwarmCaller } from "./swarm-worker-registry";

const Screenshot = { content: [{ type: "image", data: "screenshot", mimeType: "image/png" }] };

function worker() {
    const context: HermesSurfaceContext = {
        workspaceId: "workspace",
        tabId: "tab",
        nativeCallerId: "caller",
        swarmRunId: "run",
        swarmAttemptId: "attempt",
        swarmTarget: { id: "browser", label: "Browser", kind: "browser", generation: 1, resourceKeys: ["browser"] },
    };
    const session = randomUUID();
    const task = randomUUID();
    const grant = registerSwarmWorker([session, task], context);
    const tool = resolveSwarmWorker(context, session, task);
    return { context, session, task, grant, tool };
}

describe("swarm worker tool settlement", () => {
    it("admits new workers beyond the old retired ID limit and fences the retired identities", () => {
        const caller = "test-caller-archive";
        const context = { workspaceId: "workspace", tabId: "tab", swarmRunId: "run", nativeCallerId: caller };
        const first = `${caller}-first`;
        registerSwarmWorker([first], context).revoke();
        for (let i = 0; i < 2048; i++) {
            registerSwarmWorker([`${caller}-session-${i}`, `${caller}-task-${i}`], context).revoke();
        }
        const live = `${caller}-live`;
        const grant = registerSwarmWorker([live], context);
        const worker = resolveSwarmWorker(context, live);
        expect(() => resolveSwarmWorker(context, first)).toThrow(/authority has ended/);
        revokeSwarmCaller(caller);
        expect(worker.signal.aborted).toBe(true);
        grant.revoke();
        expect(resolveSwarmWorker(context, first)).toBeUndefined();
        expect(resolveSwarmWorker(context, live)).toBeUndefined();
    });

    it("does not treat nested MCP failures as observations or retain a stale observation", async () => {
        const { grant, tool } = worker();
        try {
            await tool.trackOutcome("widget_snapshot", {}, false, Promise.resolve(Screenshot));
            expect(grant.observed()).toBe(true);
            expect(grant.evidence()).toHaveLength(1);

            const failure = { content: [{ type: "text", text: JSON.stringify({ success: false }) }] };
            expect(await tool.trackOutcome("widget_snapshot", {}, false, Promise.resolve(failure))).toEqual(failure);
            expect(grant.observed()).toBe(false);
            expect(grant.evidence()).toEqual([]);
            expect(grant.uncertain()).toBe(false);
        } finally {
            grant.revoke();
        }
    });

    it("requires an observation after a mutation settles", async () => {
        const { grant, tool } = worker();
        try {
            await tool.trackOutcome("widget_snapshot", {}, false, Promise.resolve(Screenshot));
            let finishMutation: (value: unknown) => void;
            const mutation = tool.trackOutcome(
                "widget_click",
                {},
                true,
                new Promise((resolve) => {
                    finishMutation = resolve;
                })
            );
            expect(grant.observed()).toBe(false);
            await tool.trackOutcome("widget_snapshot", {}, false, Promise.resolve(Screenshot));
            finishMutation({ success: true });
            await mutation;
            expect(grant.observed()).toBe(false);

            await tool.trackOutcome("widget_snapshot", {}, false, Promise.resolve(Screenshot));
            expect(grant.observed()).toBe(true);
            expect(grant.evidence()).toEqual(["widget_snapshot observed browser (attempt:4)"]);
        } finally {
            grant.revoke();
        }
    });

    it.each([
        { isError: true, _meta: { failure: { outcome: "uncertain" } } },
        { error: "Transport timed out", failure: { uncertain: true } },
        { isError: true, content: [{ type: "text", text: '{"outcome":"uncertain"}' }] },
    ])("latches uncertainty when a mutating tool loses settlement", async (outcome) => {
        const { grant, tool } = worker();
        try {
            await tool.trackOutcome("widget_click", {}, true, Promise.resolve(outcome));
            await tool.trackOutcome("widget_snapshot", {}, false, Promise.resolve(Screenshot));
            expect(grant.uncertain()).toBe(true);
            expect(grant.observed()).toBe(false);
        } finally {
            grant.revoke();
        }
    });

    it("keeps tool admission exclusive until raw settlement and revokes every registered alias", async () => {
        const { context, session, task, grant, tool } = worker();
        try {
            let rejectEffect: (error: Error) => void;
            const effect = new Promise((_, reject) => {
                rejectEffect = reject;
            });
            await tool.runExclusive(async () => {
                tool.trackSettlement(effect, true);
                await expect(tool.runExclusive(vi.fn())).rejects.toThrow(/still settling/);
            });
            const next = vi.fn(async () => true);
            await expect(tool.runExclusive(next)).rejects.toThrow(/still settling/);
            expect(next).not.toHaveBeenCalled();
            grant.revoke();
            expect(hasUnsettledSwarmAttempt(context.swarmAttemptId)).toBe(true);
            await expect(tool.runExclusive(next)).rejects.toThrow();
            expect(() => resolveSwarmWorker(context, session)).toThrow(/authority has ended/);
            expect(() => resolveSwarmWorker(context, undefined, task)).toThrow(/authority has ended/);
            expect(() => registerSwarmWorker([session], context)).toThrow(/identity is unavailable/);
            await expect(grant.drain(2)).rejects.toThrow(/uncertain/);
            rejectEffect(new Error("Transport disconnected"));
            await grant.drain();
            expect(hasUnsettledSwarmAttempt(context.swarmAttemptId)).toBe(false);
            expect(grant.uncertain()).toBe(true);
        } finally {
            grant.revoke();
        }
    });
});

it("classifies final widget and guest observations independently of broad tool annotations", async () => {
    const { swarmToolMutates } = await import("./swarm-worker-registry");
    expect(swarmToolMutates("widget_snapshot", {}, undefined)).toBe(false);
    expect(swarmToolMutates("sandbox_vm_desktop", { action: "screenshot" }, undefined)).toBe(false);
    expect(swarmToolMutates("sandbox_vm_browser", { action: "state" }, undefined)).toBe(false);
    expect(swarmToolMutates("sandbox_vm_browser", { action: "evaluate" }, undefined)).toBe(true);
    expect(swarmToolMutates("sandbox_vm_files", { action: "write" }, undefined)).toBe(true);
});
