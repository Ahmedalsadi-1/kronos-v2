// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActivityEvent } from "../frontend/types/agent-activity";
import type { SwarmRunSnapshot, SwarmTarget } from "../frontend/types/swarm";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { SwarmService, type SwarmServiceDependencies, type SwarmWorkerResult } from "./swarm-service";

const Parent: HermesSurfaceContext = { workspaceId: "workspace", tabId: "tab", toolSessionId: "parent-chat" };
const Browser: SwarmTarget = {
    id: "browser:inventory",
    kind: "browser",
    label: "Inventory",
    blockId: "inventory",
    tabId: "tab",
    resourceKeys: ["browser-session:test", "tab-input:tab"],
    generation: 0,
};
const Device: SwarmTarget = {
    id: "device:simulator",
    kind: "device",
    label: "Simulator",
    deviceId: "simulator",
    resourceKeys: ["device:simulator"],
    generation: 1,
};
const Verified: SwarmWorkerResult = {
    text: JSON.stringify({
        status: "succeeded",
        summary: "Verified the expected result.",
        evidence: ["Result is visible."],
    }),
    sessionId: "worker",
    evidence: ["Target inspection completed."],
    observed: true,
};
type WorkerInput = Parameters<SwarmServiceDependencies["worker"]>[0];

function subtask(id: string, target: SwarmTarget, dependencies: string[] = []) {
    return {
        id,
        agent_type: "cua",
        description: `Inspect ${target.label}.`,
        instruction: `Read the inventory total on ${target.label}.`,
        outputs: ["Observed inventory total."],
        target_id: target.id,
        dependencies,
        success_criteria: "The inventory total is visible.",
    };
}

function graph(subtasks: ReturnType<typeof subtask>[]) {
    return {
        task_analysis: "Read inventory totals on the selected surfaces.",
        subtasks,
        aggregation: {
            id: "final_aggregation",
            agent_type: "manager",
            description: "Combine the observed totals.",
            instruction: "Report the results.",
            dependencies: subtasks.map(({ id }) => id),
        },
    };
}

describe("SwarmService", () => {
    let directory: string;
    let service: SwarmService;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-swarm-service-"));
    });

    afterEach(() => {
        service?.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function fixture(subtasks = [subtask("browser", Browser), subtask("device", Device)]) {
        const planned = vi.fn(async (_prompt: string): Promise<unknown> => graph(subtasks));
        const inventory = vi.fn(async (_context: HermesSurfaceContext) => [Browser, Device]);
        const publish = vi.fn((_event: AgentActivityEvent) => {});
        const attempts: { input: WorkerInput; resolve: (result: SwarmWorkerResult) => void }[] = [];
        const worker = vi.fn(async (input: WorkerInput) => {
            if (input.context.swarmPlanning) {
                return { ...Verified, text: JSON.stringify(await planned(input.prompt)) };
            }
            return new Promise<SwarmWorkerResult>((resolve) => {
                attempts.push({ input, resolve });
                input.onSession?.(`worker:${input.context.swarmTarget.id}`);
            });
        });
        service = new SwarmService({ journalPath: path.join(directory, "swarm.json"), inventory, worker, publish });
        const status = async (runId: string) =>
            (await service.command("swarm_status", { runId }, Parent)) as SwarmRunSnapshot;
        const start = async (concurrency = 2) =>
            (await service.command(
                "swarm_start",
                { goal: "Read inventory totals.", targetIds: [Browser.id, Device.id], concurrency },
                Parent
            )) as SwarmRunSnapshot;
        return { attempts, inventory, planned, publish, status, start, worker };
    }

    it("plans through MACU and dispatches independent selected targets concurrently", async () => {
        const { attempts, planned, publish, status, start, worker } = fixture();
        await expect(service.command("swarm_targets", {}, Parent)).resolves.toEqual({
            targets: [Browser, Device],
            deviceAndVmStatus: "Labs",
        });
        const run = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(2));
        expect(planned).toHaveBeenCalledWith(expect.stringContaining("final_aggregation"));
        expect(worker.mock.calls[0][0].context).toMatchObject({ swarmPlanning: true });
        expect(worker.mock.calls[0][0].context.swarmTarget).toBeUndefined();
        expect(attempts.map(({ input }) => input.context.swarmTarget.id)).toEqual([Browser.id, Device.id]);
        expect(attempts.map(({ input }) => input.context.swarmAttemptId).every(Boolean)).toBe(true);
        expect((await status(run.id)).nodes.map(({ status }) => status)).toEqual(["running", "running"]);
        attempts[0].input.onTool?.("widget_snapshot", "Inventory inspected.");
        expect(publish).toHaveBeenCalledWith(
            expect.objectContaining({
                runid: `swarm:${run.id}`,
                phase: "running",
                blockid: Browser.blockId,
                swarm: expect.objectContaining({
                    nodeId: "browser",
                    parentSessionId: Parent.toolSessionId,
                    childSessionId: `worker:${Browser.id}`,
                    toolName: "widget_snapshot",
                }),
            })
        );
        for (const { resolve } of attempts) resolve(Verified);
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("succeeded"));
    });

    it("isolates chat ownership and cancels an admitted worker without dispatching its pending dependent", async () => {
        const { attempts, status, start } = fixture([
            subtask("browser", Browser),
            subtask("device", Device, ["browser"]),
        ]);
        const run = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(1));
        const foreign = { ...Parent, toolSessionId: "different-chat" };
        await expect(service.command("swarm_status", { runId: run.id }, foreign)).rejects.toThrow("another chat");
        await expect(service.command("swarm_status", {}, foreign)).resolves.toEqual([]);
        await expect(service.command("swarm_cancel", { runId: run.id }, foreign)).rejects.toThrow("another chat");
        await expect(service.command("swarm_status", {}, attempts[0].input.context)).rejects.toThrow(
            "parent KronOS chat"
        );

        await expect(service.command("swarm_cancel", { runId: run.id }, Parent)).resolves.toMatchObject({
            status: "cancelling",
        });
        expect(attempts[0].input.signal.aborted).toBe(true);
        expect((await status(run.id)).nodes[1].status).toBe("cancelled");
        attempts[0].resolve({
            ...Verified,
            text: JSON.stringify({ status: "blocked", summary: "Worker stopped.", evidence: [] }),
            observed: false,
            evidence: [],
        });
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("cancelled"));
        expect(attempts).toHaveLength(1);
    });

    it.each([
        ["without host evidence", { ...Verified, observed: false, evidence: [] }],
        ["after an unsettled tool effect", { ...Verified, uncertain: true }],
    ])("marks a success claim %s uncertain and blocks its dependent", async (_case, outcome) => {
        const { attempts, status, start } = fixture([
            subtask("browser", Browser),
            subtask("device", Device, ["browser"]),
        ]);
        const run = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(1));
        attempts[0].resolve(outcome);

        await vi.waitFor(async () => expect((await status(run.id)).nodes[1].status).toBe("blocked"));
        expect((await status(run.id)).nodes[0].status).toBe("uncertain");
        expect(attempts).toHaveLength(1);
    });

    it("checks target generation again before dispatch", async () => {
        const { attempts, inventory, status, start } = fixture([subtask("device", Device)]);
        inventory.mockResolvedValueOnce([Browser, Device]).mockResolvedValue([Browser, { ...Device, generation: 2 }]);

        const run = await start();
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("blocked"));
        expect(attempts).toHaveLength(0);
        expect((await status(run.id)).nodes[0].summary).toContain("control changed");
    });

    it("blocks an unavailable target without dispatching or quarantining it", async () => {
        const { attempts, inventory, status, start } = fixture([subtask("device", Device)]);
        inventory.mockResolvedValueOnce([Browser, Device]).mockRejectedValueOnce(new Error("Device offline"));
        const run = await start();
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("blocked"));
        expect(attempts).toHaveLength(0);
        const next = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(1));
        attempts[0].resolve(Verified);
        await vi.waitFor(async () => expect((await status(next.id)).status).toBe("succeeded"));
    });

    it("cancels while target readiness is loading without submitting a worker prompt", async () => {
        const { attempts, inventory, status, start } = fixture([subtask("device", Device)]);
        let ready: (targets: SwarmTarget[]) => void;
        inventory.mockResolvedValueOnce([Browser, Device]).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    ready = resolve;
                })
        );
        const run = await start();
        await vi.waitFor(() => expect(ready).toBeDefined());
        await service.command("swarm_cancel", { runId: run.id }, Parent);
        ready([Browser, Device]);
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("cancelled"));
        expect(attempts).toHaveLength(0);
    });

    it("retains ownership when the same chat reconnects with a new live session", async () => {
        const { attempts, publish } = fixture([subtask("browser", Browser)]);
        const parent = { ...Parent, chatId: "stored-chat" };
        const run = (await service.command(
            "swarm_start",
            { goal: "Read inventory totals.", targetIds: [Browser.id] },
            parent
        )) as SwarmRunSnapshot;
        await expect(
            service.command(
                "swarm_status",
                { runId: run.id },
                {
                    ...parent,
                    toolSessionId: "new-live-session",
                }
            )
        ).resolves.toMatchObject({ id: run.id });
        await expect(
            service.command(
                "swarm_status",
                { runId: run.id },
                {
                    ...parent,
                    chatId: "other-stored-chat",
                }
            )
        ).rejects.toThrow("another chat");
        await vi.waitFor(() => expect(attempts).toHaveLength(1));
        expect(publish).toHaveBeenCalledWith(
            expect.objectContaining({
                swarm: expect.objectContaining({ parentSessionId: "stored-chat" }),
            })
        );
        attempts[0].resolve(Verified);
    });

    it("does not repeat unchanged worker activity when its sibling settles", async () => {
        const { attempts, publish, status, start } = fixture();
        const run = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(2));
        const deviceEvents = () => publish.mock.calls.filter(([event]) => event.swarm.nodeId === "device");
        const count = deviceEvents().length;
        attempts[0].resolve(Verified);
        await vi.waitFor(async () => expect((await status(run.id)).nodes[0].status).toBe("succeeded"));
        expect(deviceEvents()).toHaveLength(count);
        expect(deviceEvents().every(([event]) => event.ownertabid === Parent.tabId)).toBe(true);
        attempts[1].resolve(Verified);
    });

    it("applies a MACU replan to a pending worker under the expected revision", async () => {
        const { attempts, planned, status, start } = fixture([
            subtask("browser", Browser),
            subtask("device", Device, ["browser"]),
        ]);
        const run = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(1));
        planned.mockResolvedValueOnce({
            action: "update",
            reasoning: "Read the displayed available inventory.",
            modify: { device: { instruction: "Read only the available inventory total." } },
        });
        const args = { runId: run.id, expectedRevision: run.revision, reason: "Read the available inventory." };
        await expect(service.command("swarm_replan", args, Parent)).resolves.toMatchObject({
            revision: run.revision + 1,
        });
        expect((await status(run.id)).plan.nodes[0]).toEqual(run.plan.nodes[0]);
        await expect(service.command("swarm_replan", args, Parent)).rejects.toThrow("revision changed");
        expect(planned).toHaveBeenCalledTimes(2);

        attempts[0].resolve(Verified);
        await vi.waitFor(() => expect(attempts).toHaveLength(2));
        expect(attempts[1].input.prompt).toContain("Read only the available inventory total.");
        expect(attempts[1].input.prompt).toContain("Verified the expected result.");
        attempts[1].resolve(Verified);
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("succeeded"));
    });

    it("rejects a replan if its pending worker starts while the model is planning", async () => {
        const { attempts, planned, status, start } = fixture([
            subtask("browser", Browser),
            subtask("device", Device, ["browser"]),
        ]);
        const run = await start();
        await vi.waitFor(() => expect(attempts).toHaveLength(1));
        let decide: (value: unknown) => void;
        planned.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    decide = resolve;
                })
        );
        const result = service.command(
            "swarm_replan",
            { runId: run.id, expectedRevision: run.revision, reason: "Refine the device work." },
            Parent
        );
        const rejection = expect(result).rejects.toThrow(/revision conflict|started or completed/i);
        await vi.waitFor(() => expect(decide).toBeDefined());

        attempts[0].resolve(Verified);
        await vi.waitFor(() => expect(attempts).toHaveLength(2));
        decide({
            action: "update",
            reasoning: "Read a different count.",
            modify: { device: { instruction: "Read the available inventory." } },
        });

        await rejection;
        expect((await status(run.id)).plan).toEqual(run.plan);
        attempts[1].resolve(Verified);
        await vi.waitFor(async () => expect((await status(run.id)).status).toBe("succeeded"));
    });
});
