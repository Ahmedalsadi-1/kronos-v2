import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { WorkflowRun } from "../frontend/types/workflow";

const mocks = vi.hoisted(() => ({
    dataDir: "",
    blocks: [] as any[],
    agent: vi.fn(),
    launch: vi.fn(),
    computer: vi.fn(),
}));
vi.mock("./emain-platform", () => ({ getWaveDataDir: () => mocks.dataDir }));
vi.mock("./kronterm-native-tool-bridge", () => ({
    KronTermNativeToolBridge: class {
        constructor(private context: any) {}
        createBlock = async (...args: any[]) => mocks.launch(...args);
        listBlocks = async () => JSON.stringify(mocks.blocks);
        acpRunAgent = async (...args: any[]) => mocks.agent(this.context(), ...args);
    },
}));
vi.mock("./computer-workflow-engine", () => ({
    runIndependentComputerWorkflow: (...args: any[]) => mocks.computer(...args),
}));
const exec = promisify(execFile);
let directory: string;
let repository: string;
let runtime: typeof import("./workflow-runtime");
beforeEach(async () => {
    vi.resetModules();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-runner-"));
    mocks.dataDir = path.join(directory, "data");
    repository = path.join(directory, "repository");
    fs.mkdirSync(repository);
    await exec("git", ["-C", repository, "init"]);
    fs.writeFileSync(path.join(repository, "app.txt"), "initial");
    await exec("git", ["-C", repository, "add", "."]);
    await exec("git", [
        "-C",
        repository,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "fixture",
    ]);
    mocks.blocks = [{ blockid: "browser" }];
    mocks.computer.mockReset();
    mocks.computer.mockResolvedValue({ result: "Observed native verification" });
    mocks.launch.mockReset();
    mocks.launch.mockImplementation(async () => {
        mocks.blocks.push({ blockid: "launched-widget" });
        return "block created: block:launched-widget";
    });
    mocks.agent.mockReset();
    mocks.agent.mockImplementation(async (context, _backend, _prompt, _timeout, options) => {
        expect(context).toMatchObject({ workspaceId: "workspace", tabId: "tab" });
        options.onTool({
            type: "tool_call_update",
            data: { toolCallId: "observed", status: "completed", kind: "read" },
        });
        return JSON.stringify({
            answer: JSON.stringify({ status: "succeeded", summary: "Observed verification" }),
            rejectedPermissions: [],
        });
    });
    runtime = await import("./workflow-runtime");
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
const create = (kind: "browser-code" | "computer-vm" | "automation" = "browser-code") =>
    runtime.workflowCommand({
        action: "create",
        kind,
        conversationId: "chat",
        target: {
            workspaceId: "workspace",
            tabId: "tab",
            blockIds: ["browser"],
            environment: kind === "computer-vm" ? "vm" : "workspace",
            computerId: kind === "computer-vm" ? "vm-1" : undefined,
            repository: kind === "browser-code" ? repository : undefined,
        },
        parameters: { task: "Verify the selected target" },
    }) as Promise<WorkflowRun>;
test.each(["browser-code", "computer-vm", "automation"] as const)(
    "runs %s through the actual coordinator with observed tool evidence",
    async (kind) => {
        const run = await create(kind);
        await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("succeeded"), { timeout: 5000 });
        expect(mocks.agent).toHaveBeenCalledTimes(3);
        expect(
            runtime
                .workflowStore()
                .get(run.id)
                .evidence.some((item) => item.label === "Observed tool completion")
        ).toBe(true);
        expect(runtime.workflowStore().get(run.id).target).toEqual(run.target);
        if (kind === "browser-code") {
            const completed = runtime.workflowStore().get(run.id);
            expect(completed.worktree).not.toBe(repository);
            expect(completed.checkpoints).toHaveLength(3);
            expect(fs.readFileSync(path.join(repository, "app.txt"), "utf8")).toBe("initial");
        }
    }
);
test("parallel coding runs receive separate worktrees", async () => {
    const [first, second] = await Promise.all([create(), create()]);
    await vi.waitFor(() => expect(runtime.workflowStore().get(first.id).status).toBe("succeeded"), { timeout: 5000 });
    await vi.waitFor(() => expect(runtime.workflowStore().get(second.id).status).toBe("succeeded"), { timeout: 5000 });
    expect(runtime.workflowStore().get(first.id).worktree).not.toBe(runtime.workflowStore().get(second.id).worktree);
});
test("missing targets block before starting a specialist", async () => {
    mocks.blocks = [];
    const run = await create("automation");
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("blocked"));
    expect(mocks.agent).not.toHaveBeenCalled();
});
test("a self-reported success without observed tools cannot complete", async () => {
    mocks.agent.mockResolvedValue(
        JSON.stringify({ answer: JSON.stringify({ status: "succeeded", summary: "Trust me" }) })
    );
    const run = await create("automation");
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("blocked"));
    expect(runtime.workflowStore().get(run.id).error).toContain("No completed tool");
});
test("inline diff review reads only the recorded artifact from its own run", async () => {
    const specialist = mocks.agent.getMockImplementation();
    mocks.agent.mockImplementation(async (...args) => {
        fs.writeFileSync(path.join(args[4].workspace, "added.txt"), "verified new file\n");
        return specialist(...args);
    });
    const run = await create();
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("succeeded"), { timeout: 5000 });
    const evidence = runtime
        .workflowStore()
        .get(run.id)
        .evidence.find((item) => item.label === "Worktree diff");
    expect(fs.readFileSync(evidence.value, "utf8")).toContain("+verified new file");
    expect(
        await runtime.workflowCommand({ action: "read-evidence", runId: run.id, evidenceId: evidence.id })
    ).toContain("verified new file");
    runtime.workflowStore().update(run.id, (draft) => {
        draft.evidence.find((item) => item.id === evidence.id).value = path.join(repository, "app.txt");
    });
    await expect(
        runtime.workflowCommand({ action: "read-evidence", runId: run.id, evidenceId: evidence.id })
    ).rejects.toThrow("outside its run");
});

test("canvas data connections reach the next step and human review never launches an agent", async () => {
    const run = (await runtime.workflowCommand({
        action: "create",
        kind: "automation",
        conversationId: "canvas-tab-session",
        target: { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"], environment: "workspace" },
        parameters: { task: "Inspect and review" },
        graph: {
            version: 1,
            nodes: [
                {
                    id: "inspect",
                    kind: "browser",
                    blockId: "browser",
                    title: "Inspect",
                    instruction: "Inspect",
                    outputs: [{ id: "text", type: "text" }],
                },
                {
                    id: "verify",
                    kind: "agent",
                    title: "Verify",
                    instruction: "Verify",
                    inputs: [{ id: "evidence", type: "text" }],
                },
                { id: "review", kind: "review", title: "Review", instruction: "Check observed evidence" },
            ],
            edges: [
                { id: "data", source: "inspect", target: "verify", sourcePort: "text", targetPort: "evidence" },
                { id: "control", source: "verify", target: "review" },
            ],
        },
    })) as WorkflowRun;
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("blocked"));
    expect(mocks.agent).toHaveBeenCalledTimes(2);
    expect(mocks.agent.mock.calls[1][2]).toContain('Connected input data: {"evidence":"Observed verification"}');
    const blocked = runtime.workflowStore().get(run.id);
    expect(blocked.question.stepId).toBe("review");
    await runtime.workflowCommand({
        action: "reconcile",
        runId: run.id,
        questionId: blocked.question.id,
        resolution: "completed",
        value: "Reviewed",
    });
    await runtime.workflowCommand({ action: "resume", runId: run.id });
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("succeeded"));
    expect(mocks.agent).toHaveBeenCalledTimes(2);
});

test("saved canvas schedule enters the actual execution queue", async () => {
    const saved = (await runtime.workflowCommand({
        action: "save-definition",
        definition: {
            id: "draft",
            title: "Scheduled inspection",
            kind: "automation",
            target: { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"], environment: "workspace" },
            parameters: { task: "Inspect" },
            steps: [],
            graph: {
                version: 1,
                nodes: [
                    { id: "inspect", kind: "browser", blockId: "browser", title: "Inspect", instruction: "Inspect" },
                ],
                edges: [],
            },
        },
    })) as import("../frontend/types/workflow").SavedWorkflow;
    const schedule = (await runtime.workflowCommand({
        action: "upsert-schedule",
        schedule: {
            workflowId: saved.id,
            conversationId: "scheduled-chat",
            timezone: "America/New_York",
            intervalMinutes: 60,
            startAt: Date.now(),
            enabled: true,
            missedRunPolicy: "run-once",
        },
    })) as import("../frontend/types/workflow").WorkflowSchedule;
    await vi.waitFor(() =>
        expect(
            runtime
                .workflowStore()
                .snapshot()
                .runs.find((run) => run.scheduleId === schedule.id)?.status
        ).toBe("succeeded")
    );
    expect(mocks.agent).toHaveBeenCalledTimes(1);
});

const launchRun = () =>
    runtime.workflowCommand({
        action: "create",
        kind: "automation",
        conversationId: "launch-chat",
        parameters: { task: "Launch and inspect" },
        target: { workspaceId: "workspace", tabId: "tab", blockIds: [], environment: "workspace" },
        graph: {
            version: 1,
            nodes: [
                {
                    id: "launch",
                    kind: "launch",
                    title: "Open browser",
                    instruction: "Launch configured browser",
                    launch: { view: "web", url: "https://example.com" },
                    outputs: [{ id: "widget", type: "text" }],
                },
                {
                    id: "inspect",
                    kind: "agent",
                    title: "Inspect",
                    instruction: "Inspect launched widget",
                    inputs: [{ id: "widget", type: "text" }],
                },
            ],
            edges: [{ id: "bind", source: "launch", target: "inspect", sourcePort: "widget", targetPort: "widget" }],
        },
    }) as Promise<WorkflowRun>;

test("launch creates one canonical widget, records scope and sends its ID through data ports", async () => {
    const run = await launchRun();
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("succeeded"));
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.launch).toHaveBeenCalledWith(
        "web",
        expect.objectContaining({
            url: "https://example.com",
            "workflow:runid": run.id,
            "workflow:stepid": "launch",
        })
    );
    expect(runtime.workflowStore().get(run.id).target.blockIds).toContain("launched-widget");
    expect(mocks.agent.mock.calls[0][2]).toContain('Connected input data: {"widget":"launched-widget"}');
});

test("uncertain launches cannot be retried after a lost response", async () => {
    mocks.launch.mockRejectedValue(new Error("Response interrupted"));
    const run = await launchRun();
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("blocked"));
    const blocked = runtime.workflowStore().get(run.id);
    expect(blocked.steps[0].uncertain).toBe(true);
    await expect(
        runtime.workflowCommand({
            action: "reconcile",
            runId: run.id,
            questionId: blocked.question.id,
            resolution: "retry",
        })
    ).rejects.toThrow("cannot be replayed");
    expect(mocks.launch).toHaveBeenCalledTimes(1);
});

test("computer profile dispatches the independent engine without ACP", async () => {
    const run = (await runtime.workflowCommand({
        action: "create",
        kind: "automation",
        conversationId: "computer-chat",
        parameters: { task: "Inspect native app" },
        target: {
            workspaceId: "workspace",
            tabId: "tab",
            blockIds: [],
            environment: "native",
            computerId: "com.github.Electron",
        },
        graph: {
            version: 1,
            nodes: [{ id: "computer", kind: "computer", title: "Inspect app", instruction: "Inspect app" }],
            edges: [],
        },
    })) as WorkflowRun;
    await vi.waitFor(() => expect(runtime.workflowStore().get(run.id).status).toBe("succeeded"));
    expect(mocks.computer).toHaveBeenCalledTimes(1);
    expect(mocks.agent).not.toHaveBeenCalled();
});
