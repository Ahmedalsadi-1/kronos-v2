// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { N8nWorkspaceState } from "../frontend/types/n8n-workspace";
import type { HermesSurfaceContext } from "./hermes-runtime";

export function n8nScopeKey(context: HermesSurfaceContext): string {
    if (!context?.workspaceId || !context.tabId) throw new Error("Open a workspace tab first.");
    return createHash("sha256").update(`${context.workspaceId}:${context.tabId}`).digest("hex").slice(0, 24);
}

export class N8nWorkspaceStore {
    constructor(private root: string) {}

    read(context: HermesSurfaceContext): N8nWorkspaceState {
        const filename = path.join(this.root, n8nScopeKey(context), "workspace.json");
        if (!fs.existsSync(filename)) return { folders: [] };
        const state = JSON.parse(fs.readFileSync(filename, "utf8"));
        if (!Array.isArray(state.folders)) throw new Error("Workflow folder index is invalid.");
        return state;
    }

    removeWorkflow(context: HermesSurfaceContext, workflowId: string): void {
        const state = this.read(context);
        if (state.selectedWorkflowId === workflowId) delete state.selectedWorkflowId;
        else if (!state.folders.some((folder) => folder.workflowIds.includes(workflowId))) return;
        for (const folder of state.folders) folder.workflowIds = folder.workflowIds.filter((id) => id !== workflowId);
        this.write(context, state);
    }

    command(
        context: HermesSurfaceContext,
        input: {
            action: "create-folder" | "rename-folder" | "delete-folder" | "move-workflow" | "select-workflow";
            name?: string;
            folderId?: string;
            workflowId?: string;
        }
    ): N8nWorkspaceState {
        const state = this.read(context);
        if (input.workflowId != null && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.workflowId))
            throw new Error("Invalid workflow ID.");
        const folder = state.folders.find((entry) => entry.id === input.folderId);
        if (input.action === "create-folder" || input.action === "rename-folder") {
            const name = input.name?.trim();
            if (!name || name.length > 120 || /[\x00-\x1f]/.test(name))
                throw new Error("Use a folder name of 1–120 characters.");
            if (input.action === "create-folder") state.folders.push({ id: randomUUID(), name, workflowIds: [] });
            else {
                if (!folder) throw new Error("Folder no longer exists.");
                folder.name = name;
            }
        } else if (input.action === "delete-folder") {
            if (!folder) throw new Error("Folder no longer exists.");
            state.folders = state.folders.filter((entry) => entry !== folder);
        } else if (input.action === "move-workflow") {
            if (!input.workflowId) throw new Error("Choose a workflow.");
            if (input.folderId && !folder) throw new Error("Folder no longer exists.");
            for (const entry of state.folders)
                entry.workflowIds = entry.workflowIds.filter((id) => id !== input.workflowId);
            folder?.workflowIds.push(input.workflowId);
        } else if (input.action === "select-workflow") {
            state.selectedWorkflowId = input.workflowId;
        } else throw new Error("Unknown folder action.");
        this.write(context, state);
        return state;
    }

    private write(context: HermesSurfaceContext, state: N8nWorkspaceState): void {
        const directory = path.join(this.root, n8nScopeKey(context));
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const filename = path.join(directory, "workspace.json");
        const temporary = `${filename}.${randomUUID()}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
        fs.renameSync(temporary, filename);
    }
}
