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
    manage?(name: string, args: Record<string, unknown>): Promise<unknown>;
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
        /^data:image\/(png|jpeg);base64,/.test(snapshot.imageDataUrl)
    ) {
        const { imageDataUrl: _image, ...metadata } = snapshot;
        return {
            content: [
                { type: "text", text: JSON.stringify(metadata) },
                {
                    type: "image",
                    mimeType: snapshot.imageDataUrl.startsWith("data:image/jpeg;") ? "image/jpeg" : "image/png",
                    data: snapshot.imageDataUrl.slice(snapshot.imageDataUrl.indexOf(",") + 1),
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
                action
                    ? await bridge.perform({ ...args, action } as DeviceTargetAction)
                    : name === "device_list"
                      ? await bridge.list()
                      : bridge.manage
                        ? await bridge.manage(name, args)
                        : (() => {
                              throw new Error("Device farm management is unavailable.");
                          })()
            );
        // Standalone MCP clients reuse the desktop's authenticated native endpoint.
        const endpoint = process.env.KRONTERM_NATIVE_TOOL_URL;
        const token = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        if (!endpoint || !token)
            throw new Error("Connect to the running KronOS native tool server to manage devices.");
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
            throw new Error("KronOS native device transport must use a local HTTP endpoint.");
        }
        if (url.hostname === "localhost") url.hostname = "127.0.0.1";
        const response = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(name === "device_batch_boot" ? 300_000 : 45_000),
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ method: "call", name, arguments: args }),
        });
        if (!response.ok) throw new Error(`KronOS device transport returned ${response.status}.`);
        if (!response.body) throw new Error("KronOS returned an empty device response.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 28 * 1024 * 1024) throw new Error("KronOS device response exceeds the size limit.");
                chunks.push(chunk.value);
            }
        } finally {
            await reader.cancel();
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        if (typeof value.error === "string") throw new Error(value.error);
        if (!Array.isArray(value.content)) throw new Error("KronOS returned an invalid device response.");
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

    const assignment = {
        ...MutatingTarget,
        assignee: z
            .string()
            .min(1)
            .max(128)
            .describe("Authenticated nativeCallerId of the existing bot/subagent; does not spawn an agent"),
    };
    const observation = {
        ...MutatingTarget,
        observationId: z.string().uuid().describe("Fresh observationId from device_observe for this target"),
    };
    const fleet = {
        devices: z
            .array(z.object(assignment))
            .min(1)
            .max(64)
            .refine(
                (items) => new Set(items.map((item) => item.targetId)).size === items.length,
                "Duplicate device ids"
            ),
        concurrency: z.number().int().min(1).max(4).default(2),
    };
    const step = {
        ...observation,
        action: z.enum(["tap", "type", "key", "back", "home", "swipe", "rotate"]),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        endX: z.number().min(0).max(1).optional(),
        endY: z.number().min(0).max(1).optional(),
        text: z.string().min(1).max(4096).optional(),
        key: z
            .enum([
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
            ])
            .optional(),
        orientation: z.enum(["portrait", "landscape-left", "landscape-right", "portrait-upside-down"]).optional(),
    };
    for (const [name, description, schema] of [
        [
            "device_batch_start",
            "Queue boot and exclusive assignment for 1–64 exact devices to existing agents, with 1–4 concurrent launches. Returns immediately with a batchId; poll status and inspect every result. Does not spawn agents or execute task prompts.",
            fleet,
        ],
        [
            "device_batch_status",
            "Inspect boot/assignment progress and per-device results for your batch. History lasts for this app process, up to one hour after completion.",
            { batchId: z.string().uuid() },
        ],
        [
            "device_batch_cancel",
            "Cancel queued launches in your batch. Already running boots finish; completed assignments remain reserved until released.",
            { batchId: z.string().uuid() },
        ],
        [
            "device_observe",
            "Capture the selected simulator or phone by exact targetId. Returns a screenshot and an observationId valid for one device_step within 30 seconds. Use device_pick_element for accessibility details at a point in the image.",
            { targetId: TargetId },
        ],
        [
            "device_pick_element",
            "Inspect the accessible element at a point on a fresh device_observe image. Returns its role, label, identifier, and normalized bounds when available. Does not tap or consume the observation.",
            {
                ...observation,
                x: z.number().min(0).lt(1),
                y: z.number().min(0).lt(1),
            },
        ],
        [
            "device_step",
            "Perform one action from a fresh device_observe image and return an after-image for verification. No automatic retries or semantic success claims. A missing after-image means observe again before any retry.",
            step,
        ],
        [
            "device_identity",
            "Return this authenticated caller identity to use when assigning phones to existing bots or subagents.",
            {},
        ],
        [
            "device_assign",
            "Exclusively assign a running phone to an existing bot or subagent by native caller identity.",
            assignment,
        ],
        [
            "device_release",
            "Release a phone assignment owned by this caller or agent. Does not shut down the phone.",
            { targetId: TargetId },
        ],
        ["device_assignments", "List current phone assignments. Human takeover invalidates control.", {}],
        [
            "device_batch_boot",
            "Boot up to eight explicitly selected emulators and assign each ready device to an existing agent. Returns per-device failures; does not create agents or reclaim human control.",
            {
                devices: z
                    .array(z.object(assignment))
                    .min(1)
                    .max(8)
                    .refine(
                        (items) => new Set(items.map((item) => item.targetId)).size === items.length,
                        "Duplicate device ids"
                    ),
            },
        ],
    ] as const) {
        server.tool(
            name,
            description,
            schema,
            {
                readOnlyHint: [
                    "device_assignments",
                    "device_identity",
                    "device_batch_status",
                    "device_observe",
                    "device_pick_element",
                ].includes(name),
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
            async (args) => callDeviceTool(name, args)
        );
    }

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
