// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WorkflowsView } from "@hermes/app/workflows";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { useMemo } from "react";
import { MemoryRouter } from "react-router";
import type { WorkflowSnapshot } from "../../types/workflow";

export function WorkflowsPreview() {
    const api = useMemo(() => {
        const sample: WorkflowSnapshot = {
            workflows: [],
            runs: [
                {
                    id: "sample-run",
                    title: "Fix checkout button on mobile",
                    kind: "browser-code",
                    conversationId: "sample-conversation",
                    target: {
                        workspaceId: "Storefront",
                        tabId: "Development",
                        blockIds: ["browser"],
                        environment: "workspace",
                        repository: "/sample/storefront",
                    },
                    parameters: { task: "Fix the checkout button" },
                    status: "blocked",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    question: {
                        id: "sample-question",
                        stepId: "step-2",
                        text: "Inspect the interrupted changes before retrying.",
                    },
                    steps: [
                        {
                            id: "step-1",
                            title: "Investigate browser issue",
                            instruction: "",
                            dependsOn: [],
                            status: "succeeded",
                            result: "Reproduced at 390px",
                        },
                        {
                            id: "step-2",
                            title: "Implement and review",
                            instruction: "",
                            dependsOn: ["step-1"],
                            status: "blocked",
                            uncertain: true,
                        },
                        {
                            id: "step-3",
                            title: "Verify result",
                            instruction: "",
                            dependsOn: ["step-2"],
                            status: "pending",
                        },
                    ],
                    evidence: [
                        {
                            id: "sample-diff",
                            stepId: "step-2",
                            label: "Worktree diff",
                            value: "/sample/workflow/evidence/step-2.patch",
                            createdAt: Date.now(),
                        },
                        {
                            id: "sample-evidence",
                            stepId: "step-1",
                            label: "Browser observation",
                            value: "The checkout button is clipped at a 390px viewport. This is sample data for the appearance preview.",
                            createdAt: Date.now(),
                        },
                    ],
                },
            ],
        };
        return {
            ...(window as unknown as { api: ElectronApi }).api,
            workflowCommand: async (command) => {
                if (command.action === "read-evidence")
                    return "diff --git a/checkout.css b/checkout.css\n--- a/checkout.css\n+++ b/checkout.css\n@@ -1 +1 @@\n-.checkout { width: 440px; }\n+.checkout { width: 100%; }\n";
                if (command.action !== "list")
                    throw new Error("This appearance preview uses sample data. Run workflows in KronTerm.");
                return sample;
            },
            workflowContext: async () => ({
                workspaceId: "Storefront",
                tabId: "Development",
                blockId: "browser",
                blocks: [
                    { blockid: "browser", view: "web" },
                    { blockid: "terminal", view: "term" },
                ],
            }),
            workflowOpen: async () => true,
            onWorkflowChanged: () => () => {},
        } as ElectronApi;
    }, []);
    return (
        <ThemeProvider>
            <MemoryRouter>
                <div className="h-full">
                    <div className="bg-black px-5 py-2 text-xs text-white/50">
                        Workflow appearance preview · sample data
                    </div>
                    <WorkflowsView api={api} />
                </div>
            </MemoryRouter>
        </ThemeProvider>
    );
}
