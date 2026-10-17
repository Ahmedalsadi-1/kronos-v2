// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { injectedAgentCursorScript, mountAgentCursor } from "@/util/agent-cursor-feedback";
import { useEffect, useRef } from "react";
import { useReducedAgentMotion } from "./use-reduced-agent-motion";

export const CURSOR_OVERLAY_SCRIPT = injectedAgentCursorScript();

export interface CursorOverlayProps {
    cursorPoint?: { x: number; y: number } | null;
    containerRect?: DOMRect | null;
    active?: boolean;
    onCursorMove?: (point: { x: number; y: number; clientX: number; clientY: number }) => void;
    onCursorClick?: (point: { x: number; y: number }) => void;
    triggerClickFlash?: number;
    ringColor?: string;
    dotColor?: string;
    /** Name tag shown beside the agent cursor, e.g. "Hermes · click Save". */
    label?: string;
}

export function CursorOverlay({ cursorPoint, active = true, triggerClickFlash, label }: CursorOverlayProps) {
    const host = useRef<HTMLDivElement>(null);
    const controller = useRef<ReturnType<typeof mountAgentCursor>>(null);
    const lastClick = useRef<number>(undefined);
    const reducedMotion = useReducedAgentMotion();
    useEffect(() => {
        controller.current = mountAgentCursor(host.current);
        return () => controller.current?.destroy();
    }, []);
    useEffect(() => {
        if (!active || !cursorPoint) {
            controller.current?.clear();
            lastClick.current = undefined;
            return;
        }
        const click = triggerClickFlash != null && triggerClickFlash !== lastClick.current;
        lastClick.current = triggerClickFlash;
        controller.current?.update(cursorPoint, label, click, reducedMotion);
    }, [active, cursorPoint, triggerClickFlash, label, reducedMotion]);
    return (
        <div
            ref={host}
            className="__kron-cursor-overlay"
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, zIndex: 2147483647, pointerEvents: "none", overflow: "hidden" }}
        />
    );
}

// ---------------------------------------------------------------------------
// Pet cursor tracking utility
// ---------------------------------------------------------------------------
// Reports cursor positions to the AionUi pet API so the pet can track/eyes-follow.

const PET_ACTIVITY_URL = "http://127.0.0.1:4097/pet/activity";

export function reportCursorToPet(point: { x: number; y: number }, source: "browser" | "sandbox" | "desktop"): void {
    fetch(PET_ACTIVITY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            kind: "tool",
            detail: "cursor " + source,
            cursorPoint: point,
            surfaceActivity: {
                source: "kronoscode-tui",
                phase: "running",
                surface: source === "sandbox" ? "sandbox" : "browser",
                action: "move",
                detail: "cursor overlay",
                point,
            },
        }),
    }).catch(() => {
        // best-effort — pet tracking is non-critical
    });
}
