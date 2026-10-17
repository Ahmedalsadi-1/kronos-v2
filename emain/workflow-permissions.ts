// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { WorkflowRun } from "../frontend/types/workflow";
import type { WorkflowStore } from "./workflow-store";

type PermissionOption = { optionId: string; kind: string; name?: string };
const Pending = new Map<string, { runId: string; resolve: (option: string) => void; options: PermissionOption[] }>();

export async function requestWorkflowPermission(
    store: WorkflowStore,
    run: WorkflowRun,
    confirmation: {
        callId: string;
        title?: string;
        options?: PermissionOption[];
    },
    signal: AbortSignal
): Promise<string> {
    if (!confirmation.callId || signal.aborted) throw new Error("Permission request is unavailable");
    const options = (confirmation.options ?? []).filter((option) =>
        ["allow_once", "reject_once"].includes(option.kind)
    );
    if (!options.some((option) => option.kind === "reject_once"))
        throw new Error("Permission request has no reject-once option");
    if (store.get(run.id).question?.kind === "permission")
        throw new Error("Another permission is already pending for this run");
    const step = store.get(run.id).steps.find((step) => step.status === "running");
    if (!step) throw new Error("Permission has no active workflow step");
    const id = randomUUID();
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            Pending.delete(id);
            reject(new Error("Permission cancelled by takeover"));
        };
        Pending.set(id, {
            runId: run.id,
            options,
            resolve: (option) => {
                Pending.delete(id);
                signal.removeEventListener("abort", onAbort);
                store.update(run.id, (draft) => {
                    if (draft.question?.id === id) draft.question = undefined;
                });
                resolve(option);
            },
        });
        signal.addEventListener("abort", onAbort, { once: true });
        store.update(run.id, (draft) => {
            draft.question = {
                id,
                stepId: step.id,
                kind: "permission",
                text: confirmation.title ?? "Agent requests permission",
                callId: confirmation.callId,
                options: options.map((option) => ({
                    id: option.optionId,
                    label: option.name ?? option.kind,
                    kind: option.kind,
                })),
            };
        });
    });
}

export function answerWorkflowPermission(runId: string, questionId: string, optionId: string): void {
    const pending = Pending.get(questionId);
    if (!pending || pending.runId !== runId || !pending.options.some((option) => option.optionId === optionId))
        throw new Error("Permission is stale or does not belong to this request");
    pending.resolve(optionId);
}
