// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type SwarmTarget = {
    id: string;
    kind: "browser" | "widget" | "device" | "vm";
    resourceKeys: string[];
    generation: number;
    label: string;
    blockId?: string;
    deviceId?: string;
    desktopId?: string;
    tabId?: string;
};

export type SwarmPlanNode = {
    id: string;
    goal: string;
    targetId: string;
    dependencies: string[];
    successCriteria: string;
};

export type SwarmPlan = {
    version: 1;
    nodes: SwarmPlanNode[];
};

export type SwarmCreateInput = {
    plan: SwarmPlan;
    targets: SwarmTarget[];
    concurrency?: number;
    ownerId?: string;
    workspaceId?: string;
    sessionId?: string;
    backend?: string;
    goal?: string;
};

export type SwarmAttemptStatus = "succeeded" | "failed" | "blocked" | "cancelled" | "uncertain";
export type SwarmNodeStatus = "pending" | "running" | SwarmAttemptStatus;
export type SwarmRunStatus = "draft" | "running" | "cancelling" | SwarmAttemptStatus;

export type SwarmAttemptResult = {
    status: SwarmAttemptStatus;
    summary: string;
    evidence: string[];
};

export type SwarmNodeSnapshot = {
    id: string;
    status: SwarmNodeStatus;
    attemptId?: string;
    reconciledAt?: number;
    summary?: string;
    evidence: string[];
};

export type SwarmRunSnapshot = Omit<SwarmCreateInput, "concurrency"> & {
    id: string;
    revision: number;
    status: SwarmRunStatus;
    concurrency: number;
    nodes: SwarmNodeSnapshot[];
    createdAt: number;
    updatedAt: number;
};

export type SwarmRecoveryItem = {
    runId: string;
    attemptId: string;
    targetLabel: string;
    goal: string;
    summary?: string;
};

export type SwarmRecoveryCommand =
    | { action: "list" }
    | { action: "acknowledge"; runId: string; attemptId: string };
