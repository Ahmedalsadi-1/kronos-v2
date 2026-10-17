// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    inferAgentActivityAction,
    pointFromAgentActivityInput,
    type AgentActivityAction,
    type AgentActivityEvent,
    type AgentActivitySurface,
} from "../../../types/agent-activity";

export type HermesToolActivityPhase = "running" | "succeeded" | "failed";

export type HermesToolActivity = {
    phase: HermesToolActivityPhase;
    toolId?: string;
    name: string;
    args?: Record<string, unknown>;
    sessionId?: string;
    context?: string;
    agent?: "hermes" | "kronoscode";
};

// These tools already publish precise activity (with points and block targets) from the
// KronTerm tool runtime; reporting them again from the chat stream would double every cursor.
const BridgePublishedToolPattern =
    /^(widget_|kron_computer_|sandbox_|workspace_|canvas_|hud_|kronterm_|terminal_(input|open|scrollback)$|block_|browser_(open|navigate|configure|get_html|open_tab)$|file_(read|list|info|open)$|tab_|lsp_|acp_)/;

const SurfaceRules: Array<[RegExp, AgentActivitySurface]> = [
    [/^(terminal|process|execute_code|shell|bash)$/, "terminal"],
    [/(read_file|write_file|patch|search_files|file|edit|glob|grep)/, "file"],
    [/(browser|web_|navigate|url|vision)/, "browser"],
    [/(computer|desktop|mouse|keyboard|screen)/, "desktop"],
    [/sandbox/, "sandbox"],
];

const ActionOverrides: Record<string, AgentActivityAction> = {
    terminal: "type",
    process: "inspect",
    execute_code: "type",
    read_file: "inspect",
    search_files: "inspect",
    write_file: "type",
    patch: "type",
    web_search: "open",
    web_extract: "open",
    delegate_task: "thinking",
    todo: "thinking",
    memory: "thinking",
    clarify: "wait",
};

export function isBridgePublishedTool(name: string): boolean {
    return BridgePublishedToolPattern.test(name);
}

function surfaceForHermesTool(name: string): AgentActivitySurface {
    const normalized = name.toLowerCase();
    for (const [pattern, surface] of SurfaceRules) {
        if (pattern.test(normalized)) {
            return surface;
        }
    }
    return "panel";
}

function stringArg(args: Record<string, unknown> | undefined, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = args?.[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

function truncate(value: string, max = 72): string {
    const singleLine = value.replace(/\s+/g, " ");
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

// Deliberately excludes command output, file contents, and secrets: activity history is
// display-only and may be shown over any surface.
export function describeHermesTool(name: string, args?: Record<string, unknown>, context?: string): string {
    const target =
        stringArg(args, ["path", "file_path", "url", "query", "pattern", "goal", "title"]) ??
        (name === "terminal" ? stringArg(args, ["command"])?.split(/\s+/)[0] : undefined);
    const verb = name.replace(/^mcp__[^_]+__/, "").replace(/_/g, " ");
    if (target) {
        return truncate(`${verb} · ${target}`);
    }
    if (context?.trim()) {
        return truncate(`${verb} · ${context.trim()}`);
    }
    return truncate(verb);
}

export function hermesToolActivityToAgentActivity(activity: HermesToolActivity): AgentActivityEvent | null {
    // KronosCode runs over ACP, which emain already publishes with exact tool inputs.
    if (!activity.name || activity.agent === "kronoscode" || isBridgePublishedTool(activity.name)) {
        return null;
    }
    const surface = surfaceForHermesTool(activity.name);
    const action = ActionOverrides[activity.name] ?? inferAgentActivityAction(activity.name);
    const blockid = stringArg(activity.args, ["blockId", "blockid", "block_id"]);
    return {
        id: activity.toolId ? `hermes:${activity.toolId}` : undefined,
        runid: activity.sessionId ? `hermes:${activity.sessionId}` : undefined,
        sessionid: activity.sessionId,
        source: "hermes",
        phase: activity.phase,
        surface,
        action,
        blockid,
        detail: describeHermesTool(activity.name, activity.args, activity.context),
        point: pointFromAgentActivityInput(activity.args),
        risk: surface === "terminal" || action === "type" ? "write" : "read",
    };
}

export const AgentTakeoverEvent = "kronterm:agent-takeover";

type TakeoverApi = {
    requestAgentTakeover?: (sessionId?: string) => void;
    onAgentTakeover?: (callback: (sessionId?: string) => void) => () => void;
};

function takeoverApi(): TakeoverApi | undefined {
    return (window as unknown as { api?: TakeoverApi }).api;
}

/**
 * The user reclaimed control from the agent. Routed through the main process so the
 * Hermes HUD window and floating islands (separate renderers) stop their turns too.
 */
export function requestAgentTakeover(sessionId?: string): void {
    const api = takeoverApi();
    if (api?.requestAgentTakeover != null) {
        api.requestAgentTakeover(sessionId);
        return;
    }
    window.dispatchEvent(new CustomEvent(AgentTakeoverEvent, { detail: sessionId }));
}

export function subscribeAgentTakeover(listener: (sessionId?: string) => void): () => void {
    const api = takeoverApi();
    if (api?.onAgentTakeover != null) {
        return api.onAgentTakeover(listener);
    }
    const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
    window.addEventListener(AgentTakeoverEvent, handler);
    return () => window.removeEventListener(AgentTakeoverEvent, handler);
}
