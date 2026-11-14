// SPDX-License-Identifier: Apache-2.0
// Graph fixtures adapted from MACU tests/test_run_macu_args_and_graph.py. See agents/macu/SOURCE.md and LICENSE.

import { describe, expect, it, vi } from "vitest";
import { planMacuSwarm, reviseMacuSwarm } from "./macu-planner";

const Request = {
    goal: "Read the inventory and copy the result into a note.",
    targets: [
        { id: "tab-a", kind: "browser", label: "Inventory" },
        { id: "tab-b", kind: "editor", label: "Notes" },
    ],
};

function worker(id: string, dependencies: string[], targetId = "tab-a") {
    return {
        id,
        agent_type: "cua",
        description: `Subtask ${id}`,
        dependencies,
        instruction: `Perform subtask ${id}`,
        outputs: [`Result ${id}`],
        input_files: [],
        target_id: targetId,
        success_criteria: `Verify result ${id}`,
    };
}

function graph(subtasks = [worker("b", ["a"], "tab-b"), worker("a", [])]) {
    return {
        task_analysis: "Read the source before writing the note.",
        subtasks,
        aggregation: {
            id: "final_aggregation",
            agent_type: "manager",
            description: "Summarize the changes.",
            dependencies: ["b"],
            instruction: "Report the copied inventory.",
        },
    };
}

describe("MACU planner", () => {
    it("projects the sourced chain in topological order and keeps aggregation out of workers", async () => {
        const complete = vi.fn(async () => "```json\n" + JSON.stringify(graph()) + "\n```");

        await expect(planMacuSwarm(Request, complete)).resolves.toEqual({
            version: 1,
            nodes: [
                {
                    id: "a",
                    goal: "Perform subtask a",
                    targetId: "tab-a",
                    dependencies: [],
                    successCriteria: "Verify result a",
                },
                {
                    id: "b",
                    goal: "Perform subtask b",
                    targetId: "tab-b",
                    dependencies: ["a"],
                    successCriteria: "Verify result b",
                },
            ],
        });
        expect(complete).toHaveBeenCalledWith(
            expect.stringContaining(JSON.stringify(Request.targets)),
            expect.any(AbortSignal)
        );
    });

    it("feeds cycle and target validation failures back before accepting a corrected plan", async () => {
        const complete = vi
            .fn()
            .mockResolvedValueOnce(JSON.stringify(graph([worker("a", ["b"]), worker("b", ["a"])])))
            .mockResolvedValueOnce(JSON.stringify(graph([worker("a", [], "unapproved"), worker("b", ["a"])])))
            .mockResolvedValueOnce(JSON.stringify(graph()));

        await expect(planMacuSwarm(Request, complete)).resolves.toMatchObject({ version: 1 });
        expect(complete).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining("contains a cycle"),
            expect.any(AbortSignal)
        );
        expect(complete).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining("target_id from the supplied inventory"),
            expect.any(AbortSignal)
        );
    });

    it.each([
        ["an unknown dependency", graph([worker("a", ["unknown"]), worker("b", ["a"])])],
        ["duplicate workers", graph([worker("a", []), worker("a", []), worker("b", ["a"])])],
        ["an aggregation collision", graph([worker("final_aggregation", []), worker("b", [])])],
        ["a disconnected worker", graph([worker("a", []), worker("b", [])])],
        ["a wrong aggregation type", { ...graph(), aggregation: { ...graph().aggregation, agent_type: "cua" } }],
        ["a missing aggregation", { ...graph(), aggregation: undefined }],
        ["too many workers", graph(Array.from({ length: 17 }, (_, i) => worker(`node-${i}`, [])))],
        ["an oversized response", { ...graph(), task_analysis: "x".repeat(32 * 1024) }],
    ])("fails closed after three attempts for %s", async (_name, response) => {
        const complete = vi.fn(async () => JSON.stringify(response));

        await expect(planMacuSwarm(Request, complete)).rejects.toThrow("after 3 attempts");
        expect(complete).toHaveBeenCalledTimes(3);
    });

    it("cancels a completion that does not resolve", async () => {
        const controller = new AbortController();
        const complete = vi.fn((_prompt: string, _signal: AbortSignal) => new Promise<string>(() => {}));
        const planned = planMacuSwarm({ ...Request, signal: controller.signal }, complete);
        const rejected = expect(planned).rejects.toThrow("run cancelled");
        controller.abort(new Error("run cancelled"));

        await rejected;
        expect(complete).toHaveBeenCalledTimes(1);
        expect(complete.mock.calls[0][1].aborted).toBe(true);
    });

    it("applies a single deadline across retries and aborts the in-flight completion", async () => {
        vi.useFakeTimers();
        try {
            const complete = vi.fn(async (_prompt: string, _signal: AbortSignal) => {
                await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
                return "malformed";
            });
            const rejected = expect(planMacuSwarm(Request, complete)).rejects.toThrow("planning timed out");
            await vi.advanceTimersByTimeAsync(45_000);

            await rejected;
            expect(complete).toHaveBeenCalledTimes(2);
            expect(complete.mock.calls[1][1].aborted).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("MACU replanner", () => {
    async function replanRequest() {
        const plan = await planMacuSwarm(Request, async () => JSON.stringify(graph()));
        return {
            ...Request,
            plan,
            outcomes: [
                { id: "a", status: "succeeded" as const, summary: "Inventory is 34.", evidence: ["Source shows 34."] },
                { id: "b", status: "pending" as const, evidence: [] },
            ],
        };
    }

    it("returns no replacement plan when the manager recommends no change", async () => {
        const request = await replanRequest();
        const complete = vi.fn(async () => JSON.stringify({ action: "no_change", reasoning: "The plan still fits." }));

        await expect(reviseMacuSwarm(request, complete)).resolves.toBeNull();
        expect(complete).toHaveBeenCalledWith(expect.stringContaining("Source shows 34."), expect.any(AbortSignal));
    });

    it("adds a worker and rewires a pending dependent while retaining the frozen result", async () => {
        const request = await replanRequest();
        const complete = async () =>
            JSON.stringify({
                action: "update",
                reasoning: "The note requires checking the inventory format.",
                add: [worker("format", ["a"])],
                modify: { b: { instruction: "Copy inventory 34 into the note.", dependencies: ["format"] } },
            });

        const revised = await reviseMacuSwarm(request, complete);
        expect(revised?.nodes).toEqual([
            request.plan.nodes[0],
            expect.objectContaining({ id: "format", dependencies: ["a"] }),
            expect.objectContaining({ id: "b", goal: "Copy inventory 34 into the note.", dependencies: ["format"] }),
        ]);
        expect(request.plan.nodes.map(({ id, dependencies }) => ({ id, dependencies }))).toEqual([
            { id: "a", dependencies: [] },
            { id: "b", dependencies: ["a"] },
        ]);
    });

    it.each([
        ["editing a frozen worker", { modify: { a: { instruction: "Repeat the work." } } }, "retained pending worker"],
        ["removing a frozen worker", { remove: ["a"] }, "existing pending worker"],
        ["removing a dependency", { remove: ["b"], add: [worker("new", ["b"])] }, "unknown ID 'b'"],
        ["rewiring a dependency to itself", { modify: { b: { dependencies: ["b"] } } }, "contains a cycle"],
        ["adding an unknown target", { add: [worker("new", [], "unknown")] }, "supplied inventory"],
        ["changing an existing target", { modify: { b: { target_id: "tab-a" } } }, "supported worker fields"],
        ["cancelling a worker", { cancel: ["a"] }, "Leave cancel empty"],
    ])("rejects %s without mutating the source plan", async (_name, patch, error) => {
        const request = await replanRequest();
        const original = structuredClone(request.plan);
        const complete = vi.fn(async () => JSON.stringify({ action: "update", reasoning: "Test patch.", ...patch }));

        await expect(reviseMacuSwarm(request, complete)).rejects.toThrow(error);
        expect(complete).toHaveBeenCalledTimes(3);
        expect(request.plan).toEqual(original);
    });
});
