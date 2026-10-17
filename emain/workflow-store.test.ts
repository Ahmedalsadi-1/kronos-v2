import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkflowRun } from "../frontend/types/workflow";
import { WorkflowStore, workflowStepsAfterCheckpoint } from "./workflow-store";

let directory: string;
let journal: WorkflowStore;
const create = (kind: "automation" | "browser-code" | "computer-vm" = "automation", extra = {}) =>
    journal.command({
        action: "create",
        kind,
        title: "Verify result",
        conversationId: "conversation",
        target: { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"], environment: "workspace", ...extra },
        parameters: { task: "Inspect and verify the assigned target" },
    }) as WorkflowRun;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-workflows-"));
    journal = new WorkflowStore(path.join(directory, "journal.json"));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe("durable workspace workflows", () => {
    test.each(["automation", "browser-code", "computer-vm"] as const)(
        "executes %s dependencies and preserves evidence",
        async (kind) => {
            const run = create(kind, {
                repository: "/repo",
                computerId: "vm",
                environment: kind === "computer-vm" ? "vm" : "workspace",
            });
            const seen: string[] = [];
            await journal.execute(run.id, async (current, step) => {
                expect(current.target).toEqual(run.target);
                expect(
                    step.dependsOn.every((id) => current.steps.find((s) => s.id === id).status === "succeeded")
                ).toBe(true);
                seen.push(step.id);
                return { result: `Verified ${step.title}` };
            });
            expect(seen).toEqual(["step-1", "step-2", "step-3"]);
            expect(journal.get(run.id)).toMatchObject({
                status: "succeeded",
                conversationId: "conversation",
                target: run.target,
            });
            expect(journal.get(run.id).evidence).toHaveLength(3);
            const restored = new WorkflowStore(path.join(directory, "journal.json"));
            expect(restored.get(run.id)).toEqual(journal.get(run.id));
        }
    );
    test("requires explicit targets and does not save incomplete work", () => {
        expect(() => create("browser-code")).toThrow("repository");
        expect(() => create("computer-vm")).toThrow("computer");
        expect(() => journal.command({ action: "save", runId: create().id })).toThrow("successful");
    });
    test("restart preserves completed work and fences uncertain effects", async () => {
        const run = create();
        journal.update(run.id, (draft) => {
            draft.status = "running";
            draft.steps[0].status = "succeeded";
            draft.steps[1].status = "running";
        });
        const recovered = new WorkflowStore(path.join(directory, "journal.json"));
        const state = recovered.get(run.id);
        expect(state.status).toBe("blocked");
        expect(state.steps[0].status).toBe("succeeded");
        expect(() => recovered.command({ action: "resume", runId: run.id })).toThrow("Reconcile");
        expect(() =>
            recovered.command({ action: "reconcile", runId: run.id, questionId: "wrong", resolution: "retry" })
        ).toThrow("stale");
        recovered.command({
            action: "reconcile",
            runId: run.id,
            questionId: state.question.id,
            resolution: "completed",
            value: "Observed completed output",
        });
        recovered.command({ action: "resume", runId: run.id });
        const executed: string[] = [];
        await recovered.execute(run.id, async (_run, step) => {
            executed.push(step.id);
            return { result: "verified" };
        });
        expect(executed).toEqual(["step-3"]);
    });
    test("pause aborts the current step and discards a late result", async () => {
        const run = create();
        let finish: (value: { result: string }) => void;
        const execution = journal.execute(
            run.id,
            async (_run, _step, signal) =>
                new Promise((resolve) => {
                    finish = resolve;
                    signal.addEventListener("abort", () => resolve({ result: "late" }));
                })
        );
        journal.command({ action: "pause", runId: run.id });
        await execution;
        finish({ result: "another late result" });
        expect(journal.get(run.id).status).toBe("paused");
        expect(journal.get(run.id).steps[0].uncertain).toBe(true);
        expect(journal.get(run.id).evidence).toHaveLength(0);
    });
    test("native workflows share an exclusive desktop lease across applications", async () => {
        const first = create("computer-vm", { environment: "native", computerId: "Safari" });
        const second = create("computer-vm", { environment: "native", computerId: "Notes" });
        let release: (value: { result: string }) => void;
        const execution = journal.execute(
            first.id,
            async () =>
                new Promise((resolve) => {
                    release = resolve;
                })
        );
        let calls = 0;
        await journal.execute(second.id, async () => {
            calls++;
            return { result: "verified" };
        });
        expect(calls).toBe(0);
        expect(journal.get(second.id).status).toBe("queued");
        journal.command({ action: "cancel", runId: first.id });
        release({ result: "stopped" });
        await execution;
        await journal.execute(second.id, async () => {
            calls++;
            return { result: "verified" };
        });
        expect(calls).toBe(3);
    });
    test("saved workflows retain targets, queue overlaps, and coalesce scheduled catch-up", async () => {
        const run = create();
        await journal.execute(run.id, async () => ({ result: "verified" }));
        const saved = journal.command({ action: "save", runId: run.id }) as any;
        const first = journal.command({
            action: "instantiate",
            workflowId: saved.id,
            conversationId: "cron-1",
            scheduled: true,
        }) as WorkflowRun;
        const second = journal.command({
            action: "instantiate",
            workflowId: saved.id,
            conversationId: "cron-2",
            scheduled: true,
        }) as WorkflowRun;
        expect(second.id).toBe(first.id);
        expect(second.target).toEqual(run.target);
        expect(second.parameters).toEqual(run.parameters);
    });
    test("a blocked result stops successors and retains a request-bound question", async () => {
        const run = create();
        let calls = 0;
        await journal.execute(run.id, async () => {
            calls++;
            return { result: "permission not granted", blocked: "Needs runtime permission" };
        });
        expect(calls).toBe(1);
        expect(journal.get(run.id)).toMatchObject({ status: "blocked", question: { stepId: "step-1" } });
    });
});

describe("editable workflow versions", () => {
    test("edits persist, leave existing runs alone, and restore creates a new version", async () => {
        const run = create();
        await journal.execute(run.id, async () => ({ result: "verified" }));
        const saved = journal.command({
            action: "save",
            runId: run.id,
        }) as import("../frontend/types/workflow").SavedWorkflow;
        const definition = {
            ...saved,
            title: "Changed",
            steps: [
                { id: "verify", title: "Verify", instruction: "Verify outputs", dependsOn: ["inspect"] },
                { id: "inspect", title: "Inspect", instruction: "Inspect inputs", dependsOn: [] },
            ],
        };
        const edited = journal.command({
            action: "update-workflow",
            workflowId: saved.id,
            expectedVersion: 1,
            definition,
        }) as typeof saved;
        expect(edited.version).toBe(2);
        expect(edited.revisions[0].title).toBe(saved.title);
        expect(journal.get(run.id).steps).toHaveLength(3);
        const restored = new WorkflowStore(path.join(directory, "journal.json"));
        expect(restored.snapshot().workflows[0]).toEqual(edited);
        const next = restored.command({
            action: "instantiate",
            workflowId: saved.id,
            conversationId: "next",
        }) as WorkflowRun;
        const order: string[] = [];
        await restored.execute(next.id, async (_run, step) => {
            order.push(step.id);
            return { result: "verified" };
        });
        expect(order).toEqual(["inspect", "verify"]);
        const reverted = restored.command({
            action: "restore-workflow",
            workflowId: saved.id,
            expectedVersion: 2,
            revision: 1,
        }) as typeof saved;
        expect(reverted).toMatchObject({ version: 3, title: saved.title });
        expect(reverted.revisions).toHaveLength(2);
        expect(() => restored.command({ action: "delete-workflow", workflowId: saved.id, expectedVersion: 1 })).toThrow(
            "changed"
        );
        restored.command({ action: "delete-workflow", workflowId: saved.id, expectedVersion: 3 });
        expect(restored.snapshot().workflows).toEqual([]);
        expect(restored.get(next.id).status).toBe("succeeded");
    });
    test("rejects dependency cycles, missing IDs and duplicate IDs before queuing", () => {
        const base = {
            action: "create" as const,
            kind: "automation" as const,
            conversationId: "c",
            target: { workspaceId: "w", tabId: "t", blockIds: [], environment: "workspace" as const },
            parameters: { task: "Test" },
        };
        const step = { id: "a", title: "A", instruction: "Inspect", dependsOn: [] as string[] };
        expect(() => journal.command({ ...base, steps: [{ ...step, dependsOn: ["a"] }] })).toThrow("cycle");
        expect(() => journal.command({ ...base, steps: [{ ...step, dependsOn: ["missing"] }] })).toThrow("missing");
        expect(() => journal.command({ ...base, steps: [step, step] })).toThrow("unique");
        expect(journal.snapshot().runs).toHaveLength(0);
    });
});

test("checkpoint recovery follows dependencies and execution time rather than array position", () => {
    const run = create();
    run.steps = [
        { id: "successor", title: "Later", instruction: "Verify", dependsOn: ["restore"], status: "succeeded" },
        { id: "earlier", title: "Earlier", instruction: "Inspect", dependsOn: [], status: "succeeded" },
        { id: "restore", title: "Restore", instruction: "Edit", dependsOn: [], status: "succeeded" },
        { id: "branch", title: "Other branch", instruction: "Edit", dependsOn: [], status: "succeeded" },
    ];
    run.evidence = [{ id: "proof", stepId: "branch", label: "After checkpoint", value: "Changed file", createdAt: 20 }];
    expect([...workflowStepsAfterCheckpoint(run, "restore", 10)].sort()).toEqual(["branch", "restore", "successor"]);
});

test("failed journal writes roll back memory and do not publish unsaved changes", () => {
    const run = create();
    const before = journal.snapshot();
    const listener = vi.fn();
    journal.subscribe(listener);
    const write = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
        throw new Error("Disk full");
    });
    try {
        expect(() =>
            journal.update(run.id, (draft) => {
                draft.title = "Unsaved change";
            })
        ).toThrow("Disk full");
        expect(journal.snapshot()).toEqual(before);
        expect(new WorkflowStore(path.join(directory, "journal.json")).snapshot()).toEqual(before);
        expect(listener).not.toHaveBeenCalled();
    } finally {
        write.mockRestore();
    }
});

describe("canvas workflow persistence", () => {
    const graph = {
        version: 1 as const,
        nodes: [
            {
                id: "inspect",
                kind: "browser" as const,
                blockId: "browser",
                title: "Inspect",
                instruction: "Inspect browser",
            },
            { id: "review", kind: "review" as const, title: "Review", instruction: "Review evidence" },
        ],
        edges: [{ id: "connection", source: "inspect", target: "review" }],
    };
    test("saves drafts and instantiates their graph without losing dependencies", () => {
        const saved = journal.command({
            action: "save-definition",
            definition: {
                id: "draft",
                title: "Canvas draft",
                kind: "automation",
                target: { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"], environment: "workspace" },
                parameters: { task: "Inspect" },
                steps: [],
                graph,
            },
        }) as import("../frontend/types/workflow").SavedWorkflow;
        expect(journal.snapshot().runs).toHaveLength(0);
        expect(saved.steps[1]).toMatchObject({ dependsOn: ["inspect"], nodeKind: "review" });
        const run = journal.command({
            action: "instantiate",
            workflowId: saved.id,
            conversationId: "canvas-tab-session",
        }) as WorkflowRun;
        expect(run.graph).toEqual(graph);
        expect(new WorkflowStore(path.join(directory, "journal.json")).get(run.id).graph).toEqual(graph);
    });
    test("invalid draft never persists a partial workflow", () => {
        expect(() =>
            journal.command({
                action: "save-definition",
                definition: {
                    id: "draft",
                    title: "Canvas",
                    kind: "automation",
                    target: { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"], environment: "workspace" },
                    parameters: { task: "Inspect" },
                    steps: [],
                    graph: { ...graph, edges: [{ id: "bad", source: "missing", target: "review" }] },
                },
            })
        ).toThrow("missing node");
        expect(journal.snapshot()).toEqual({ runs: [], workflows: [] });
    });
});

describe("durable elapsed interval schedules", () => {
    const save = async () => {
        const run = create();
        await journal.execute(run.id, async () => ({ result: "Verified" }));
        return journal.command({ action: "save", runId: run.id }) as import("../frontend/types/workflow").SavedWorkflow;
    };
    const schedule = (workflowId: string, startAt: number, extra = {}) =>
        journal.command({
            action: "upsert-schedule",
            schedule: {
                workflowId,
                conversationId: "scheduled-chat",
                timezone: "America/New_York",
                intervalMinutes: 60,
                startAt,
                enabled: true,
                missedRunPolicy: "run-once",
                ...extra,
            },
        }) as import("../frontend/types/workflow").WorkflowSchedule;
    test("persists schedules and fires one occurrence after restart without replay", async () => {
        const saved = await save();
        const now = Date.UTC(2026, 9, 12, 14);
        const entry = schedule(saved.id, now);
        const restored = new WorkflowStore(path.join(directory, "journal.json"));
        restored.enqueueScheduledRuns(now);
        restored.enqueueScheduledRuns(now);
        expect(restored.snapshot().runs.filter((run) => run.scheduleId === entry.id)).toHaveLength(1);
        expect(restored.snapshot().schedules[0].nextRunAt).toBe(now + 3600000);
        expect(new WorkflowStore(path.join(directory, "journal.json")).snapshot()).toEqual(restored.snapshot());
    });
    test("coalesces missed intervals or skips them according to saved policy", async () => {
        const saved = await save();
        const now = Date.UTC(2026, 9, 12, 14);
        const runOnce = schedule(saved.id, now - 5 * 3600000);
        journal.enqueueScheduledRuns(now);
        expect(journal.snapshot().runs.filter((run) => run.scheduleId === runOnce.id)).toHaveLength(1);
        expect(journal.snapshot().schedules[0].nextRunAt).toBe(now + 3600000);
        const second = await save();
        const skipped = schedule(second.id, now - 5 * 3600000, { missedRunPolicy: "skip" });
        journal.enqueueScheduledRuns(now);
        expect(journal.snapshot().runs.filter((run) => run.scheduleId === skipped.id)).toHaveLength(0);
        expect(journal.snapshot().schedules.find((item) => item.id === skipped.id).nextRunAt).toBe(now + 3600000);
    });
    test("paused schedules keep their occurrence and occupied workflows skip overlap", async () => {
        const saved = await save();
        const now = Date.UTC(2026, 9, 12, 14);
        const paused = schedule(saved.id, now, { enabled: false });
        journal.enqueueScheduledRuns(now);
        expect(journal.snapshot().schedules[0].nextRunAt).toBe(now);
        journal.command({ action: "upsert-schedule", schedule: { ...paused, enabled: true } });
        journal.enqueueScheduledRuns(now);
        journal.enqueueScheduledRuns(now + 3600000);
        expect(journal.snapshot().runs.filter((run) => run.scheduleId === paused.id)).toHaveLength(1);
        expect(journal.snapshot().schedules[0].nextRunAt).toBe(now + 2 * 3600000);
        journal.command({ action: "delete-schedule", scheduleId: paused.id });
        expect(journal.snapshot().schedules).toEqual([]);
    });
    test("elapsed intervals stay stable through daylight savings and reject invalid input", async () => {
        const saved = await save();
        const start = Date.UTC(2026, 10, 1, 5, 30);
        schedule(saved.id, start);
        journal.enqueueScheduledRuns(start);
        expect(journal.snapshot().schedules[0].nextRunAt).toBe(Date.UTC(2026, 10, 1, 6, 30));
        expect(() => schedule(saved.id, start, { timezone: "Not/A_Zone" })).toThrow("timezone");
        expect(() => schedule(saved.id, start, { intervalMinutes: 0 })).toThrow("interval");
        expect(() => schedule("missing", start)).toThrow("saved workflow");
    });
    test("recovery dedupes an occurrence whose run persisted before schedule advancement", async () => {
        const saved = await save();
        const now = Date.UTC(2026, 9, 12, 14);
        const entry = schedule(saved.id, now);
        journal.command({
            action: "instantiate",
            workflowId: saved.id,
            conversationId: "scheduled-chat",
            scheduled: true,
            scheduleId: entry.id,
            scheduledFor: now,
        });
        const restored = new WorkflowStore(path.join(directory, "journal.json"));
        restored.enqueueScheduledRuns(now + 100);
        expect(restored.snapshot().runs.filter((run) => run.scheduleId === entry.id)).toHaveLength(1);
        expect(restored.snapshot().schedules[0].nextRunAt).toBe(now + 3600000);
    });
});
