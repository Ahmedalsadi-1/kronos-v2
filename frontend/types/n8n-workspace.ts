// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export const N8nSurfaces = [
    { id: "canvas", title: "Workflow canvas", description: "Nodes, connectors, node picker, and node editor" },
    { id: "executions", title: "Executions", description: "Runs and execution details for the selected workflow" },
    { id: "credentials", title: "Credentials", description: "Create and manage integration credentials" },
    { id: "data-tables", title: "Data tables", description: "Shared workflow data" },
    { id: "evaluations", title: "Evaluations", description: "Test the selected workflow" },
    { id: "insights", title: "Insights", description: "Execution analytics and drill-downs" },
    { id: "users", title: "Users", description: "Manage workflow users" },
    { id: "roles", title: "Project roles", description: "Manage project permissions" },
    { id: "api-keys", title: "API keys", description: "Manage workflow API access" },
] as const;

export type N8nSurface = (typeof N8nSurfaces)[number]["id"];
export type N8nFolder = { id: string; name: string; workflowIds: string[] };
export type N8nWorkspaceState = {
    folders: N8nFolder[];
    selectedWorkflowId?: string;
    documentRevision?: number;
    documentWorkflowId?: string;
    workflows?: { id: string; name: string; active?: boolean }[];
};

export function n8nSurfacePath(surface: N8nSurface, workflowId?: string): string {
    if (!N8nSurfaces.some((entry) => entry.id === surface)) throw new Error("Unknown workflow surface.");
    if (workflowId != null && !/^[a-zA-Z0-9_-]{1,128}$/.test(workflowId)) throw new Error("Invalid workflow ID.");
    const workflow = workflowId ? `/workflow/${encodeURIComponent(workflowId)}` : "/workflow/new";
    const paths: Record<N8nSurface, string> = {
        canvas: workflow,
        executions: workflowId ? `${workflow}/executions` : "/home/executions",
        credentials: "/home/credentials",
        "data-tables": "/home/datatables",
        evaluations: workflowId ? `${workflow}/evaluation` : "/home/workflows",
        insights: "/insights",
        users: "/settings/users",
        roles: "/settings/project-roles",
        "api-keys": "/settings/api",
    };
    return paths[surface];
}
