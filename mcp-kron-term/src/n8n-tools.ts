// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type N8nBridge = { invoke(operation: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> };
let bridge: N8nBridge | undefined;
export function setN8nWorkflowBridge(value: N8nBridge | undefined): void {
    bridge = value;
}

const WorkflowId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const Workflow = {
    workflowId: WorkflowId.optional().describe("Saved n8n workflow ID; defaults to the workflow selected in Hermes"),
};

export function registerN8nTools(server: McpServer): void {
    const register = (
        name: string,
        operation: string,
        description: string,
        shape: z.ZodRawShape,
        readOnly: boolean
    ) => {
        server.tool(
            name,
            description,
            shape,
            { readOnlyHint: readOnly, destructiveHint: !readOnly },
            async (args, extra): Promise<CallToolResult> => {
                try {
                    if (bridge) {
                        const value = await bridge.invoke(operation, args as Record<string, unknown>, extra.signal);
                        return { content: [{ type: "text", text: JSON.stringify(value) }] };
                    }
                    const endpoint = new URL(process.env.KRONTERM_NATIVE_TOOL_URL || "http://invalid/");
                    const token = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
                    if (
                        !token ||
                        endpoint.protocol !== "http:" ||
                        endpoint.hostname !== "127.0.0.1" ||
                        endpoint.pathname !== "/native" ||
                        endpoint.username ||
                        endpoint.password ||
                        endpoint.search ||
                        endpoint.hash
                    )
                        throw new Error("Connect to the local KronTerm runtime to use workflow tools.");
                    const timeout =
                        name === "n8n_run_agent" ? (Number(args.timeoutSeconds) || 180) * 1000 + 10000 : 40000;
                    const response = await fetch(endpoint, {
                        method: "POST",
                        redirect: "error",
                        signal: AbortSignal.any([extra.signal, AbortSignal.timeout(timeout)]),
                        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                        body: JSON.stringify({ method: "call", name, arguments: args }),
                    });
                    if (!response.ok) throw new Error(`Workflow bridge returned ${response.status}`);
                    const reader = response.body?.getReader();
                    if (!reader) throw new Error("Workflow bridge returned an empty response.");
                    const chunks: Uint8Array[] = [];
                    let size = 0;
                    try {
                        while (true) {
                            const next = await reader.read();
                            if (next.done) break;
                            size += next.value.byteLength;
                            if (size > 8 * 1024 * 1024) throw new Error("Workflow response exceeds the size limit.");
                            chunks.push(next.value);
                        }
                    } finally {
                        await reader.cancel();
                    }
                    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as CallToolResult;
                } catch (error) {
                    return {
                        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
                        isError: true,
                    };
                }
            }
        );
    };
    register(
        "n8n_search_nodes",
        "search-nodes",
        "Search the live n8n node catalog, including configured KronTerm widget nodes and Hermes Agent. Read node details before wiring connectors.",
        { query: z.string().max(200).default("") },
        true
    );
    register(
        "n8n_get_node",
        "get-node",
        "Read the complete node schema: parameters, inputs, outputs, credential types, and versions. Never invent node parameter names.",
        { nodeType: z.string().min(1).max(250) },
        true
    );
    register(
        "n8n_get_workflow",
        "get-workflow",
        "Read a saved workflow, its nodes, connectors and current versionId before editing.",
        Workflow,
        true
    );
    register(
        "n8n_edit_workflow",
        "edit-workflow",
        "Edit nodes and connectors in one validated batch. Supports add-node, move-node, remove-node, rename-node, update-node, connect, disconnect. A move-node edit has name and position: [x, y]. Supply expectedVersionId from the latest read. Does not execute the workflow.",
        { ...Workflow, expectedVersionId: z.string().min(1), edits: z.array(z.record(z.unknown())).min(1).max(100) },
        false
    );
    register(
        "n8n_validate_workflow",
        "validate-workflow",
        "Validate graph structure and node parameters with the real n8n node helpers before testing. This does not replace execution tests or credential setup.",
        Workflow,
        true
    );
    register(
        "n8n_list_workflows",
        "workflows",
        "List saved n8n workflows available to the signed-in workflow widget.",
        {},
        true
    );
    register(
        "n8n_create_workflow",
        "create-workflow",
        "Create a workflow with a manual trigger connected to the default Hermes Agent. It is saved without executing.",
        { name: z.string().min(1).max(160), task: z.string().max(40000).optional() },
        false
    );
    register(
        "n8n_get_executions",
        "executions",
        "Read execution history and results for the selected saved workflow.",
        Workflow,
        true
    );
    register(
        "n8n_get_execution",
        "execution-detail",
        "Read execution details, node outputs and errors for expression mapping and debugging. The execution must belong to the selected workflow.",
        { ...Workflow, executionId: WorkflowId },
        true
    );
    register(
        "n8n_organize_workflows",
        "folders",
        "Organize workflow references into Hermes folders. Removing a folder keeps its workflows. No n8n workflow is deleted.",
        {
            action: z.enum(["create-folder", "rename-folder", "delete-folder", "move-workflow"]),
            folderId: z.string().max(128).optional(),
            name: z.string().min(1).max(120).optional(),
            workflowId: WorkflowId.optional(),
        },
        false
    );
    register(
        "n8n_run_workflow",
        "run-workflow",
        "Execute the saved workflow only when the user has authorized its side effects. Inspect execution results after running.",
        Workflow,
        false
    );
    register(
        "n8n_run_agent",
        "run-agent",
        "Run a bounded personalized Hermes workflow worker with KronTerm tools. The worker can inspect and edit workflows, but must not recursively delegate to itself. Returns the Hermes session and final result.",
        {
            ...Workflow,
            task: z.string().min(1).max(40000),
            timeoutSeconds: z.number().int().min(15).max(600).default(180),
            executionId: z.string().max(160).optional(),
            input: z.unknown().optional(),
        },
        false
    );
}
