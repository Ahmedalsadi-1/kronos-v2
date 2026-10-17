// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

const WorkflowIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const WorkflowKindSchema = z.enum(["browser-code", "computer-vm", "automation"]);
const WorkflowNodeKindSchema = z.enum(["agent", "terminal", "browser", "computer", "widget", "review", "launch"]);
const WorkflowEngineSchema = z
    .enum(["kronoscode", "computer"])
    .describe(
        "Execution profile using the installed KronosCode backend. The computer profile is not a separate Vy engine."
    );
const WorkflowTargetSchema = z.object({
    workspaceId: z.string().min(1),
    tabId: z.string().min(1),
    blockIds: z.array(z.string().min(1)).max(32),
    environment: z.enum(["workspace", "native", "vm"]),
    computerId: z.string().optional(),
    repository: z.string().optional(),
});
const WorkflowLaunchSchema = z.object({
    view: z.enum(["term", "web", "preview"]),
    root: z.string().optional(),
    url: z.string().optional(),
    connection: z.string().optional(),
});
const WorkflowPortSchema = z.object({ id: WorkflowIdSchema, type: z.literal("text") });
export const WorkflowGraphSchema = z.object({
    version: z.literal(1),
    nodes: z
        .array(
            z.object({
                id: WorkflowIdSchema,
                kind: WorkflowNodeKindSchema,
                title: z.string().trim().min(1).max(160),
                instruction: z.string().trim().min(1).max(20000),
                blockId: z.string().min(1).optional(),
                engine: WorkflowEngineSchema.optional(),
                launch: WorkflowLaunchSchema.optional(),
                inputs: z.array(WorkflowPortSchema).max(100).optional(),
                outputs: z.array(WorkflowPortSchema).max(100).optional(),
                position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
            })
        )
        .min(1)
        .max(100),
    edges: z
        .array(
            z.object({
                id: WorkflowIdSchema,
                source: WorkflowIdSchema,
                target: WorkflowIdSchema,
                sourcePort: WorkflowIdSchema.optional(),
                targetPort: WorkflowIdSchema.optional(),
            })
        )
        .max(10000),
});
const WorkflowStepsSchema = z
    .array(
        z.object({
            id: WorkflowIdSchema,
            title: z.string().trim().min(1).max(160),
            instruction: z.string().trim().min(1).max(20000),
            dependsOn: z.array(WorkflowIdSchema).max(100),
            nodeKind: WorkflowNodeKindSchema.optional(),
            blockId: z.string().min(1).optional(),
            engine: WorkflowEngineSchema.optional(),
            launch: WorkflowLaunchSchema.optional(),
        })
    )
    .max(100);
const WorkflowParametersSchema = z.record(z.string().max(20000));
const WorkflowDefinitionSchema = z.object({
    id: z.string().max(200).default(""),
    title: z.string().trim().min(1).max(160),
    kind: WorkflowKindSchema,
    target: WorkflowTargetSchema,
    parameters: WorkflowParametersSchema,
    steps: WorkflowStepsSchema.default([]),
    graph: WorkflowGraphSchema.optional(),
});

export const WorkflowCommandShape = {
    action: z.enum([
        "create",
        "start",
        "pause",
        "cancel",
        "resume",
        "reconcile",
        "save",
        "instantiate",
        "evidence",
        "restore",
        "save-definition",
        "update-workflow",
        "delete-workflow",
        "restore-workflow",
        "upsert-schedule",
        "delete-schedule",
    ]),
    runId: z.string().optional(),
    workflowId: z.string().optional(),
    title: z.string().min(1).max(160).optional(),
    kind: WorkflowKindSchema.optional(),
    conversationId: z.string().min(1).max(200).optional(),
    target: WorkflowTargetSchema.optional(),
    parameters: WorkflowParametersSchema.optional(),
    steps: WorkflowStepsSchema.optional(),
    graph: WorkflowGraphSchema.optional(),
    definition: WorkflowDefinitionSchema.optional(),
    expectedVersion: z.number().int().min(1).optional(),
    revision: z.number().int().min(1).optional(),
    scheduleId: z.string().min(1).optional(),
    schedule: z
        .object({
            id: z.string().min(1).optional(),
            workflowId: z.string().min(1),
            conversationId: z.string().min(1).max(200),
            timezone: z.string().min(1).max(100).describe("IANA timezone, such as America/New_York."),
            intervalMinutes: z.number().int().min(1).max(525600),
            startAt: z.number().int().positive().max(8640000000000000).describe("Unix timestamp in milliseconds."),
            enabled: z.boolean(),
            missedRunPolicy: z.enum(["skip", "run-once"]),
        })
        .optional(),
    scheduledFor: z.number().int().positive().max(8640000000000000).optional(),
    optionId: z.string().optional(),
    checkpointId: z.string().optional(),
    scheduled: z.boolean().optional(),
    questionId: z.string().optional(),
    resolution: z.enum(["retry", "completed"]).optional(),
    stepId: z.string().optional(),
    label: z.string().optional(),
    value: z.string().optional(),
};
