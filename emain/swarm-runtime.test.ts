// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import type { SwarmRunSnapshot, SwarmTarget } from "../frontend/types/swarm";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { makeSwarmRuntime } from "./swarm-runtime";

const mocks = vi.hoisted(() => ({
    dataDir: vi.fn(),
    ensure: vi.fn(),
    publish: vi.fn(),
    worker: vi.fn<typeof import("./swarm-hermes-worker").runSwarmHermesWorker>(),
}));

vi.mock("./emain-platform", () => ({ getWaveDataDir: mocks.dataDir }));
vi.mock("./emain-pet", () => ({ notifyDesktopPetSurfaceActivity: mocks.publish }));
vi.mock("./hermes-runtime", () => ({ HermesRuntime: { ensure: mocks.ensure } }));
vi.mock("./swarm-hermes-worker", () => ({ runSwarmHermesWorker: mocks.worker }));

test("runtime connects the MACU planner and target worker to managed Hermes and persists the outcome", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-swarm-runtime-"));
    const connection = { wsUrl: "ws://localhost:1234" };
    const parent: HermesSurfaceContext = {
        agentRuntime: "hermes",
        workspaceId: "workspace",
        tabId: "tab",
        toolSessionId: "parent",
        nativeCallerId: "managed-hermes",
    };
    const target: SwarmTarget = {
        id: "browser:one",
        kind: "browser",
        label: "Browser",
        blockId: "one",
        tabId: "tab",
        generation: 0,
        resourceKeys: ["block:one", "tab-input:tab"],
    };
    mocks.dataDir.mockReturnValue(directory);
    mocks.ensure.mockResolvedValue(connection);
    mocks.worker.mockImplementation(async ({ context, onEvent, onSession }) => {
        if (context.swarmPlanning) {
            return {
                text: JSON.stringify({
                    task_analysis: "Inspect the browser.",
                    subtasks: [
                        {
                            id: "inspect",
                            agent_type: "cua",
                            description: "Read the total.",
                            dependencies: [],
                            instruction: "Read the total.",
                            outputs: ["Displayed total"],
                            target_id: target.id,
                            success_criteria: "Read the displayed total.",
                        },
                    ],
                    aggregation: {
                        id: "final_aggregation",
                        agent_type: "manager",
                        description: "Collect the result.",
                        dependencies: ["inspect"],
                        instruction: "Collect the result.",
                    },
                }),
                sessionId: "planner",
                observed: false,
                uncertain: false,
                evidence: [],
            };
        }
        onSession?.("worker");
        onEvent?.({
            type: "tool.start",
            session_id: "worker",
            payload: { name: "widget_snapshot", preview: "Browser" },
        });
        return {
            text: JSON.stringify({ status: "succeeded", summary: "Read the total.", evidence: ["Total is 42."] }),
            sessionId: "worker",
            observed: true,
            uncertain: false,
            evidence: ["widget_snapshot observed browser:one"],
        };
    });

    const runtime = makeSwarmRuntime(async () => [target]);
    try {
        const args = { goal: "Inspect the browser.", targetIds: [target.id] };
        const run = (await runtime.command("swarm_start", args, parent)) as SwarmRunSnapshot;
        await vi.waitFor(() => expect(runtime.coordinator.status(run.id).status).toBe("succeeded"));
        expect(mocks.ensure).toHaveBeenCalledTimes(2);
        expect(mocks.worker.mock.calls[0][0]).toMatchObject({ connection, context: { swarmPlanning: true } });
        expect(mocks.worker.mock.calls[1][0]).toMatchObject({
            connection,
            context: { nativeCallerId: parent.nativeCallerId, swarmRunId: run.id, swarmTarget: target },
        });
        expect(mocks.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                swarm: expect.objectContaining({
                    childSessionId: "worker",
                    toolName: "widget_snapshot",
                    toolPreview: "Browser",
                }),
            })
        );

        runtime.close();
        const restored = makeSwarmRuntime(async () => [target]);
        try {
            await expect(restored.command("swarm_status", { runId: run.id }, parent)).resolves.toMatchObject({
                status: "succeeded",
                nodes: [{ status: "succeeded", evidence: ["widget_snapshot observed browser:one", "Total is 42."] }],
            });
            expect(mocks.worker).toHaveBeenCalledTimes(2);
        } finally {
            restored.close();
        }
    } finally {
        runtime.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
