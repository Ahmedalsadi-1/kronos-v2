// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { makeCanvasWorkflowDefinition } from "../frontend/app/tab/workspace-canvas-workflow-model";
import { WorkflowStore } from "./workflow-store";

it("accepts the actual Canvas definition for save, run, schedule, and reload", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-canvas-contract-"));
    try {
        const journal = path.join(directory, "journal.json");
        const store = new WorkflowStore(journal);
        const definition = makeCanvasWorkflowDefinition(
            {
                title: "Check page",
                graph: {
                    version: 1,
                    nodes: [
                        {
                            id: "inspect",
                            kind: "widget",
                            blockId: "browser",
                            title: "Inspect page",
                            instruction: "Verify the page heading.",
                        },
                    ],
                    edges: [],
                },
            },
            { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"], environment: "workspace" },
            ["browser"]
        );
        const saved = store.command({ action: "save-definition", definition }) as { id: string };
        const run = store.command({ action: "create", ...definition, conversationId: "canvas-tab" }) as { id: string };
        store.command({
            action: "upsert-schedule",
            schedule: {
                workflowId: saved.id,
                conversationId: "canvas-schedule-tab",
                intervalMinutes: 60,
                timezone: "America/New_York",
                startAt: Date.now() + 3600000,
                enabled: true,
                missedRunPolicy: "skip",
            },
        });
        const restored = new WorkflowStore(journal).snapshot();
        expect(restored.workflows[0]).toMatchObject({
            id: saved.id,
            parameters: { task: "Check page" },
            graph: { version: 1 },
        });
        expect(restored.runs[0].id).toBe(run.id);
        expect(restored.schedules[0].workflowId).toBe(saved.id);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
