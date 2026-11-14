// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ToolOperationContext } from "./tool-execution.js";

type ComfyOperation = "status" | "submit" | "job" | "cancel" | "image";
type ComfyUiBridge = (
    operation: ComfyOperation,
    input: Record<string, unknown>,
    signal?: AbortSignal
) => Promise<CallToolResult>;
let bridge: ComfyUiBridge | undefined;

export function setComfyUiToolBridge(value: ComfyUiBridge | undefined): void {
    bridge = value;
}

export function registerComfyUiTools(server: McpServer): void {
    const origin = z.string().max(128).optional().describe("Local ComfyUI origin, defaults to http://127.0.0.1:8188");
    const id = z.string().min(1).max(256).describe("Prompt ID returned by comfyui_submit");
    const register = (action: ComfyOperation, description: string, schema: z.ZodRawShape, readOnly: boolean) =>
        server.tool(
            `comfyui_${action}`,
            description,
            { origin, ...schema },
            { readOnlyHint: readOnly, destructiveHint: action === "cancel", idempotentHint: readOnly },
            async (input, extra) => {
                if (!bridge)
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Connect to the KronOS desktop runtime to use ComfyUI." }],
                    };
                return bridge(action, input, ToolOperationContext.getStore()?.signal ?? extra.signal);
            }
        );

    register("status", "Check the local ComfyUI service, installed node types, and recent workspace renders.", {}, true);
    register(
        "submit",
        "Queue an authorized image render using a ComfyUI workflow exported in API format. Returns a prompt ID.",
        { workflow: z.record(z.object({ class_type: z.string().min(1), inputs: z.record(z.unknown()) }).passthrough()) },
        false
    );
    register("job", "Check a ComfyUI prompt's queue state and output image references for this workspace.", { id }, true);
    register(
        "image",
        "Preview an image returned by comfyui_job. Copy the image reference fields from that job.",
        {
            id,
            image: z.object({
                filename: z.string().min(1).max(1024),
                subfolder: z.string().max(1024),
                type: z.enum(["output", "temp", "input"]),
            }),
        },
        true
    );
    register("cancel", "Cancel a specific ComfyUI prompt submitted by this workspace.", { id }, false);
}
