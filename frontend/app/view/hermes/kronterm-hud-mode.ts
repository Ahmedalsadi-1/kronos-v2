// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import {
    isAgentActivityActive,
    subscribeAgentActivityStream,
    type AgentActivityAction,
    type AgentActivityRisk,
    type AgentActivitySurface,
    type LiveAgentSurfaceActivity,
} from "../../../types/agent-activity";

const HudModeCompletionHoldMs = 5_000;

const HudModeComputerSurfaces: readonly AgentActivitySurface[] = ["desktop", "browser", "sandbox"];

const HudModeToolActions: readonly AgentActivityAction[] = [
    "open",
    "focus",
    "inspect",
    "move",
    "click",
    "doubleClick",
    "type",
    "press",
    "scroll",
    "drag",
    "screenshot",
    "verify",
];

export function isKrontermHudModeActivity(
    activity: Pick<LiveAgentSurfaceActivity, "surface" | "action" | "phase">
): boolean {
    if (!isAgentActivityActive(activity.phase)) {
        return false;
    }
    if (!HudModeComputerSurfaces.includes(activity.surface)) {
        return false;
    }
    return (HudModeToolActions as readonly string[]).includes(activity.action);
}

export interface HudModeToolAnnotations {
    destructiveHint: boolean;
    openWorldHint: boolean;
    readOnlyHint: boolean;
    requiresApproval: boolean;
}

export function annotateHudModeTool(
    activity: Pick<LiveAgentSurfaceActivity, "action" | "surface" | "risk" | "phase">
): HudModeToolAnnotations {
    const destructiveHint = activity.risk === "dangerous";
    const openWorldHint = (HudModeComputerSurfaces as readonly string[]).includes(activity.surface);
    const readOnlyHint =
        activity.action === "inspect" || activity.action === "screenshot" || activity.action === "verify";
    const requiresApproval =
        activity.phase === "awaiting-approval" ||
        destructiveHint ||
        (openWorldHint &&
            !readOnlyHint &&
            (activity.action === "press" ||
                activity.action === "type" ||
                activity.action === "click" ||
                activity.action === "doubleClick" ||
                activity.action === "drag"));
    return { destructiveHint, openWorldHint, readOnlyHint, requiresApproval };
}

export interface KrontermHudModeState {
    active: boolean;
    activity: LiveAgentSurfaceActivity | null;
    elapsedSeconds: number;
    previewUrl?: string;
}

export function useKrontermHudMode(): KrontermHudModeState {
    const [activity, setActivity] = useState<LiveAgentSurfaceActivity | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>();
    const [visible, setVisible] = useState(false);
    const startedAtRef = useRef<Record<string, number>>({});
    const hideTimerRef = useRef<number | undefined>(undefined);
    const currentActivityRef = useRef<LiveAgentSurfaceActivity | null>(null);

    useEffect(() => {
        const unsubscribe = subscribeAgentActivityStream((next) => {
            const current = currentActivityRef.current;
            const finishesCurrent =
                current != null &&
                !isAgentActivityActive(next.phase) &&
                next.runid === current.runid &&
                next.blockid === current.blockid &&
                next.surface === current.surface;
            if (!isKrontermHudModeActivity(next) && !finishesCurrent) {
                return;
            }
            if (hideTimerRef.current != null) {
                window.clearTimeout(hideTimerRef.current);
            }
            const runId = next.runid ?? "default";
            if (current != null && (current.runid !== next.runid || current.blockid !== next.blockid)) {
                setPreviewUrl(undefined);
                delete startedAtRef.current[current.runid ?? "default"];
            }
            if (startedAtRef.current[runId] == null || next.phase === "queued") {
                startedAtRef.current[runId] = next.timestamp;
            }
            setActivity(next);
            currentActivityRef.current = next;
            if (next.previewimageurl != null && next.previewimageurl !== "") {
                setPreviewUrl(next.previewimageurl);
            }
            if (isAgentActivityActive(next.phase)) {
                setVisible(true);
                return;
            }
            hideTimerRef.current = window.setTimeout(() => {
                setVisible(false);
                setActivity(null);
                setPreviewUrl(undefined);
                currentActivityRef.current = null;
                delete startedAtRef.current[runId];
            }, HudModeCompletionHoldMs);
        });
        return () => {
            unsubscribe();
            if (hideTimerRef.current != null) {
                window.clearTimeout(hideTimerRef.current);
            }
        };
    }, []);

    if (!visible || activity == null) {
        return { active: false, activity: null, elapsedSeconds: 0, previewUrl };
    }
    const runId = activity.runid ?? "default";
    const elapsedSeconds = Math.max(
        1,
        Math.round((activity.timestamp - (startedAtRef.current[runId] ?? activity.timestamp)) / 1000)
    );
    return { active: true, activity, elapsedSeconds, previewUrl };
}

export type { AgentActivityRisk };
