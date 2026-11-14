// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { WshBridge } from "./wsh-bridge.js";

export type PenEditorMethod = "get_app_state" | "execute" | "read_skill" | "save";

export async function callPenEditor(
    bridge: Pick<WshBridge, "workspaceSurfaceControl">,
    method: PenEditorMethod,
    params: Record<string, unknown> = {}
): Promise<CallToolResult> {
    try {
        const envelope = JSON.parse(
            await bridge.workspaceSurfaceControl({
                action: "os.design.editor",
                text: JSON.stringify({ method, params }),
            })
        );
        if (envelope.success !== true) throw new Error(envelope.message || "The Design editor request failed.");
        if (typeof envelope.message !== "string") throw new Error("The Design editor returned no result.");
        const result = JSON.parse(envelope.message);
        if (Array.isArray(result?.content)) {
            const parsed = CallToolResultSchema.safeParse(result);
            if (!parsed.success) throw new Error("The Design editor returned invalid tool content.");
            if (method === "execute" && parsed.data.isError) {
                const failureText = parsed.data.content
                    .filter((item) => item.type === "text")
                    .map((item) => item.text)
                    .join("\n");
                const editId = failureText.match(/`editId`:\s*"([^"\n]+)"/)?.[1];
                if (editId) {
                    // Hermes bounds error text; keep Pen's repair identifier ahead of long validation details.
                    return {
                        ...parsed.data,
                        content: [
                            {
                                type: "text",
                                text: `Pen repair editId: ${JSON.stringify(editId)}. Send edits with exact find/replace text and omit code.`,
                            },
                            ...parsed.data.content,
                        ],
                    };
                }
            }
            return parsed.data;
        }
        if (result?.isError === true || result?.error) {
            return {
                content: [{ type: "text" as const, text: JSON.stringify(result) }],
                isError: true,
            };
        }
        return {
            content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result) }],
            isError: false,
        };
    } catch (error) {
        return {
            content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
            isError: true,
        };
    }
}
