// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { subscribeAgentActivityStream, type LiveAgentSurfaceActivity } from "../../types/agent-activity";
import { agentLabelForSource } from "../tab/os-agent-presence";

interface OverlayMarker {
    id: string;
    actionType: string;
    label?: string;
    x: number;
    y: number;
}

interface AgentOverlayState {
    waterflowActive: boolean;
    markers: OverlayMarker[];
    cursorPoint: { x: number; y: number } | null;
    cursorActive: boolean;
    cursorLabel?: string;
    clickFlashCount?: number;
}

export function matchesAgentOverlayTarget(
    activity: Pick<LiveAgentSurfaceActivity, "surface" | "blockid" | "surfaceid">,
    surface?: string,
    blockId?: string,
    surfaceId?: string
): boolean {
    if (surface != null && activity.surface !== surface) {
        return false;
    }
    if (blockId != null && activity.blockid !== blockId) {
        return false;
    }
    if (surfaceId != null && activity.surfaceid !== surfaceId) return false;
    return true;
}

export function createAgentOverlayOwner() {
    let owner: string;
    let timestamp = -Infinity;
    const retired = new Set<string>();
    return (activity: LiveAgentSurfaceActivity): "reset" | "update" | "clear" | undefined => {
        const key = activity.runid ?? activity.sessionid ?? activity.source;
        if (retired.has(key) || activity.timestamp < timestamp) {
            return;
        }
        const active = activity.phase === "queued" || activity.phase === "running" || activity.phase === "verifying";
        if (!active) {
            if (owner !== key) {
                return;
            }
            timestamp = activity.timestamp;
            if (
                activity.runid &&
                (activity.phase === "succeeded" || activity.phase === "failed" || activity.phase === "cancelled")
            ) {
                retired.add(key);
            }
            return "clear";
        }
        if (activity.action === "thinking" || activity.action === "wait") {
            return;
        }
        const changed = owner !== key;
        if (changed && owner != null) {
            retired.add(owner);
            if (retired.size > 120) {
                retired.delete(retired.values().next().value);
            }
        }
        owner = key;
        timestamp = activity.timestamp;
        return changed ? "reset" : "update";
    };
}

export function useAgentOverlays(surface?: string, blockId?: string, surfaceId?: string): AgentOverlayState {
    const [waterflowActive, setWaterflowActive] = useState(false);
    const [markers, setMarkers] = useState<OverlayMarker[]>([]);
    const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
    const [cursorActive, setCursorActive] = useState(false);
    const [clickFlashCount, setClickFlashCount] = useState<number>();
    const [cursorLabel, setCursorLabel] = useState<string>();

    useEffect(() => {
        setWaterflowActive(false);
        setMarkers([]);
        setCursorPoint(null);
        setCursorActive(false);
        setCursorLabel(undefined);
        setClickFlashCount(undefined);
        const acceptActivity = createAgentOverlayOwner();
        let expiry: ReturnType<typeof setTimeout>;
        let currentActivity: LiveAgentSurfaceActivity;
        const dim = () => {
            setWaterflowActive(false);
            setCursorActive(false);
            setCursorPoint(null);
            setMarkers([]);
            setCursorLabel(undefined);
            setClickFlashCount(undefined);
        };
        const unsub = subscribeAgentActivityStream((activity: LiveAgentSurfaceActivity) => {
            if (!matchesAgentOverlayTarget(activity, surface, blockId, surfaceId)) {
                return;
            }
            const ownership = acceptActivity(activity);
            if (ownership == null) {
                return;
            }
            clearTimeout(expiry);
            if (ownership === "clear") {
                if (activity.phase === "succeeded") {
                    setWaterflowActive(false);
                    expiry = setTimeout(dim, 3000);
                } else {
                    dim();
                }
                return;
            }
            currentActivity = activity;
            if (ownership === "reset") {
                dim();
            }
            expiry = setTimeout(dim, 15_000);
            if (activity.phase === "queued") {
                setWaterflowActive(true);
                return;
            }

            if (activity.phase === "running" || activity.phase === "verifying") {
                setWaterflowActive(true);
                if (activity.point && activity.surface !== "terminal") {
                    setCursorPoint(activity.point);
                    setCursorActive(true);
                    setCursorLabel(
                        activity.detail
                            ? `${agentLabelForSource(activity.source)} · ${activity.detail}`
                            : agentLabelForSource(activity.source)
                    );
                    if (activity.action === "click" || activity.action === "doubleClick") {
                        setClickFlashCount((count) => (count ?? 0) + 1);
                    }
                    setMarkers((prev) => {
                        const marker = {
                            id: activity.id ?? `${activity.action}-${Date.now()}`,
                            actionType: activity.action,
                            label: activity.detail,
                            x: activity.point!.x,
                            y: activity.point!.y,
                        };
                        if (prev.length >= 8) {
                            return [...prev.slice(-7), marker];
                        }
                        return [...prev, marker];
                    });
                }
                return;
            }
        });
        const pointer = (event: Event) => {
            const detail = (event as CustomEvent<{ blockId: string; point: { x: number; y: number }; action: string }>)
                .detail;
            if (!detail || detail.blockId !== blockId || !["browser", "desktop", "sandbox"].includes(surface)) return;
            clearTimeout(expiry);
            expiry = setTimeout(dim, 3000);
            setCursorPoint(detail.point);
            setCursorActive(true);
            setCursorLabel(
                currentActivity
                    ? `${agentLabelForSource(currentActivity.source)} · ${currentActivity.detail ?? detail.action}`
                    : `Agent · ${detail.action}`
            );
            if (detail.action === "click" || detail.action === "longpress") {
                setClickFlashCount((count) => (count ?? 0) + 1);
            }
        };
        window.addEventListener("kron-agent-pointer", pointer);
        return () => {
            clearTimeout(expiry);
            window.removeEventListener("kron-agent-pointer", pointer);
            unsub();
        };
    }, [surface, blockId, surfaceId]);

    return { waterflowActive, markers, cursorPoint, cursorActive, cursorLabel, clickFlashCount };
}
