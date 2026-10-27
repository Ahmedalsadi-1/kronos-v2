// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { coucouPalette } from "../frontend/hermes/themes/coucou-palettes";
import type { AgentActivityEvent } from "../frontend/types/agent-activity";
import { agentActivityCaption } from "../frontend/types/agent-presentation";

export type CoucouHudEvent = {
    event: "ready" | "chat-open" | "chat-close" | "action" | "preview-layout" | "chat-layout";
    x: number;
    y: number;
    width: number;
    height: number;
    inset: number;
    action?: string;
    route?: string;
    previewX?: number;
    previewY?: number;
    previewWidth?: number;
    previewHeight?: number;
    previewVisible?: boolean;
    splitChat?: boolean;
    compactChat?: boolean;
    layoutRevision?: number;
    layoutReady?: boolean;
    chatIntent?: boolean;
    contentX?: number;
    contentY?: number;
    contentWidth?: number;
    contentHeight?: number;
};

export function parseCoucouHudEvent(line: string): CoucouHudEvent | undefined {
    try {
        const value = JSON.parse(line);
        if (!["ready", "chat-open", "chat-close", "action", "preview-layout", "chat-layout"].includes(value?.event))
            return;
        if (!["x", "y", "width", "height", "inset"].every((key) => Number.isFinite(value[key]))) return;
        if (
            value.event === "chat-layout" &&
            (!Number.isSafeInteger(value.layoutRevision) ||
                value.layoutRevision < 0 ||
                typeof value.layoutReady !== "boolean" ||
                typeof value.chatIntent !== "boolean")
        )
            return;
        if (value.compactChat != null && typeof value.compactChat !== "boolean") return;
        if (value.splitChat != null && typeof value.splitChat !== "boolean") return;
        if (value.width <= 0 || value.height <= 0 || value.inset < 0) return;
        if (value.event === "preview-layout" && !coucouPreviewBounds(value)) return;
        if (
            value.event === "action" &&
            ![
                "workflow-open",
                "workflow-pause",
                "workflow-takeover",
                "workflow-review",
                "theme-select",
                "workspace-create",
                "web",
                "web-new",
                "browser-navigate",
                "browser-back",
                "browser-forward",
                "browser-reload",
                "workflowcanvas",
                "bots",
                "machines",
                "android",
                "iphone",
                "terminal-new",
                "terminal-split-right",
                "terminal-split-down",
                "apps",
                "apps-connect",
                "explorer-refresh",
                "explorer-collapse",
                "explorer-new-file",
                "explorer-new-folder",
                "explorer-open",
                "files",
                "terminal",
                "widget",
                "exit",
                "navigate",
                "chat",
                "preview-next",
                "preview-focus",
                "preview-toggle",
                "preview-retry",
                "preview-dock",
                "follow-agent",
                "preview-detach",
                "pet-attach",
                "control-pause",
                "control-release",
                "dock-visible",
                "dock-hidden",
                "voice-mute",
                "voice-stop",
                "voice-interrupt",
                "voice-expand",
                "productivity-focus-toggle",
            ].includes(value.action) &&
            !/^(preview-select|browser-select|workspace-select|workflow-answer):[a-zA-Z0-9_-]{1,80}$/.test(
                value.action ?? ""
            )
        )
            return;
        if (value.action === "theme-select" && !coucouPalette(value.route)) return;
        return value;
    } catch {
        return;
    }
}

export function coucouPreviewBounds(event: CoucouHudEvent): Electron.Rectangle | undefined {
    if (
        ![event.previewX, event.previewY, event.previewWidth, event.previewHeight].every(Number.isFinite) ||
        typeof event.previewVisible !== "boolean" ||
        event.previewWidth < 1 ||
        event.previewHeight < 1 ||
        event.previewX < event.x ||
        event.previewY < event.y ||
        event.previewX + event.previewWidth > event.x + event.width ||
        event.previewY + event.previewHeight > event.y + event.height
    )
        return;
    return {
        x: Math.round(event.previewX),
        y: Math.round(event.previewY),
        width: Math.round(event.previewWidth),
        height: Math.round(event.previewHeight),
    };
}

export function coucouChatBounds(event: CoucouHudEvent): Electron.Rectangle {
    if (
        [event.contentX, event.contentY, event.contentWidth, event.contentHeight].every(Number.isFinite) &&
        event.contentWidth > 0 &&
        event.contentHeight > 0 &&
        event.contentWidth <= event.width &&
        event.contentHeight <= event.height
    ) {
        return {
            x: Math.round(event.contentX),
            y: Math.round(event.contentY),
            width: Math.round(event.contentWidth),
            height: Math.round(event.contentHeight),
        };
    }
    const top = Math.min(Math.max(52, event.inset + 20), Math.max(0, event.height - 1));
    const width = Math.max(1, Math.min(360, event.width - 32));
    const height = Math.max(1, Math.min(720, event.height - top - 20));
    return {
        x: Math.round(event.x + (event.width - width) / 2),
        y: Math.round(event.y + top),
        width: Math.round(width),
        height: Math.round(height),
    };
}

export function coucouRecoveryChatBounds(event: CoucouHudEvent, preview?: Electron.Rectangle): Electron.Rectangle {
    const fallback = coucouChatBounds({
        ...event,
        contentX: undefined,
        contentY: undefined,
        contentWidth: undefined,
        contentHeight: undefined,
    });
    if (!preview) return fallback;
    const gap = 12;
    const left = preview.x - event.x - gap * 2;
    const right = event.x + event.width - preview.x - preview.width - gap * 2;
    if (Math.max(left, right) < 220) {
        const above = preview.y - event.y - gap * 2;
        const below = event.y + event.height - preview.y - preview.height - gap * 2;
        if (Math.max(above, below) < 160) return fallback;
        const height = Math.min(fallback.height, Math.max(above, below));
        return {
            ...fallback,
            height: Math.round(height),
            y: Math.round(above >= below ? preview.y - height - gap : preview.y + preview.height + gap),
        };
    }
    const useLeft = left >= 220;
    const width = Math.min(fallback.width, useLeft ? left : right);
    const inset = preview.height >= 400 ? 160 : 0;
    const y = Math.max(event.y + gap, preview.y + inset);
    return {
        x: Math.round(useLeft ? preview.x - width - gap : preview.x + preview.width + gap),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.max(
            1,
            Math.round(Math.min(fallback.height, preview.height - inset, event.y + event.height - y - gap))
        ),
    };
}

export function startCoucouHud(
    appBasePath: string,
    onEvent: (event: CoucouHudEvent) => void,
    onExit: () => void
): ChildProcess | undefined {
    if (process.platform !== "darwin" && process.platform !== "linux") return;
    if (process.env.ORCA_BACKGROUND_LAUNCH === "1") return;
    const executable =
        process.platform === "linux"
            ? path.resolve(appBasePath, "../.local/coucou-hud/coucou")
            : path.resolve(appBasePath, "../.local/coucou-hud/Coucou.app/Contents/MacOS/Coucou");
    if (!existsSync(executable)) {
        console.warn(`[coucou-hud] companion executable missing: ${executable}`);
        return;
    }
    const child = spawn(executable, ["--kronterm-hud"], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => {});
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
        const event = parseCoucouHudEvent(line);
        if (event) onEvent(event);
    });
    child.stderr.on("data", (data) => console.warn(`[coucou-hud] ${data.toString().trim()}`));
    child.once("error", (error) => {
        console.error("[coucou-hud] launch failed", error);
        onExit();
    });
    child.once("exit", (code, signal) => {
        if (!child.killed) console.warn(`[coucou-hud] companion exited (${signal ?? code})`);
        lines.close();
        onExit();
    });
    return child;
}

export type CoucouProgress = { detail: string; phase: string; steps: string[]; taskId?: string };

export function coucouProgress(activity: AgentActivityEvent, previous?: CoucouProgress): CoucouProgress {
    const actions: Partial<Record<AgentActivityEvent["action"], string>> = {
        click: "Clicking",
        doubleClick: "Double clicking",
        type: "Typing",
        press: "Pressing a key",
        scroll: "Scrolling",
        drag: "Dragging",
        move: "Moving the pointer",
        screenshot: "Capturing a screenshot",
    };
    const caption = agentActivityCaption(activity);
    const detail =
        ["running", "start", "update"].includes(activity.phase) && actions[activity.action]
            ? `${actions[activity.action]} · ${caption}`
            : caption;
    const taskId = activity.runid ?? activity.sessionid;
    const steps = previous && previous.taskId === taskId ? [...previous.steps] : [];
    if (steps[steps.length - 1] !== detail) steps.push(detail);
    return { detail, phase: activity.phase, steps: steps.slice(-4), taskId };
}

export function coucouActivityPayload(activity: AgentActivityEvent): Record<string, unknown> {
    const phase = activity.phase;
    const finished = ["succeeded", "finish", "cancelled"].includes(phase);
    const failed = ["failed", "error"].includes(phase);
    return {
        coucou_agent: "kronoscode",
        session_id: activity.sessionid ?? activity.runid ?? "kronterm-hud",
        hook_event_name: finished ? "Stop" : failed ? "StopFailure" : "PreToolUse",
        tool_name: activity.action === "thinking" ? "Think" : "Bash",
        tool_input: { command: agentActivityCaption(activity) },
    };
}

export function sendCoucouActivity(activity: AgentActivityEvent): void {
    const socketPath =
        process.platform === "linux"
            ? path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`, "coucou.sock")
            : path.join(homedir(), "Library/Application Support/NotchBuddy/nb.sock");
    const socket = createConnection(socketPath);
    socket.setTimeout(1_000, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.once("connect", () => socket.end(`${JSON.stringify(coucouActivityPayload(activity))}\n`));
    socket.on("data", () => socket.destroy());
}

const LastCoucouState = new WeakMap<ChildProcess, Map<string, string>>();

export function writeCoucouState(child: ChildProcess | undefined, state: Record<string, unknown>): void {
    if (!child?.stdin?.writable || child.killed) return;
    const previous = LastCoucouState.get(child) ?? new Map<string, string>();
    const changed: Record<string, unknown> = {};
    const serialized = new Map<string, string>();
    for (const [key, value] of Object.entries(state)) {
        const json = JSON.stringify(value);
        if (json == null || (key !== "showChat" && key !== "chatLayout" && previous.get(key) === json)) continue;
        changed[key] = value;
        serialized.set(key, json);
    }
    if (serialized.size === 0) return;
    child.stdin.write(`${JSON.stringify(changed)}\n`);
    for (const [key, json] of serialized) previous.set(key, json);
    LastCoucouState.set(child, previous);
}
