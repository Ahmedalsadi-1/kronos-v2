// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type DeviceTargetAction = {
    targetId: string;
    action: "boot" | "shutdown" | "open" | "screenshot" | "tap" | "type" | "key" | "back" | "home" | "swipe" | "rotate";
    expectedGeneration?: number;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    endX?: number;
    endY?: number;
    orientation?: "portrait" | "landscape-left" | "landscape-right" | "portrait-upside-down";
};
export type ComputerTargetToolBridge = {
    list(): Promise<unknown>;
    perform(action: DeviceTargetAction): Promise<unknown>;
};

let bridge: ComputerTargetToolBridge | undefined;

export function setComputerTargetToolBridge(value: ComputerTargetToolBridge | undefined): void {
    bridge = value;
}

const TargetId = z
    .string()
    .regex(
        /^(?:[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}|appium:[a-zA-Z0-9_-]{1,128}|android-(?:avd|adb):[a-zA-Z0-9_.:-]{1,128})$/
    );
const Generation = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const MutatingTarget = {
    targetId: TargetId.describe("Exact target id from device_list; never infer a device id"),
    expectedGeneration: Generation.describe(
        "controlGeneration from the latest device_list or device_screenshot. A user takeover invalidates stale actions."
    ),
};

export function deviceResult(value: unknown): CallToolResult {
    const snapshot = value as { imageDataUrl?: unknown } | null;
    if (
        snapshot &&
        typeof snapshot.imageDataUrl === "string" &&
        snapshot.imageDataUrl.startsWith("data:image/png;base64,")
    ) {
        const { imageDataUrl: _image, ...metadata } = snapshot;
        return {
            content: [
                { type: "text", text: JSON.stringify(metadata) },
                {
                    type: "image",
                    mimeType: "image/png",
                    data: snapshot.imageDataUrl.slice("data:image/png;base64,".length),
                },
            ],
        };
    }
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

async function callDeviceTool(
    name: string,
    args: Record<string, unknown>,
    action?: DeviceTargetAction["action"]
): Promise<CallToolResult> {
    try {
        if (bridge)
            return deviceResult(
                action ? await bridge.perform({ ...args, action } as DeviceTargetAction) : await bridge.list()
            );
        // Standalone MCP clients reuse the desktop's authenticated native endpoint.
        const endpoint = process.env.KRONTERM_NATIVE_TOOL_URL;
        const token = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        if (!endpoint || !token)
            throw new Error("Connect to the running KronTerm native tool server to manage devices.");
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
            throw new Error("KronTerm native device transport must use a local HTTP endpoint.");
        }
        if (url.hostname === "localhost") url.hostname = "127.0.0.1";
        const response = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(45_000),
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ method: "call", name, arguments: args }),
        });
        if (!response.ok) throw new Error(`KronTerm device transport returned ${response.status}.`);
        if (!response.body) throw new Error("KronTerm returned an empty device response.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 28 * 1024 * 1024) throw new Error("KronTerm device response exceeds the size limit.");
                chunks.push(chunk.value);
            }
        } finally {
            await reader.cancel();
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        if (typeof value.error === "string") throw new Error(value.error);
        if (!Array.isArray(value.content)) throw new Error("KronTerm returned an invalid device response.");
        return value as CallToolResult;
    } catch (error) {
        return {
            content: [{ type: "text", text: error instanceof Error ? error.message : "Device operation failed." }],
            isError: true,
        };
    }
}

export function registerComputerTargetTools(server: McpServer): void {
    const register = (
        name: string,
        description: string,
        schema: z.ZodRawShape,
        action?: DeviceTargetAction["action"]
    ) =>
        server.tool(
            name,
            description,
            schema,
            {
                readOnlyHint: action == null || action === "screenshot",
                destructiveHint: action === "shutdown",
                idempotentHint: action == null || action === "screenshot",
                openWorldHint: false,
            },
            async (args) => callDeviceTool(name, args, action)
        );

    register("device_home", "Press Home on the exact observed simulator or Android device.", MutatingTarget, "home");
    register(
        "device_swipe",
        "Swipe with normalized 0..1 coordinates on the observed simulator or Android device.",
        {
            ...MutatingTarget,
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            endX: z.number().min(0).max(1),
            endY: z.number().min(0).max(1),
        },
        "swipe"
    );
    register(
        "device_rotate",
        "Rotate an iOS Simulator using its advertised capability.",
        {
            ...MutatingTarget,
            orientation: z.enum(["portrait", "landscape-left", "landscape-right", "portrait-upside-down"]),
        },
        "rotate"
    );
    register(
        "device_list",
        "List real Computers & Devices targets and current controlGeneration. Labs: Orca-backed iOS Simulator, real Android AVD/ADB devices, and optional local Appium sessions. Device sessions may represent physical phones or emulators; capabilities describe available actions.",
        {}
    );
    register(
        "device_screenshot",
        "Observe a booted simulator or connected mobile session and return a PNG image with target controlGeneration. Capture before interactions; use device tools only for listed targets, never the host desktop or sandbox.",
        { targetId: TargetId },
        "screenshot"
    );
    register(
        "device_tap",
        "Tap an advertised simulator or mobile target using normalized screenshot coordinates 0..1. Requires latest observed controlGeneration; fresh screenshot needed to verify effect.",
        { ...MutatingTarget, x: z.number().min(0).max(1), y: z.number().min(0).max(1) },
        "tap"
    );
    register(
        "device_type",
        "Enter literal text into the focused field on an advertised device; direct simulator/ADB adapters have encoding limits, while Appium supports Unicode. Select the field first; requires latest observed controlGeneration. Never supply passwords or credentials without user authorization.",
        { ...MutatingTarget, text: z.string().min(1).max(4096) },
        "type"
    );
    register(
        "device_key",
        "Send Enter, Backspace, Delete, Tab, Escape, arrows, Home or End to an Android target advertising key capability. Requires current generation.",
        {
            ...MutatingTarget,
            key: z.enum([
                "Enter",
                "Backspace",
                "Delete",
                "Tab",
                "Escape",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Home",
                "End",
            ]),
        },
        "key"
    );
    register(
        "device_back",
        "Press Back on an Android ADB or Appium target. Unsupported for iOS; inspect advertised capabilities first.",
        MutatingTarget,
        "back"
    );
    register(
        "device_boot",
        "Boot the exact listed iOS Simulator or Android AVD. Requires current controlGeneration; does not install runtimes or create an Appium session.",
        MutatingTarget,
        "boot"
    );
    register(
        "device_shutdown",
        "Shut down the exact listed emulator, ending its running apps. Requires current controlGeneration.",
        MutatingTarget,
        "shutdown"
    );
    register(
        "device_open",
        "Open the exact listed simulator in Apple's Simulator app. Requires current controlGeneration.",
        MutatingTarget,
        "open"
    );
}
