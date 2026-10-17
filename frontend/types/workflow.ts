// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WorkflowExecutionProfile, WorkflowGraph, WorkflowLaunch, WorkflowNodeKind } from "./workflow-graph";

export type WorkflowKind = "browser-code" | "computer-vm" | "automation";
export type WorkflowStatus = "queued" | "running" | "paused" | "blocked" | "succeeded" | "cancelled";
export type WorkflowStepStatus = "pending" | "running" | "succeeded" | "blocked";
export type WorkflowTarget = {
    workspaceId: string;
    tabId: string;
    blockIds: string[];
    environment: "workspace" | "native" | "vm";
    computerId?: string;
    repository?: string;
};
export type WorkflowStep = {
    id: string;
    title: string;
    instruction: string;
    dependsOn: string[];
    status: WorkflowStepStatus;
    nodeKind?: WorkflowNodeKind;
    blockId?: string;
    engine?: WorkflowExecutionProfile;
    launch?: WorkflowLaunch;
    result?: string;
    uncertain?: boolean;
};
export type WorkflowRun = {
    id: string;
    title: string;
    kind: WorkflowKind;
    conversationId: string;
    target: WorkflowTarget;
    parameters: Record<string, string>;
    status: WorkflowStatus;
    steps: WorkflowStep[];
    graph?: WorkflowGraph;
    evidence: { id: string; stepId: string; label: string; value: string; createdAt: number }[];
    question?: {
        id: string;
        text: string;
        stepId: string;
        kind?: "permission";
        callId?: string;
        options?: { id: string; label: string; kind: string }[];
    };
    createdAt: number;
    updatedAt: number;
    workflowId?: string;
    workflowVersion?: number;
    scheduleId?: string;
    scheduledFor?: number;
    worktree?: string;
    checkpoints?: { id: string; stepId: string; directory: string; createdAt: number }[];
    error?: string;
};
export type WorkflowDefinition = {
    id: string;
    title: string;
    kind: WorkflowKind;
    target: WorkflowTarget;
    parameters: Record<string, string>;
    steps: Pick<
        WorkflowStep,
        "id" | "title" | "instruction" | "dependsOn" | "nodeKind" | "blockId" | "engine" | "launch"
    >[];
    graph?: WorkflowGraph;
};
export type SavedWorkflow = WorkflowDefinition & {
    version?: number;
    updatedAt?: number;
    revisions?: (WorkflowDefinition & { version: number; updatedAt: number })[];
};
export type WorkflowSchedule = {
    id: string;
    workflowId: string;
    conversationId: string;
    timezone: string;
    intervalMinutes: number;
    startAt: number;
    nextRunAt: number;
    enabled: boolean;
    missedRunPolicy: "skip" | "run-once";
    lastRunAt?: number;
};
export type WorkflowScheduleInput = Omit<WorkflowSchedule, "id" | "nextRunAt" | "lastRunAt"> & { id?: string };
export type WorkflowSnapshot = { runs: WorkflowRun[]; workflows: SavedWorkflow[]; schedules?: WorkflowSchedule[] };
export type WorkflowCommand = {
    action:
        | "upsert-schedule"
        | "delete-schedule"
        | "save-definition"
        | "update-workflow"
        | "delete-workflow"
        | "restore-workflow"
        | "list"
        | "create"
        | "start"
        | "pause"
        | "cancel"
        | "resume"
        | "reconcile"
        | "save"
        | "instantiate"
        | "evidence"
        | "read-evidence"
        | "restore"
        | "permission";
    runId?: string;
    workflowId?: string;
    scheduleId?: string;
    schedule?: WorkflowScheduleInput;
    scheduledFor?: number;
    expectedVersion?: number;
    revision?: number;
    definition?: WorkflowDefinition;
    steps?: WorkflowDefinition["steps"];
    graph?: WorkflowGraph;
    title?: string;
    kind?: WorkflowKind;
    conversationId?: string;
    target?: WorkflowTarget;
    parameters?: Record<string, string>;
    optionId?: string;
    checkpointId?: string;
    scheduled?: boolean;
    questionId?: string;
    resolution?: "retry" | "completed";
    stepId?: string;
    label?: string;
    evidenceId?: string;
    value?: string;
};
