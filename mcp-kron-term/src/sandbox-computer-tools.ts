// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { linuxDesktopResult } from "./linux-desktop-tools.js";

type SandboxComputerBridge = (tool: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
let bridge: SandboxComputerBridge;
export function setSandboxComputerBridge(next: SandboxComputerBridge) {
    bridge = next;
}
export function registerSandboxComputerTools(server: McpServer) {
    const register = (name: string, description: string, schema: z.ZodRawShape) => {
        server.tool(name, description, schema, async (args, extra) => {
            try {
                if (!bridge)
                    throw new Error("Use the KronTerm desktop's authenticated MCP endpoint for sandbox tools.");
                return linuxDesktopResult(await bridge(name, args, extra.signal));
            } catch (failure) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text" as const,
                            text: failure instanceof Error ? failure.message : "Sandbox tool failed.",
                        },
                    ],
                };
            }
        });
    };
    register(
        "delegation_status",
        "Inspect this chat or worker’s current delegation scope and sandbox readiness before assigning a specialist job.",
        {}
    );
    register(
        "sandbox_vm_status",
        "Inspect the sandbox computer selected by the user for this workspace. All sandbox_vm tools target this exact VM; they cannot select another computer or access the host.",
        {}
    );
    register(
        "sandbox_vm_exec",
        "Run a bounded shell command directly in the assigned sandbox VM terminal. Working directory is /home/cua/workspace. Never executes on the host.",
        { command: z.string().min(1).max(20000) }
    );
    register(
        "sandbox_vm_files",
        "List, read, write or create directories inside the assigned sandbox VM. Relative paths are resolved under /home/cua/workspace. Read in pages using offset (nextOffset is returned); writes are limited to 1 MB.",
        {
            action: z.enum(["list", "read", "write", "mkdir"]),
            path: z.string().max(4096),
            text: z.string().max(1048576).optional(),
            offset: z.number().int().min(0).optional(),
        }
    );
    register(
        "sandbox_vm_browser",
        "Control the Chromium browser running inside the assigned sandbox VM using its loopback CDP endpoint. state returns page text/links; navigate opens a URL; evaluate runs JavaScript for DOM actions. Starts the guest browser if needed.",
        {
            action: z.enum(["state", "navigate", "evaluate"]),
            url: z.string().max(8192).optional(),
            expression: z.string().max(6000).optional(),
        }
    );
    register(
        "sandbox_vm_desktop",
        "Capture or control only the selected sandbox desktop. Never controls the host desktop. Start or stop the prepared VM using action start/stop; image downloads are managed in Settings → Computers.",
        {
            action: z.enum(["screenshot", "click", "drag", "type", "key", "scroll", "start", "stop"]),
            x: z.number().min(0).max(16384).optional(),
            y: z.number().min(0).max(16384).optional(),
            endX: z.number().min(0).max(16384).optional(),
            endY: z.number().min(0).max(16384).optional(),
            text: z.string().max(20000).optional(),
            key: z.string().max(120).optional(),
            deltaX: z.number().min(-10000).max(10000).optional(),
            deltaY: z.number().min(-10000).max(10000).optional(),
        }
    );
}
