// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwarmAttemptResult, SwarmPlan, SwarmTarget } from "../frontend/types/swarm";
import { SwarmCoordinator, type SwarmExecutionContext } from "./swarm-coordinator";

function target(id: string, ...resourceKeys: string[]): SwarmTarget {
    return { id, kind: "browser", label: id, generation: 1, resourceKeys: resourceKeys.length ? resourceKeys : [id] };
}

function node(id: string, targetId: string, ...dependencies: string[]): SwarmPlan["nodes"][number] {
    return { id, targetId, dependencies, goal: "Perform the requested action", successCriteria: "Observe the result" };
}

function plan(...nodes: SwarmPlan["nodes"]): SwarmPlan {
    return { version: 1, nodes };
}

const Verified: SwarmAttemptResult = {
    status: "succeeded",
    summary: "Observed the expected result.",
    evidence: ["obs-1"],
};

describe("SwarmCoordinator", () => {
    let directory: string;
    let journalPath: string;
    let coordinators: SwarmCoordinator[];

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-swarm-"));
        journalPath = path.join(directory, "swarm.json");
        coordinators = [];
    });

    afterEach(() => {
        for (const coordinator of coordinators) coordinator.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function fixture(hasUnsettledAttempt?: (attemptId: string) => boolean) {
        const attempts: {
            context: SwarmExecutionContext;
            resolve: (value: SwarmAttemptResult) => void;
            reject: (error: Error) => void;
        }[] = [];
        const execute = vi.fn(
            (context: SwarmExecutionContext) =>
                new Promise<SwarmAttemptResult>((resolve, reject) => {
                    attempts.push({ context, resolve, reject });
                })
        );
        const onError = vi.fn();
        const coordinator = new SwarmCoordinator({ journalPath, execute, onError, hasUnsettledAttempt });
        coordinators.push(coordinator);
        return { coordinator, execute, attempts, onError };
    }

    it("enforces per-run and global capacity while dispatching independent resources", async () => {
        const { coordinator, attempts, onError } = fixture();
        const targets = ["a", "b", "c", "d", "e", "f"].map((id) => target(id));
        const first = coordinator.create({ plan: plan(node("a", "a"), node("b", "b"), node("c", "c")), targets });
        const second = coordinator.create({
            plan: plan(node("d", "d"), node("e", "e"), node("f", "f")),
            targets,
            concurrency: 4,
        });
        coordinator.start(first.id);
        coordinator.start(second.id);
        await vi.waitFor(() => expect(attempts.map(({ context }) => context.node.id)).toEqual(["a", "b", "d", "e"]));
        expect(onError).not.toHaveBeenCalled();

        const persisted = JSON.parse(fs.readFileSync(journalPath, "utf8")).runs;
        expect(persisted[0].nodes[0]).toMatchObject({ status: "running", attemptId: attempts[0].context.attemptId });
        attempts[0].resolve(Verified);
        await vi.waitFor(() =>
            expect(attempts.map(({ context }) => context.node.id)).toEqual(["a", "b", "d", "e", "c"])
        );
        expect(coordinator.status(first.id).nodes[0]).toMatchObject(Verified);
    });

    it("reserves overlapping physical keys across different target IDs and runs", async () => {
        const { coordinator, attempts } = fixture();
        const first = coordinator.create({
            plan: plan(node("first", "a")),
            targets: [target("a", "page-a", "partition")],
        });
        const second = coordinator.create({
            plan: plan(node("second", "b"), node("third", "c")),
            targets: [target("b", "page-b", "partition"), target("c", "page-c")],
        });
        coordinator.start(first.id);
        coordinator.start(second.id);
        await vi.waitFor(() => expect(attempts.map(({ context }) => context.node.id)).toEqual(["first", "third"]));
        expect(coordinator.status(second.id).nodes[0].status).toBe("pending");

        attempts[0].resolve(Verified);
        await vi.waitFor(() => expect(attempts[2].context.node.id).toBe("second"));
    });

    it("releases only verified dependencies and blocks transitive dependents after failure", async () => {
        const { coordinator, attempts } = fixture();
        const run = coordinator.create({
            plan: plan(
                node("grandchild", "a", "child"),
                node("child", "a", "parent"),
                node("parent", "a"),
                node("verified", "b"),
                node("next", "b", "verified")
            ),
            targets: [target("a"), target("b")],
        });
        coordinator.start(run.id);
        await vi.waitFor(() => expect(attempts.map(({ context }) => context.node.id)).toEqual(["parent", "verified"]));
        attempts[0].resolve({ status: "failed", summary: "The postcondition failed.", evidence: ["obs-failed"] });
        attempts[1].resolve(Verified);
        await vi.waitFor(() =>
            expect(attempts.map(({ context }) => context.node.id)).toEqual(["parent", "verified", "next"])
        );
        attempts[2].resolve(Verified);
        await vi.waitFor(() => expect(coordinator.status(run.id).status).toBe("failed"));
        expect(coordinator.status(run.id).nodes.map(({ status }) => status)).toEqual([
            "blocked",
            "blocked",
            "failed",
            "succeeded",
            "succeeded",
        ]);
    });

    it("holds the lease during cancellation and reassigns it after confirmed settlement", async () => {
        const { coordinator, attempts } = fixture();
        const first = coordinator.create({
            plan: plan(node("first", "a"), node("never", "a", "first")),
            targets: [target("a")],
        });
        const second = coordinator.create({ plan: plan(node("second", "a")), targets: [target("a")] });
        coordinator.start(first.id);
        coordinator.start(second.id);
        await vi.waitFor(() => expect(attempts).toHaveLength(1));

        expect(coordinator.cancel(first.id).status).toBe("cancelling");
        expect(attempts[0].context.signal.aborted).toBe(true);
        await Promise.resolve();
        expect(coordinator.status(second.id).nodes[0].status).toBe("pending");
        expect(coordinator.status(first.id).nodes[1].status).toBe("cancelled");
        attempts[0].resolve({ status: "cancelled", summary: "The worker confirmed it stopped.", evidence: [] });
        await vi.waitFor(() => expect(attempts.map(({ context }) => context.node.id)).toEqual(["first", "second"]));
        expect(coordinator.status(first.id).status).toBe("cancelled");
    });

    it.each(["rejection", "missing evidence"])(
        "quarantines effects with an uncertain outcome (%s)",
        async (outcome) => {
            const { coordinator, attempts } = fixture();
            const run = coordinator.create({
                plan: plan(node("first", "a"), node("dependent", "b", "first"), node("overlap", "a")),
                targets: [target("a"), target("b")],
            });
            coordinator.start(run.id);
            await vi.waitFor(() => expect(attempts).toHaveLength(1));
            if (outcome === "rejection") attempts[0].reject(new Error("Timed out"));
            else attempts[0].resolve({ ...Verified, evidence: [] });
            await vi.waitFor(() => expect(coordinator.status(run.id).status).toBe("uncertain"));
            expect(coordinator.status(run.id).nodes.map(({ status }) => status)).toEqual([
                "uncertain",
                "blocked",
                "blocked",
            ]);
            expect(attempts).toHaveLength(1);
        }
    );

    it("recovers interrupted attempts and quarantines overlapping resources without replay", async () => {
        const first = fixture();
        const run = first.coordinator.create({
            plan: plan(node("first", "a"), node("dependent", "a", "first")),
            targets: [target("a", "shared")],
        });
        first.coordinator.start(run.id);
        await vi.waitFor(() => expect(first.attempts).toHaveLength(1));
        first.coordinator.close();

        const second = fixture();
        expect(second.coordinator.status(run.id)).toMatchObject({
            status: "uncertain",
            nodes: [{ status: "uncertain", attemptId: first.attempts[0].context.attemptId }, { status: "blocked" }],
        });
        const future = second.coordinator.create({
            plan: plan(node("overlap", "b")),
            targets: [target("b", "shared")],
        });
        second.coordinator.start(future.id);
        await vi.waitFor(() => expect(second.coordinator.status(future.id).status).toBe("blocked"));
        expect(second.execute).not.toHaveBeenCalled();
    });

    it("does not invoke an adapter when its admission cannot be written", async () => {
        const { coordinator, execute, onError } = fixture();
        const run = coordinator.create({ plan: plan(node("first", "a")), targets: [target("a")] });
        coordinator.start(run.id);
        const write = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
            throw new Error("Journal unavailable");
        });
        try {
            await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error("Journal unavailable")));
            expect(execute).not.toHaveBeenCalled();
            expect(coordinator.status(run.id).nodes[0]).toMatchObject({ status: "pending" });
            expect(() => coordinator.start(run.id)).toThrow(/closed/i);
        } finally {
            write.mockRestore();
        }
    });

    it("persists an owning workspace's acknowledgement without replaying an uncertain run", async () => {
        let settling = true;
        const first = fixture(() => settling);
        const scope = { workspaceId: "owner", tabId: "tab" };
        const run = first.coordinator.create({
            workspaceId: scope.workspaceId,
            plan: plan(node("first", "a")),
            targets: [{ ...target("a", "shared"), tabId: scope.tabId }],
        });
        first.coordinator.start(run.id);
        await vi.waitFor(() => expect(first.attempts).toHaveLength(1));
        first.attempts[0].reject(new Error("Disconnected"));
        await vi.waitFor(() => expect(first.coordinator.status(run.id).status).toBe("uncertain"));
        const { attemptId } = first.attempts[0].context;
        expect(first.coordinator.listRecoveries("different", scope.tabId)).toEqual([]);
        expect(() => first.coordinator.acknowledge("different", scope.tabId, run.id, attemptId)).toThrow(/workspace/);
        expect(() => first.coordinator.acknowledge(scope.workspaceId, scope.tabId, run.id, attemptId)).toThrow(/settling/);
        settling = false;
        first.coordinator.acknowledge(scope.workspaceId, scope.tabId, run.id, attemptId);
        expect(first.coordinator.status(run.id).nodes[0]).toMatchObject({
            status: "uncertain",
            reconciledAt: expect.any(Number),
        });
        first.coordinator.close();

        const restored = fixture();
        expect(restored.coordinator.listRecoveries(scope.workspaceId, scope.tabId)).toEqual([]);
        expect(restored.execute).not.toHaveBeenCalled();
        const next = restored.coordinator.create({
            plan: plan(node("fresh", "a")),
            targets: [target("a", "shared")],
        });
        restored.coordinator.start(next.id);
        await vi.waitFor(() => expect(restored.attempts).toHaveLength(1));
        expect(restored.attempts[0].context.run.id).toBe(next.id);
    });

    it("does not release a dependent when its prerequisite result cannot be written", async () => {
        const first = fixture();
        const run = first.coordinator.create({
            plan: plan(node("first", "a"), node("dependent", "b", "first")),
            targets: [target("a"), target("b")],
        });
        first.coordinator.start(run.id);
        await vi.waitFor(() => expect(first.attempts).toHaveLength(1));
        const write = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
            throw new Error("Journal unavailable");
        });
        try {
            first.attempts[0].resolve(Verified);
            await vi.waitFor(() => expect(first.onError).toHaveBeenCalledWith(new Error("Journal unavailable")));
            expect(first.attempts).toHaveLength(1);
        } finally {
            write.mockRestore();
        }
        const second = fixture();
        expect(second.coordinator.status(run.id).nodes.map(({ status }) => status)).toEqual(["uncertain", "blocked"]);
    });

    it("checks plan revision and preserves running and completed attempt IDs", async () => {
        const { coordinator, attempts } = fixture();
        const first = node("first", "a");
        const second = node("second", "a", "first");
        const run = coordinator.create({ plan: plan(first, second), targets: [target("a")] });
        coordinator.start(run.id);
        await vi.waitFor(() => expect(attempts).toHaveLength(1));

        expect(() => coordinator.revise(run.id, 0, plan(first, second))).toThrow(/revision conflict/i);
        expect(() => coordinator.revise(run.id, 1, plan({ ...first, goal: "Changed" }, second))).toThrow(
            /cannot change/i
        );
        const revised = coordinator.revise(run.id, 1, plan(first, { ...second, goal: "Revised" }));
        expect(revised.revision).toBe(2);
        expect(revised.nodes[0].attemptId).toBe(attempts[0].context.attemptId);

        attempts[0].resolve(Verified);
        await vi.waitFor(() => expect(attempts[1].context.node.goal).toBe("Revised"));
        expect(() => coordinator.revise(run.id, 2, plan(node("replacement", "a"), node("second", "a")))).toThrow(
            /cannot change/i
        );
        expect(coordinator.status(run.id).nodes[0]).toMatchObject({
            status: "succeeded",
            attemptId: revised.nodes[0].attemptId,
        });
    });

    it("rejects cycles and unassigned targets before creating a record", () => {
        const { coordinator } = fixture();
        expect(() =>
            coordinator.create({ plan: plan(node("a", "a", "b"), node("b", "a", "a")), targets: [target("a")] })
        ).toThrow(/cycle/i);
        expect(() => coordinator.create({ plan: plan(node("a", "b")), targets: [target("a")] })).toThrow(
            /assigned targets/i
        );
        expect(coordinator.list()).toEqual([]);
        expect(fs.existsSync(journalPath)).toBe(false);
    });
});
