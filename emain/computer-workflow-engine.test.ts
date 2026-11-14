import { expect, test, vi } from "vitest";
import type { WorkflowRun } from "../frontend/types/workflow";
import { computerObservation, executeComputerWorkflow } from "./computer-workflow-engine";

const Welcome = {
    content: [
        {
            type: "text",
            text: 'App=com.github.Electron (pid 1)\nWindow: "KronOS - T1", App: Electron.\n0 standard window KronOS - T1, Secondary Actions: Raise\n\t1 container (settable, string) KronOS - T1\n5 menu bar\n\t6 Electron\n\t7 File\n\t8 Edit',
        },
    ],
};
const Run: WorkflowRun = {
    id: "run",
    title: "Inspect menu",
    kind: "computer-vm",
    conversationId: "conversation",
    status: "running",
    steps: [],
    evidence: [],
    createdAt: 0,
    updatedAt: 0,
    target: {
        workspaceId: "workspace",
        tabId: "tab",
        blockIds: [],
        environment: "native",
        computerId: "com.github.Electron",
    },
    parameters: { task: "Inspect menu" },
};
const Step = { id: "step", instruction: "Click File and verify" } as any;

test("reads actual sanitized native welcome observation indices", () => {
    expect([...computerObservation(Welcome).indices]).toEqual(["0", "1", "5", "6", "7", "8"]);
});
test("executes serial scoped AX action then observes before completion", async () => {
    const calls: string[] = [];
    let turns = 0;
    const result = await executeComputerWorkflow(Run, Step, new AbortController().signal, {
        call: async (name, args) => {
            expect(args.app).toBe("com.github.Electron");
            calls.push(name);
            return Welcome;
        },
        infer: async (prompt) =>
            JSON.stringify({
                observationId: /Observation ID: ([^\n]+)/.exec(prompt)[1],
                action: turns++ ? "done" : "click",
                elementIndex: "7",
                summary: "Menu observed",
            }),
        evidence: vi.fn(),
    });
    expect(calls).toEqual(["kron_computer_get_app_state", "kron_computer_click", "kron_computer_get_app_state"]);
    expect(result).toEqual({ result: "Menu observed", blocked: undefined });
});
test.each(["stale", "unknown-index", "pixel-action"])("rejects %s decisions before effects", async (mode) => {
    const call = vi.fn(async () => Welcome);
    await expect(
        executeComputerWorkflow(Run, Step, new AbortController().signal, {
            call,
            evidence: vi.fn(),
            infer: async (prompt) =>
                JSON.stringify({
                    observationId: mode === "stale" ? "old" : /Observation ID: ([^\n]+)/.exec(prompt)[1],
                    action: mode === "pixel-action" ? "pixel_click" : "click",
                    elementIndex: mode === "unknown-index" ? "999" : "7",
                }),
        })
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
});
test("cancellation after inference prevents effects", async () => {
    const controller = new AbortController();
    const call = vi.fn(async () => Welcome);
    await expect(
        executeComputerWorkflow(Run, Step, controller.signal, {
            call,
            evidence: vi.fn(),
            infer: async () => {
                controller.abort();
                return "{}";
            },
        })
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
});
test("iteration budget blocks instead of spawning an unbounded agent", async () => {
    const call = vi.fn(async () => Welcome);
    const result = await executeComputerWorkflow(Run, Step, new AbortController().signal, {
        call,
        evidence: vi.fn(),
        infer: async (prompt) =>
            JSON.stringify({
                observationId: /Observation ID: ([^\n]+)/.exec(prompt)[1],
                action: "click",
                elementIndex: "7",
            }),
    });
    expect(result.blocked).toContain("Review");
    expect(call).toHaveBeenCalledTimes(25);
});
