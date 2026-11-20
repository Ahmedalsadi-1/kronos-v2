// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { Layers3, Network } from "@hermes/lib/icons";

export const WorkspaceTools = [
    {
        id: "kronrender",
        label: "KronRender",
        icon: Layers3,
        description: "Create images and media with node-based generation workflows.",
        detail: "Models, nodes, and generation controls live in the KronRender workspace.",
        keywords: ["comfy", "comfyui", "image", "media", "generation", "models", "workflow"],
    },
    {
        id: "kronflow",
        label: "KronFlow",
        icon: Network,
        description: "Build automations that connect your apps, data, and agents.",
        detail: "Manage workflows, credentials, and executions in the KronFlow workspace.",
        keywords: ["n8n", "automation", "workflow", "credentials", "executions"],
    },
] as const;

export type WorkspaceToolId = (typeof WorkspaceTools)[number]["id"];

export async function openWorkspaceTool(id: WorkspaceToolId, openWorkflows: () => void): Promise<void> {
    if (id === "kronflow") {
        openWorkflows();
        return;
    }
    const launch = window.hermesDesktop?.krontermSurfaces?.launchWorkspace;
    if (!launch) throw new Error("Open KronRender from the KronOS desktop app.");
    await launch("comfy-workflow");
}
