// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    isAgentActivityActive,
    type AgentActivitySource,
    type AgentActivitySurface,
    type LiveAgentSurfaceActivity,
} from "../../types/agent-activity";

export type OSAgentPresence = {
    key: string;
    agent: string;
    detail: string;
    action: LiveAgentSurfaceActivity["action"];
    surface: AgentActivitySurface;
    blockId?: string;
    awaitingApproval: boolean;
    timestamp: number;
};

export type OSAgentPresenceWindow = { blockId: string; view: string };

// A tool that never reports completion (crashed agent, dropped IPC) must not hold a
// window in the "agent is driving" state forever.
export const OSAgentPresenceStaleMs = 45_000;

const SurfaceViews: Record<AgentActivitySurface, string[]> = {
    browser: ["web"],
    desktop: ["appstream"],
    file: ["preview", "codeeditor"],
    panel: [],
    sandbox: ["sandbox"],
    terminal: ["term"],
};

export function agentLabelForSource(source: AgentActivitySource | undefined): string {
    if (source === "hermes") {
        return "KronTerm Agent";
    }
    if (source === "acp" || source === "kronoscode-tui") {
        return "KronosCode";
    }
    return "KronTerm Agent";
}

function presenceKey(activity: LiveAgentSurfaceActivity): string {
    return (
        activity.id ?? `${activity.runid ?? activity.sessionid ?? "run"}:${activity.surface}:${activity.blockid ?? ""}`
    );
}

/** Latest state per activity, keeping only ones still in flight and not stale. */
export function activeAgentPresences(activities: LiveAgentSurfaceActivity[], now = Date.now()): OSAgentPresence[] {
    const latest = new Map<string, LiveAgentSurfaceActivity>();
    for (const activity of activities) {
        latest.set(presenceKey(activity), activity);
    }
    const presences: OSAgentPresence[] = [];
    for (const [key, activity] of latest) {
        if (!isAgentActivityActive(activity.phase) || now - activity.timestamp > OSAgentPresenceStaleMs) {
            continue;
        }
        if (activity.action === "thinking" && activity.surface === "panel") {
            continue;
        }
        presences.push({
            key,
            agent: agentLabelForSource(activity.source),
            detail: activity.detail ?? activity.action,
            action: activity.action,
            surface: activity.surface,
            blockId: activity.blockid,
            awaitingApproval: activity.phase === "awaiting-approval",
            timestamp: activity.timestamp,
        });
    }
    return presences.sort((left, right) => left.timestamp - right.timestamp);
}

/**
 * Maps presences onto live OS windows. Block-targeted activity wins; untargeted
 * activity only claims a window when exactly one window of the matching view exists,
 * so a single terminal command never lights up every terminal.
 */
export function assignAgentPresencesToWindows(
    presences: OSAgentPresence[],
    windows: OSAgentPresenceWindow[]
): Map<string, OSAgentPresence> {
    const assigned = new Map<string, OSAgentPresence>();
    const windowIds = new Set(windows.map((window) => window.blockId));
    for (const presence of presences) {
        if (presence.blockId != null && windowIds.has(presence.blockId)) {
            assigned.set(presence.blockId, presence);
            continue;
        }
        if (presence.blockId != null) {
            continue;
        }
        const views = SurfaceViews[presence.surface];
        const candidates = windows.filter((window) => views.includes(window.view));
        if (candidates.length === 1 && !assigned.has(candidates[0].blockId)) {
            assigned.set(candidates[0].blockId, presence);
        }
    }
    return assigned;
}

export function describeAgentPresence(presence: OSAgentPresence): string {
    if (presence.awaitingApproval) {
        return `${presence.agent} needs approval`;
    }
    return `${presence.agent} · ${presence.detail}`;
}
