// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
    SavedWorkflow,
    WorkflowCommand,
    WorkflowDefinition,
    WorkflowKind,
    WorkflowRun,
    WorkflowSchedule,
    WorkflowSnapshot,
    WorkflowStep,
    WorkflowTarget,
} from "../frontend/types/workflow";

import { compileWorkflowGraph, validateWorkflowLaunch } from "../frontend/types/workflow-graph";

const Templates: Record<WorkflowKind, { title: string; instruction: string }[]> = {
    "browser-code": [
        {
            title: "Investigate browser issue",
            instruction:
                "Inspect only the bound browser widgets. Reproduce the requested issue, collect DOM/network/console evidence and screenshots. Do not change project files yet. Report evidence and a concrete diagnosis.",
        },
        {
            title: "Implement and review",
            instruction:
                "Use the assigned repository worktree. Inspect the diagnosis, implement the smallest complete fix, inspect diagnostics, and record the diff and changed paths. Do not publish or merge. If no repository is assigned, report blocked instead of editing an arbitrary checkout.",
        },
        {
            title: "Verify result",
            instruction:
                "In the same worktree, run relevant tests and diagnostics and verify the browser behavior. Return commands, results, screenshots/artifacts, and a reviewable diff. Distinguish observed verification from assumptions. If verification fails, report blocked rather than claim success.",
        },
    ],
    "computer-vm": [
        {
            title: "Inspect assigned computer",
            instruction:
                "Resolve the exact bound native application or managed VM. Inspect current state and capture a screenshot. Respect the existing agent assignment and control generation. Report blocked if the target is unavailable or user-controlled.",
        },
        {
            title: "Execute task",
            instruction:
                "Perform the requested task only on the assigned computer. Prefer semantic tools, capture after interactions, and obey runtime permissions. Stop immediately when the user takes over. Do not substitute another computer.",
        },
        {
            title: "Verify and collect evidence",
            instruction:
                "Inspect the result on the assigned computer and return screenshots, artifacts and observed completion criteria. Release computer control. Report blocked if the requested result was not verified.",
        },
    ],
    automation: [
        {
            title: "Inspect inputs",
            instruction:
                "Inspect the bound workspace and the supplied parameters. Check the capabilities and prerequisites for the requested automation. Report blocked if required inputs or permissions are absent.",
        },
        {
            title: "Execute workflow",
            instruction:
                "Complete the parameterized task through existing KronOS tools within the bound targets. Follow runtime permission policies. Do not replay uncertain external side effects. Record outputs and action evidence.",
        },
        {
            title: "Verify outputs",
            instruction:
                "Check the requested outputs and provide reviewable evidence. Report blocked if completion cannot be verified. Return the results suitable for the local automation history.",
        },
    ],
};

export function validateWorkflowSteps(steps: WorkflowDefinition["steps"], target?: WorkflowTarget): void {
    if (!Array.isArray(steps) || !steps.length || steps.length > 100) throw new Error("Use between 1 and 100 steps");
    const ids = new Set<string>();
    for (const step of steps) {
        if (!step || typeof step.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(step.id) || ids.has(step.id))
            throw new Error("Step IDs must be unique letters, numbers, hyphens or underscores");
        ids.add(step.id);
        if (step.nodeKind === "launch") validateWorkflowLaunch(step.launch);
        else if (step.launch != null) throw new Error("Launch configuration requires a launch node");
        if (step.engine != null && !["kronoscode", "computer"].includes(step.engine))
            throw new Error("Unknown workflow execution profile");
        if (
            step.nodeKind != null &&
            !["agent", "terminal", "browser", "computer", "widget", "review", "launch"].includes(step.nodeKind)
        )
            throw new Error("Unknown workflow node kind");
        if (step.blockId != null && (!target || !target.blockIds.includes(step.blockId)))
            throw new Error("Workflow widget is outside the assigned targets");
        if (["terminal", "browser", "widget"].includes(step.nodeKind) && !step.blockId)
            throw new Error("Widget nodes require an assigned widget");
        if (step.nodeKind === "computer" && (!target?.computerId || target.environment === "workspace"))
            throw new Error("Computer nodes require an assigned computer");

        if (
            typeof step.title !== "string" ||
            !step.title.trim() ||
            step.title.length > 160 ||
            typeof step.instruction !== "string" ||
            !step.instruction.trim() ||
            step.instruction.length > 20000 ||
            !Array.isArray(step.dependsOn) ||
            step.dependsOn.some((id) => typeof id !== "string")
        )
            throw new Error("Each step needs a title, instruction and dependencies");
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string) => {
        if (visiting.has(id)) throw new Error("Workflow dependencies contain a cycle");
        if (visited.has(id)) return;
        visiting.add(id);
        const step = steps.find((entry) => entry.id === id);
        for (const dependency of step.dependsOn) {
            if (!ids.has(dependency)) throw new Error("Workflow dependency refers to a missing step");
            visit(dependency);
        }
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of ids) visit(id);
}

export function workflowStepsAfterCheckpoint(run: WorkflowRun, stepId: string, createdAt: number): Set<string> {
    const affected = new Set([
        stepId,
        ...(run.checkpoints ?? []).filter((entry) => entry.createdAt >= createdAt).map((entry) => entry.stepId),
        ...run.evidence.filter((entry) => entry.createdAt >= createdAt).map((entry) => entry.stepId),
    ]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const step of run.steps) {
            if (!affected.has(step.id) && step.dependsOn.some((id) => affected.has(id))) {
                affected.add(step.id);
                changed = true;
            }
        }
    }
    return affected;
}

export class WorkflowStore {
    private data: WorkflowSnapshot;
    private persisted: WorkflowSnapshot;
    private listeners = new Set<(snapshot: WorkflowSnapshot) => void>();
    private controllers = new Map<string, AbortController>();
    private resources = new Map<string, string>();

    constructor(private file: string) {
        this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { runs: [], workflows: [] };
        if (!Array.isArray(this.data.runs) || !Array.isArray(this.data.workflows))
            throw new Error("Invalid workflow journal");
        if (
            this.data.schedules != null &&
            (!Array.isArray(this.data.schedules) ||
                this.data.schedules.some(
                    (schedule) =>
                        !schedule ||
                        !Number.isSafeInteger(schedule.nextRunAt) ||
                        schedule.nextRunAt <= 0 ||
                        !Number.isInteger(schedule.intervalMinutes) ||
                        schedule.intervalMinutes < 1 ||
                        schedule.intervalMinutes > 525600 ||
                        typeof schedule.enabled !== "boolean" ||
                        !["skip", "run-once"].includes(schedule.missedRunPolicy) ||
                        !this.data.workflows.some((workflow) => workflow.id === schedule.workflowId)
                ))
        )
            throw new Error("Invalid workflow schedule journal");
        this.persisted = structuredClone(this.data);
        let changed = false;
        for (const run of this.data.runs) {
            if (run.status !== "running") continue;
            run.status = "blocked";
            run.error = "Execution was interrupted. Reconcile the active step before resuming.";
            for (const step of run.steps.filter((step) => step.status === "running")) {
                step.status = "blocked";
                step.uncertain = true;
                run.question = { id: randomUUID(), text: run.error, stepId: step.id };
            }
            changed = true;
        }
        if (changed) this.commit();
    }

    snapshot(): WorkflowSnapshot {
        return structuredClone(this.data);
    }
    get(id: string): WorkflowRun {
        const run = this.data.runs.find((run) => run.id === id);
        if (!run) throw new Error("Workflow run not found");
        return structuredClone(run);
    }
    subscribe(listener: (snapshot: WorkflowSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    private commit(): void {
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
            fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 });
            fs.renameSync(temporary, this.file);
            this.persisted = structuredClone(this.data);
        } catch (error) {
            this.data = structuredClone(this.persisted);
            throw error;
        } finally {
            try {
                fs.rmSync(temporary, { force: true });
            } catch {
                /* A failed cleanup must not mask the write result. */
            }
        }
        for (const listener of this.listeners) {
            try {
                listener(this.snapshot());
            } catch (error) {
                console.warn("[workflows] subscriber failed", error);
            }
        }
    }
    update(id: string, mutate: (run: WorkflowRun) => void): WorkflowRun {
        const run = this.data.runs.find((run) => run.id === id);
        if (!run) throw new Error("Workflow run not found");
        const draft = structuredClone(run);
        mutate(draft);
        draft.updatedAt = Date.now();
        this.data.runs[this.data.runs.indexOf(run)] = draft;
        this.commit();
        return structuredClone(draft);
    }
    command(input: WorkflowCommand): WorkflowSnapshot | WorkflowRun | SavedWorkflow | WorkflowSchedule {
        if (!input || typeof input !== "object") throw new Error("Invalid workflow command");
        if (input.action === "list") return this.snapshot();
        if (input.action === "delete-schedule") {
            if (!(this.data.schedules ?? []).some((schedule) => schedule.id === input.scheduleId))
                throw new Error("Workflow schedule not found");
            this.data.schedules = this.data.schedules.filter((schedule) => schedule.id !== input.scheduleId);
            this.commit();
            return this.snapshot();
        }
        if (input.action === "upsert-schedule") {
            const value = input.schedule;
            if (!value || !this.data.workflows.some((workflow) => workflow.id === value.workflowId))
                throw new Error("Select a saved workflow before scheduling");
            if (typeof value.conversationId !== "string" || !value.conversationId || value.conversationId.length > 200)
                throw new Error("Conversation identity is required");
            if (!Number.isInteger(value.intervalMinutes) || value.intervalMinutes < 1 || value.intervalMinutes > 525600)
                throw new Error("Schedule interval must be between 1 and 525600 minutes");
            if (!Number.isSafeInteger(value.startAt) || value.startAt <= 0 || value.startAt > 8640000000000000)
                throw new Error("Schedule start must be a valid timestamp");
            if (typeof value.enabled !== "boolean" || !["skip", "run-once"].includes(value.missedRunPolicy))
                throw new Error("Invalid schedule policy");
            if (typeof value.timezone !== "string" || !value.timezone) throw new Error("Schedule timezone is required");
            try {
                new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(value.startAt);
            } catch {
                throw new Error("Unknown schedule timezone");
            }
            const previous = (this.data.schedules ?? []).find((schedule) => schedule.id === value.id);
            if (value.id != null && !previous) throw new Error("Workflow schedule not found");
            const retainOccurrence =
                previous &&
                previous.workflowId === value.workflowId &&
                previous.intervalMinutes === value.intervalMinutes &&
                previous.startAt === value.startAt;
            const schedule: WorkflowSchedule = {
                id: previous?.id ?? randomUUID(),
                workflowId: value.workflowId,
                conversationId: value.conversationId,
                timezone: value.timezone,
                intervalMinutes: value.intervalMinutes,
                startAt: value.startAt,
                enabled: value.enabled,
                missedRunPolicy: value.missedRunPolicy,
                nextRunAt: retainOccurrence ? previous.nextRunAt : value.startAt,
                lastRunAt: previous?.lastRunAt,
            };
            this.data.schedules = [
                ...(this.data.schedules ?? []).filter((entry) => entry.id !== schedule.id),
                schedule,
            ];
            this.commit();
            return structuredClone(schedule);
        }

        if (["update-workflow", "delete-workflow", "restore-workflow"].includes(input.action)) {
            const saved = this.data.workflows.find((entry) => entry.id === input.workflowId);
            if (!saved) throw new Error("Saved workflow not found");
            if (input.expectedVersion !== (saved.version ?? 1))
                throw new Error("Workflow changed; reload before editing");
            if (input.action === "delete-workflow") {
                if (
                    this.data.runs.some(
                        (run) => run.workflowId === saved.id && ["queued", "running"].includes(run.status)
                    )
                )
                    throw new Error("Pause or cancel active runs before deleting this workflow");
                this.data.workflows = this.data.workflows.filter((entry) => entry.id !== saved.id);
                if (this.data.schedules)
                    this.data.schedules = this.data.schedules.filter((entry) => entry.workflowId !== saved.id);
                this.commit();
                return this.snapshot();
            }
            const definition =
                input.action === "restore-workflow"
                    ? saved.revisions?.find((entry) => entry.version === input.revision)
                    : input.definition;
            if (!definition) throw new Error("Workflow definition or revision not found");
            if (definition.id !== saved.id || definition.kind !== saved.kind)
                throw new Error("Workflow identity and kind cannot change");
            if (typeof definition.title !== "string" || !definition.title.trim() || definition.title.length > 160)
                throw new Error("Workflow title is required and must be at most 160 characters");
            if (!definition.target || JSON.stringify(definition.target) !== JSON.stringify(saved.target))
                throw new Error("Retain the assigned targets; create a new workflow to change scope");
            if (
                !definition.parameters ||
                typeof definition.parameters.task !== "string" ||
                !definition.parameters.task.trim() ||
                Object.values(definition.parameters).some((value) => typeof value !== "string" || value.length > 20000)
            )
                throw new Error("Workflow parameters require a task and string values");
            const definitionSteps = definition.graph
                ? compileWorkflowGraph(definition.graph, definition.target)
                : definition.steps;
            validateWorkflowSteps(definitionSteps, definition.target);
            const revision = {
                id: saved.id,
                title: saved.title,
                kind: saved.kind,
                target: saved.target,
                parameters: saved.parameters,
                steps: saved.steps,
                graph: saved.graph,
                version: saved.version ?? 1,
                updatedAt: saved.updatedAt ?? Date.now(),
            };
            const updated: SavedWorkflow = {
                ...structuredClone(definition),
                steps: structuredClone(definitionSteps),
                version: (saved.version ?? 1) + 1,
                updatedAt: Date.now(),
                revisions: [...(saved.revisions ?? []), structuredClone(revision)],
            };
            this.data.workflows[this.data.workflows.indexOf(saved)] = updated;
            this.commit();
            return structuredClone(updated);
        }
        if (input.action === "create" || input.action === "instantiate" || input.action === "save-definition") {
            const definition = input.action === "save-definition" ? input.definition : undefined;
            if (input.action === "save-definition" && !definition) throw new Error("Workflow definition is required");
            const saved =
                input.action === "instantiate" ? this.data.workflows.find((w) => w.id === input.workflowId) : undefined;
            if (input.action === "instantiate" && !saved) throw new Error("Saved workflow not found");
            if (input.scheduleId != null) {
                const schedule = this.data.schedules?.find((entry) => entry.id === input.scheduleId);
                if (
                    !saved ||
                    !schedule ||
                    schedule.workflowId !== saved.id ||
                    !Number.isSafeInteger(input.scheduledFor)
                )
                    throw new Error("Invalid scheduled workflow occurrence");
                const existing = this.data.runs.find(
                    (run) => run.scheduleId === schedule.id && run.scheduledFor === input.scheduledFor
                );
                if (existing) return structuredClone(existing);
            }
            if (saved && input.scheduled === true) {
                const pending = this.data.runs.find((run) => run.workflowId === saved.id && run.status === "queued");
                if (pending) return structuredClone(pending);
            }
            const kind = saved?.kind ?? definition?.kind ?? input.kind;
            const target = structuredClone(saved?.target ?? definition?.target ?? input.target);
            if (!Object.hasOwn(Templates, kind ?? "")) throw new Error("Unknown workflow kind");
            if (
                !target?.workspaceId ||
                !target.tabId ||
                !Array.isArray(target.blockIds) ||
                target.blockIds.some((id) => typeof id !== "string" || !id)
            )
                throw new Error("Explicit workspace, tab and block targets are required");
            if (!["workspace", "native", "vm"].includes(target.environment))
                throw new Error("Invalid execution environment");
            if (kind === "browser-code" && (!target.repository || target.blockIds.length === 0))
                throw new Error("Browser/code workflows require a repository and browser block");
            if (kind === "computer-vm" && (!target.computerId || target.environment === "workspace"))
                throw new Error("Computer workflows require an explicit computer/application ID");
            if (
                input.action !== "save-definition" &&
                (typeof input.conversationId !== "string" || !input.conversationId || input.conversationId.length > 200)
            )
                throw new Error("Conversation identity is required");
            const parameters = { ...(saved?.parameters ?? definition?.parameters ?? {}), ...(input.parameters ?? {}) };
            if (typeof parameters.task !== "string" || !parameters.task.trim())
                throw new Error("A task parameter is required");
            if (Object.values(parameters).some((value) => typeof value !== "string" || value.length > 20000))
                throw new Error("Invalid workflow parameters");
            const graph = structuredClone(saved?.graph ?? definition?.graph ?? input.graph);
            const graphSteps = graph ? compileWorkflowGraph(graph, target) : undefined;
            const steps: WorkflowStep[] = (
                graphSteps ??
                saved?.steps ??
                definition?.steps ??
                input.steps ??
                Templates[kind]
            ).map((step: Pick<WorkflowStep, "title" | "instruction"> & Partial<WorkflowStep>, index) => ({
                ...step,
                id: "id" in step ? step.id : `step-${index + 1}`,
                dependsOn: "dependsOn" in step ? step.dependsOn : index ? [`step-${index}`] : [],
                status: "pending",
            }));
            validateWorkflowSteps(steps, target);
            if (input.action === "save-definition") {
                if (typeof definition.title !== "string" || !definition.title.trim() || definition.title.length > 160)
                    throw new Error("Workflow title is required and must be at most 160 characters");
                const workflow: SavedWorkflow = {
                    id: randomUUID(),
                    title: definition.title,
                    kind,
                    target,
                    parameters,
                    graph,
                    steps: steps.map(({ status, ...step }) => step),
                    version: 1,
                    updatedAt: Date.now(),
                    revisions: [],
                };
                this.data.workflows.push(workflow);
                this.commit();
                return structuredClone(workflow);
            }
            const run: WorkflowRun = {
                id: randomUUID(),
                title: (input.title ?? saved?.title ?? kind).slice(0, 160),
                kind,
                target,
                parameters,
                steps,
                graph,
                conversationId: input.conversationId,
                workflowId: saved?.id,
                workflowVersion: saved ? (saved.version ?? 1) : undefined,
                scheduleId: input.scheduleId,
                scheduledFor: input.scheduledFor,
                status: "queued",
                evidence: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            this.data.runs.push(run);
            this.commit();
            return structuredClone(run);
        }
        const run = this.get(input.runId);
        if (input.action === "save") {
            if (run.status !== "succeeded") throw new Error("Only verified successful runs can be saved");
            const saved: SavedWorkflow = {
                id: randomUUID(),
                version: 1,
                updatedAt: Date.now(),
                revisions: [],
                title: input.title?.slice(0, 160) || run.title,
                kind: run.kind,
                target: run.target,
                parameters: run.parameters,
                graph: run.graph,
                steps: run.steps.map(({ id, title, instruction, dependsOn, nodeKind, blockId, engine, launch }) => ({
                    id,
                    title,
                    instruction,
                    dependsOn,
                    launch,
                    nodeKind,
                    blockId,
                    engine,
                })),
            };
            this.data.workflows.push(saved);
            this.commit();
            return structuredClone(saved);
        }
        if (input.action === "pause" || input.action === "cancel") {
            if (["succeeded", "cancelled"].includes(run.status)) return run;
            this.controllers.get(run.id)?.abort();
            return this.update(run.id, (draft) => {
                draft.status = input.action === "pause" ? "paused" : "cancelled";
                for (const step of draft.steps.filter((s) => s.status === "running")) {
                    step.status = "blocked";
                    step.uncertain = true;
                    draft.question = {
                        id: randomUUID(),
                        text: "Interrupted step: inspect its effects before retrying.",
                        stepId: step.id,
                    };
                }
            });
        }
        if (input.action === "resume" || input.action === "start") {
            if (["succeeded", "cancelled", "running"].includes(run.status))
                throw new Error("Run cannot be started in its current state");
            if (run.steps.some((s) => s.uncertain)) throw new Error("Reconcile interrupted effects before resuming");
            return this.update(run.id, (draft) => {
                draft.status = "queued";
                draft.error = undefined;
            });
        }
        if (input.action === "reconcile") {
            if (run.question?.kind === "permission") throw new Error("Answer the exact permission request in the UI");
            if (!run.question || run.question.id !== input.questionId)
                throw new Error("Question is stale or belongs to another run");
            if (!["retry", "completed"].includes(input.resolution))
                throw new Error("Choose retry or completed after inspection");
            const interrupted = run.steps.find((s) => s.id === run.question.stepId);
            if (interrupted?.nodeKind === "launch" && interrupted.uncertain && input.resolution === "retry")
                throw new Error(
                    "An uncertain launch cannot be replayed; inspect the tab and reconcile it as completed"
                );
            return this.update(run.id, (draft) => {
                const step = draft.steps.find((s) => s.id === draft.question.stepId);
                step.uncertain = false;
                step.status = input.resolution === "completed" ? "succeeded" : "pending";
                step.result = input.value?.slice(0, 40000) ?? step.result;
                draft.question = undefined;
                draft.error = undefined;
                draft.status = "paused";
            });
        }
        if (input.action === "evidence") {
            if (!run.steps.some((s) => s.id === input.stepId) || !input.label || !input.value)
                throw new Error("Evidence needs a valid step, label and value");
            return this.update(run.id, (draft) => {
                draft.evidence.push({
                    id: randomUUID(),
                    stepId: input.stepId,
                    label: input.label.slice(0, 160),
                    value: input.value.slice(0, 40000),
                    createdAt: Date.now(),
                });
            });
        }
        throw new Error("Unsupported workflow action");
    }

    enqueueScheduledRuns(now = Date.now()): void {
        if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid schedule clock");
        for (const schedule of this.data.schedules ?? []) {
            if (!schedule.enabled || schedule.nextRunAt > now) continue;
            const interval = schedule.intervalMinutes * 60000;
            const missed = now - schedule.nextRunAt >= interval;
            const occurrence = schedule.nextRunAt;
            const existing = this.data.runs.find(
                (run) => run.scheduleId === schedule.id && run.scheduledFor === occurrence
            );
            const occupied = this.data.runs.some(
                (run) =>
                    run.workflowId === schedule.workflowId &&
                    (!["succeeded", "cancelled"].includes(run.status) || run.steps.some((step) => step.uncertain))
            );
            if (existing || (!occupied && (!missed || schedule.missedRunPolicy === "run-once"))) {
                const run =
                    existing ??
                    (this.command({
                        action: "instantiate",
                        workflowId: schedule.workflowId,
                        conversationId: schedule.conversationId,
                        scheduled: true,
                        scheduleId: schedule.id,
                        scheduledFor: occurrence,
                    }) as WorkflowRun);
                schedule.lastRunAt = run.createdAt;
            }
            schedule.nextRunAt = occurrence + (Math.floor((now - occurrence) / interval) + 1) * interval;
            this.commit();
        }
    }

    controlOwner(environment: "native" | "vm", computerId?: string): string | undefined {
        return this.resources.get(environment === "native" ? "native-desktop" : `vm:${computerId}`);
    }
    isExecuting(id: string): boolean {
        return this.controllers.has(id);
    }

    async execute(
        id: string,
        executeStep: (
            run: WorkflowRun,
            step: WorkflowStep,
            signal: AbortSignal
        ) => Promise<{ result: string; blocked?: string }>
    ): Promise<void> {
        if (this.controllers.has(id) || this.controllers.size >= 3) return;
        let run = this.get(id);
        if (run.status !== "queued") return;
        const keys = [
            run.target.computerId &&
                (run.target.environment === "native"
                    ? "native-desktop"
                    : `${run.target.environment}:${run.target.computerId}`),
            run.workflowId && `workflow:${run.workflowId}`,
        ].filter(Boolean);
        if (keys.some((key) => this.resources.has(key))) return;
        for (const key of keys) this.resources.set(key, id);
        const controller = new AbortController();
        this.controllers.set(id, controller);
        try {
            this.update(id, (draft) => {
                draft.status = "running";
            });
            while (!controller.signal.aborted) {
                run = this.get(id);
                const step = run.steps.find(
                    (s) =>
                        s.status === "pending" &&
                        s.dependsOn.every((dep) => run.steps.find((s) => s.id === dep)?.status === "succeeded")
                );
                if (!step) {
                    this.update(id, (draft) => {
                        draft.status = draft.steps.every((s) => s.status === "succeeded") ? "succeeded" : "blocked";
                    });
                    break;
                }
                this.update(id, (draft) => {
                    draft.steps.find((s) => s.id === step.id).status = "running";
                });
                const outcome = await executeStep(this.get(id), step, controller.signal);
                if (controller.signal.aborted) break;
                this.update(id, (draft) => {
                    const current = draft.steps.find((s) => s.id === step.id);
                    current.result = outcome.result.slice(0, 40000);
                    current.status = outcome.blocked ? "blocked" : "succeeded";
                    draft.evidence.push({
                        id: randomUUID(),
                        stepId: step.id,
                        label: step.title,
                        value: current.result,
                        createdAt: Date.now(),
                    });
                    if (outcome.blocked) {
                        draft.status = "blocked";
                        draft.error = outcome.blocked;
                        draft.question = { id: randomUUID(), text: outcome.blocked, stepId: step.id };
                    }
                });
                if (outcome.blocked) break;
            }
        } catch (error) {
            if (!controller.signal.aborted)
                this.update(id, (draft) => {
                    draft.status = "blocked";
                    draft.error = error instanceof Error ? error.message : String(error);
                    const step = draft.steps.find((s) => s.status === "running");
                    if (step) {
                        step.status = "blocked";
                        step.uncertain = true;
                        draft.question = { id: randomUUID(), text: draft.error, stepId: step.id };
                    }
                });
        } finally {
            this.controllers.delete(id);
            for (const key of keys) if (this.resources.get(key) === id) this.resources.delete(key);
        }
    }
}
