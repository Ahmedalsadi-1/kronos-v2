// Copyright 2026, KronOS. SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ToolOperationContext } from "./tool-execution.js";

export type SwarmToolBridge = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
let bridge: SwarmToolBridge;
export function setSwarmToolBridge(value: SwarmToolBridge): void {
    bridge = value;
}

export function registerSwarmTools(server: McpServer): () => void {
    const tools: Array<ReturnType<McpServer["tool"]>> = [];
    const register = (name: string, description: string, schema: Record<string, z.ZodTypeAny>, readOnly = false) => {
        tools.push(server.tool(
            name,
            description,
            schema,
            { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: !readOnly },
            async (args, extra): Promise<CallToolResult> => {
                try {
                    if (!bridge) throw new Error("MACU swarms require the connected KronOS native tool bridge.");
                    const result = await bridge(name, args, ToolOperationContext.getStore()?.signal ?? extra.signal);
                    return { content: [{ type: "text", text: JSON.stringify(result) }] };
                } catch (error) {
                    return {
                        isError: true,
                        content: [
                            { type: "text", text: error instanceof Error ? error.message : "Swarm request failed" },
                        ],
                    };
                }
            }
        ));
    };
    register(
        "swarm_targets",
        "List exact ready targets for MACU swarms in this workspace. Browser/widget input may share a resource and serialize. Devices and Linux VMs remain Labs and need existing control grants. Discovery does not boot, assign or broaden access.",
        {},
        true
    );
    register(
        "swarm_start",
        "Use the pinned MACU planner to split a concrete authorized task into a dependency graph and start bounded managed KronOS workers on the selected targets. Independent resources run concurrently. Returns a run ID; poll swarm_status and use swarm_cancel to stop. No automatic replay after uncertain effects.",
        {
            goal: z.string().min(1).max(2000),
            targetIds: z.array(z.string().min(1).max(256)).min(1).max(8),
            concurrency: z.number().int().min(1).max(4).default(2),
        }
    );
    register(
        "swarm_status",
        "Inspect this chat's swarm graph, worker outcomes and evidence. With no runId, lists this chat's runs.",
        { runId: z.string().max(128).optional() },
        true
    );
    register(
        "swarm_cancel",
        "Stop new swarm work and revoke active workers. Uncertain resources stay quarantined across restarts until a user reviews them in the desktop Subagents view.",
        { runId: z.string().min(1).max(128) }
    );
    register(
        "swarm_replan",
        "Ask MACU to revise unfinished work using the current evidence. Requires the observed plan revision; running/completed nodes and the original target grants cannot be changed.",
        {
            runId: z.string().min(1).max(128),
            expectedRevision: z.number().int().min(1),
            reason: z.string().min(1).max(1000),
        }
    );
    return () => tools.forEach((tool) => tool.disable());
}
