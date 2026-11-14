import { toolTimeoutMs } from "./tool-execution.js";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type LinuxDesktopToolAction = {
    desktopId: string;
    assignedAgentId: string;
    expectedGeneration: number;
    action: "start" | "stop" | "screenshot" | "click" | "drag" | "type" | "key" | "scroll" | "exec";
    button?: "left" | "right" | "middle";
    count?: number;
    endX?: number;
    endY?: number;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    deltaX?: number;
    deltaY?: number;
    command?: string;
};
export type LinuxDesktopToolBridge = {
    list(): Promise<unknown>;
    perform(action: LinuxDesktopToolAction): Promise<unknown>;
    startTask?(args: {
        desktopId: string;
        assignedAgentId: string;
        expectedGeneration: number;
        taskId: string;
    }): Promise<unknown>;
    finishTask?(sessionId: string): Promise<unknown>;
};
let bridge: LinuxDesktopToolBridge | undefined;
export function setLinuxDesktopToolBridge(value: LinuxDesktopToolBridge | undefined): void {
    bridge = value;
}

const AssignedDesktop = {
    desktopId: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/)
        .describe("Exact desktop ID from linux_desktop_list"),
    assignedAgentId: z
        .string()
        .min(1)
        .max(128)
        .describe(
            "Exact user-assigned reservation label for this agent; not authenticated per-bot identity under a shared transport token"
        ),
    expectedGeneration: z
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .describe("Latest observed controlGeneration; takeover invalidates stale actions"),
};

export function linuxDesktopResult(value: unknown): CallToolResult {
    const result = value as { imageDataUrl?: unknown } | null;
    if (result && typeof result.imageDataUrl === "string") {
        const match = /^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/=]+)$/.exec(result.imageDataUrl);
        if (match && match[2].length <= 28 * 1024 * 1024) {
            const { imageDataUrl: _image, ...metadata } = result;
            return {
                content: [
                    { type: "text", text: JSON.stringify(metadata) },
                    { type: "image", mimeType: `image/${match[1]}`, data: match[2] },
                ],
            };
        }
        throw new Error("Invalid Linux desktop screenshot response.");
    }
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

async function callLinuxDesktopTool(
    name: string,
    args: Record<string, unknown>,
    action?: LinuxDesktopToolAction["action"]
): Promise<CallToolResult> {
    try {
        if (bridge && name === "sandbox_task_start") {
            if (!bridge.startTask) throw new Error("Sandbox task lifecycle is unavailable.");
            return linuxDesktopResult(
                await bridge.startTask(args as Parameters<NonNullable<LinuxDesktopToolBridge["startTask"]>>[0])
            );
        }
        if (bridge && name === "sandbox_task_finish") {
            if (!bridge.finishTask) throw new Error("Sandbox task lifecycle is unavailable.");
            return linuxDesktopResult(await bridge.finishTask(args.sessionId as string));
        }
        if (bridge)
            return linuxDesktopResult(
                action ? await bridge.perform({ ...args, action } as LinuxDesktopToolAction) : await bridge.list()
            );
        // Standalone MCP clients reuse the desktop's authenticated native endpoint.
        const endpoint = process.env.KRONTERM_NATIVE_TOOL_URL;
        const token = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        if (!endpoint || !token)
            throw new Error("Connect to the running KronOS native tool server to manage Linux desktops.");
        const url = new URL(endpoint);
        if (
            url.protocol !== "http:" ||
            !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
            url.username ||
            url.password ||
            url.pathname !== "/native" ||
            url.search ||
            url.hash
        ) {
            throw new Error("KronOS native Linux desktop transport must use a local HTTP endpoint.");
        }
        if (url.hostname === "localhost") url.hostname = "127.0.0.1";
        const response = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(toolTimeoutMs(name, args, action == null || action === "screenshot") + 5000),
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ method: "call", name, arguments: args }),
        });
        if (!response.ok) throw new Error(`KronOS Linux desktop transport returned ${response.status}.`);
        if (!response.body) throw new Error("KronOS returned an empty Linux desktop response.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 28 * 1024 * 1024) throw new Error("KronOS Linux desktop response exceeds the size limit.");
                chunks.push(chunk.value);
            }
        } finally {
            await reader.cancel();
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        if (typeof value.error === "string") throw new Error(value.error);
        if (!Array.isArray(value.content)) throw new Error("KronOS returned an invalid Linux desktop response.");
        return value as CallToolResult;
    } catch (error) {
        return {
            content: [{ type: "text", text: error instanceof Error ? error.message : "Device operation failed." }],
            isError: true,
        };
    }
}

export function registerLinuxDesktopTools(server: McpServer): void {
    const register = (
        name: string,
        description: string,
        schema: z.ZodRawShape,
        action?: LinuxDesktopToolAction["action"]
    ) =>
        server.tool(
            name,
            description,
            schema,
            {
                readOnlyHint: action == null || action === "screenshot",
                destructiveHint: action === "stop" || action === "exec",
                idempotentHint: action == null || action === "screenshot",
                openWorldHint: action === "exec",
            },
            async (args) => callLinuxDesktopTool(name, args, action)
        );

    server.tool(
        "sandbox_task_start",
        "Launch a background desktop workspace for agent computer use on an explicitly assigned managed Linux desktop. Runs apps inside the isolated guest without opening host windows or moving the host pointer; this is not a native macOS Space. Copy the user-granted reservation label and generation from linux_desktop_list; if missing, request Allow agent in sandbox settings. Does not download images or reclaim user control. Save returned sessionId and call sandbox_task_finish after success, failure or cancellation. Wait for ready, capture linux_desktop_screenshot, then use linux_desktop_apps and linux_desktop_launch_app or linux_desktop_open_url. Review through the Computers viewer when requested.",
        { ...AssignedDesktop, taskId: z.string().min(1).max(128) },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async (args) => callLinuxDesktopTool("sandbox_task_start", args)
    );
    server.tool(
        "sandbox_task_finish",
        "Finish a sandbox task using its returned sessionId. Stops the task desktop while its original reservation remains valid; refuses cleanup after human takeover. Invoke in task cleanup. The VM also shuts down after five minutes without input or commands.",
        { sessionId: z.string().uuid() },
        { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        async (args) => callLinuxDesktopTool("sandbox_task_finish", args)
    );
    server.tool(
        "linux_desktop_apps",
        "List installed GUI desktop-entry IDs in the assigned background Linux workspace. Use an exact returned ID with linux_desktop_launch_app; this does not open any host application.",
        AssignedDesktop,
        { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async (args) =>
            callLinuxDesktopTool(
                "linux_desktop_exec",
                {
                    ...args,
                    command:
                        'find /usr/share/applications /usr/local/share/applications "$HOME/.local/share/applications" -maxdepth 1 -type f -name \u0027*.desktop\u0027 -printf \u0027%f\\n\u0027 2>/dev/null | sort -u',
                },
                "exec"
            )
    );
    server.tool(
        "linux_desktop_launch_app",
        "Launch an installed GUI app inside the assigned background Linux workspace using its exact desktop-entry ID from linux_desktop_apps. The host desktop stays untouched. A successful launcher exit is not proof of a ready window: capture linux_desktop_screenshot to verify. Requires the current reservation and generation; human takeover invalidates access.",
        {
            ...AssignedDesktop,
            appId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}\.desktop$/),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        async ({ appId, ...args }) =>
            callLinuxDesktopTool(
                "linux_desktop_exec",
                {
                    ...args,
                    command: [
                        'command -v gtk-launch >/dev/null 2>&1 || { echo "Guest GUI launcher unavailable: install libgtk-3-bin when preparing this desktop." >&2; exit 127; }',
                        'session_pid=$(pgrep -u "$(id -u)" -x xfce4-session | head -n 1)',
                        'if [ -n "$session_pid" ] && [ -r "/proc/$session_pid/environ" ]; then session_bus=$(tr "\\000" "\\n" <"/proc/$session_pid/environ" | sed -n "s/^DBUS_SESSION_BUS_ADDRESS=//p" | head -n 1); if [ -n "$session_bus" ]; then export DBUS_SESSION_BUS_ADDRESS="$session_bus"; fi; fi',
                        "launch_log=$(mktemp) || exit 1",
                        "trap 'rm -f \"$launch_log\"' EXIT",
                        `if DISPLAY=:1 gtk-launch '${appId}' >"$launch_log" 2>&1; then printf '%s\\n' 'Launcher accepted; capture the desktop to verify the app window.'; else launch_status=$?; cat "$launch_log" >&2; exit "$launch_status"; fi`,
                    ].join("; "),
                },
                "exec"
            )
    );
    server.tool(
        "linux_desktop_shortcut",
        "Run a common shortcut inside the assigned Ubuntu VM: select all, copy, paste, save, undo, find, address bar, new tab, close tab, terminal or switch app. Uses guest shortcuts; never controls the host.",
        {
            ...AssignedDesktop,
            shortcut: z.enum([
                "select_all",
                "copy",
                "paste",
                "save",
                "undo",
                "find",
                "address_bar",
                "new_tab",
                "close_tab",
                "terminal",
                "switch_app",
            ]),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ shortcut, ...args }) => {
            const keys = {
                select_all: "ctrl+a",
                copy: "ctrl+c",
                paste: "ctrl+v",
                save: "ctrl+s",
                undo: "ctrl+z",
                find: "ctrl+f",
                address_bar: "ctrl+l",
                new_tab: "ctrl+t",
                close_tab: "ctrl+w",
                terminal: "ctrl+alt+t",
                switch_app: "alt+Tab",
            };
            return callLinuxDesktopTool("linux_desktop_key", { ...args, key: keys[shortcut] }, "key");
        }
    );
    server.tool(
        "linux_desktop_open_url",
        "Open an HTTP or HTTPS URL in the assigned VM browser using the guest's default browser. Does not navigate the host browser.",
        {
            ...AssignedDesktop,
            url: z
                .string()
                .url()
                .max(2048)
                .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL"),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        async ({ url, ...args }) =>
            callLinuxDesktopTool(
                "linux_desktop_exec",
                {
                    ...args,
                    command:
                        "DISPLAY=:1 xdg-open '" + url.replace(/'/g, "'\\''") + "' >/tmp/kronterm-browser.log 2>&1 &",
                },
                "exec"
            )
    );
    server.tool(
        "linux_desktop_batch",
        "Send up to 16 ordered guest input actions with one tool call. Stops at the first error. Batch text into one type action; use screenshot after the batch to verify the result.",
        {
            ...AssignedDesktop,
            actions: z
                .array(
                    z.discriminatedUnion("action", [
                        z.object({
                            action: z.literal("click"),
                            x: z.number().int().min(0).max(16384),
                            y: z.number().int().min(0).max(16384),
                        }),
                        z.object({ action: z.literal("type"), text: z.string().min(1).max(4096) }),
                        z.object({ action: z.literal("key"), key: z.string().min(1).max(80) }),
                        z.object({
                            action: z.literal("scroll"),
                            deltaX: z.number().int().min(-2000).max(2000),
                            deltaY: z.number().int().min(-2000).max(2000),
                        }),
                    ])
                )
                .min(1)
                .max(16),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ actions, ...args }) => {
            let result: CallToolResult = { content: [] };
            for (let i = 0; i < actions.length; i++) {
                const { action, ...input } = actions[i];
                result = await callLinuxDesktopTool(`linux_desktop_${action}`, { ...args, ...input }, action);
                if (result.isError)
                    return {
                        ...result,
                        content: [
                            {
                                type: "text",
                                text: `Batch stopped at action ${i + 1}; earlier actions may have completed.`,
                            },
                            ...result.content,
                        ],
                    };
            }
            return result;
        }
    );
    register(
        "linux_desktop_list",
        "List managed Linux CUA desktops, readiness, assigned agents and control generations. These are isolated Linux desktops, never the macOS host.",
        {}
    );
    register(
        "linux_desktop_start",
        "Start the exact desktop assigned to this agent. User assignment and current generation required.",
        AssignedDesktop,
        "start"
    );
    register(
        "linux_desktop_stop",
        "Stop this agent's assigned desktop, ending running applications.",
        AssignedDesktop,
        "stop"
    );
    register(
        "linux_desktop_screenshot",
        "Capture the assigned Linux desktop before acting; returns image and current generation.",
        AssignedDesktop,
        "screenshot"
    );
    register(
        "linux_desktop_click",
        "Click the assigned Linux desktop using pixel coordinates from the captured screenshot; capture again to verify.",
        {
            ...AssignedDesktop,
            x: z.number().int().min(0).max(16384),
            y: z.number().int().min(0).max(16384),
            button: z.enum(["left", "right", "middle"]).optional(),
            count: z.number().int().min(1).max(2).optional(),
        },
        "click"
    );
    register(
        "linux_desktop_drag",
        "Drag from one pixel coordinate to another inside the assigned VM, for moving windows or selecting text. Capture afterward to verify.",
        {
            ...AssignedDesktop,
            x: z.number().int().min(0).max(16384),
            y: z.number().int().min(0).max(16384),
            endX: z.number().int().min(0).max(16384),
            endY: z.number().int().min(0).max(16384),
        },
        "drag"
    );
    register(
        "linux_desktop_type",
        "Type literal text into the focused field of the assigned Linux desktop.",
        { ...AssignedDesktop, text: z.string().min(1).max(4096) },
        "type"
    );
    register(
        "linux_desktop_key",
        "Send a supported key or shortcut to the assigned Linux desktop.",
        { ...AssignedDesktop, key: z.string().min(1).max(80) },
        "key"
    );
    register(
        "linux_desktop_scroll",
        "Scroll the assigned Linux desktop by bounded horizontal and vertical amounts.",
        {
            ...AssignedDesktop,
            deltaX: z.number().int().min(-2000).max(2000),
            deltaY: z.number().int().min(-2000).max(2000),
        },
        "scroll"
    );
    register(
        "linux_desktop_exec",
        "Execute a shell command inside this agent's assigned Linux desktop. Never executes on the host. User takeover or assignment changes invalidate requests.",
        { ...AssignedDesktop, command: z.string().min(1).max(4096) },
        "exec"
    );
}
