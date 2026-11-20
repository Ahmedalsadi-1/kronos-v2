// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
export type ComfyWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export type ComfyImage = { filename: string; subfolder: string; type: "output" | "temp" | "input" };
export type ComfyRenderRef = { id: string; origin: string; image: ComfyImage };
export type ComfyJob = {
    id: string;
    origin: string;
    workflow: ComfyWorkflow;
    createdAt: number;
    status: "queued" | "running" | "completed" | "failed" | "cancel-requested" | "unknown";
    images: ComfyImage[];
    error?: string;
    workspaceId?: string;
};
export const DefaultComfyOrigin = "http://127.0.0.1:8188";
export type ComfyRequest =
    | { action: "health" | "editor" | "connect"; origin: string }
    | { action: "submit"; origin: string; workflow: ComfyWorkflow }
    | { action: "refresh"; origin: string; id?: string }
    | { action: "recipe"; origin: string; id: string }
    | { action: "cancel"; origin: string; id: string }
    | { action: "image"; origin: string; id: string; image: ComfyImage }
    | { action: "pin-image"; origin: string; id: string; image: ComfyImage; previewDigest: string };
export type ComfyResponse = {
    jobs?: ComfyJob[];
    job?: ComfyJob;
    nodeTypes?: string[];
    version?: string;
    imageData?: string;
    previewDigest?: string;
    filePath?: string;
    editorUrl?: string;
};

export function comfyOrigin(input: string): string {
    const url = new URL(input);
    if (
        url.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    )
        throw new Error("Use a local KronRender address, such as http://127.0.0.1:8188");
    return url.origin;
}
