// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
export type ComfyWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export type ComfyImage = { filename: string; subfolder: string; type: "output" | "temp" | "input" };
export type ComfyJob = {
    id: string;
    origin: string;
    workflow: ComfyWorkflow;
    createdAt: number;
    status: "queued" | "running" | "completed" | "failed" | "cancel-requested" | "unknown";
    images: ComfyImage[];
    error?: string;
};
export type ComfyRequest =
    | { action: "health"; origin: string }
    | { action: "submit"; origin: string; workflow: ComfyWorkflow }
    | { action: "refresh"; origin: string }
    | { action: "cancel"; origin: string; id: string }
    | { action: "image"; origin: string; id: string; image: ComfyImage };
export type ComfyResponse = { jobs?: ComfyJob[]; nodeTypes?: string[]; version?: string; imageData?: string };
