// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { dispatchComputerUseControl } from "@/app/components/computer-use-status-card";
import { requestAgentTakeover } from "@/app/view/hermes/hermes-tool-activity";
import { createAgentOverlayOwner } from "@/app/view/use-agent-overlays";
import {
    isAgentActivityActive,
    publishAgentActivity,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "@/types/agent-activity";
import { useEffect, useRef, useState } from "react";
import "./agent-takeover-bar.css";

export function AgentTakeoverBar({
    blockId,
    active = false,
    onTakeOver,
}: {
    blockId: string;
    active?: boolean;
    onTakeOver?: () => void;
}) {
    const [activity, setActivity] = useState<LiveAgentSurfaceActivity>();
    const retired = useRef<string>(undefined);
    useEffect(() => {
        let expiry: ReturnType<typeof setTimeout>;
        const accept = createAgentOverlayOwner();
        const unsubscribe = subscribeAgentActivityStream((next) => {
            if (next.blockid !== blockId) return;
            const owner = next.runid ?? next.sessionid ?? next.source;
            if (owner === retired.current || accept(next) == null) return;
            clearTimeout(expiry);
            setActivity(isAgentActivityActive(next.phase) ? next : undefined);
            if (isAgentActivityActive(next.phase)) expiry = setTimeout(() => setActivity(undefined), 15000);
        });
        return () => {
            clearTimeout(expiry);
            unsubscribe();
        };
    }, [blockId]);
    if (!active && !activity) return null;
    const control = (action: "takeover" | "cancel") => {
        if (onTakeOver) {
            onTakeOver();
            return;
        }
        if (!activity) return;
        retired.current = activity.runid ?? activity.sessionid ?? activity.source;
        dispatchComputerUseControl(action, activity);
        if (!activity.sessionid) requestAgentTakeover();
        publishAgentActivity({ ...activity, phase: action === "cancel" ? "cancelled" : "paused" });
        setActivity(undefined);
    };
    return (
        <aside className="agent-takeover-bar" aria-label="Agent surface control">
            <span className="agent-takeover-grip" aria-hidden="true">
                Ⅱ
            </span>
            <svg className="agent-takeover-indicator" viewBox="0 0 20 20" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                    <rect
                        key={index}
                        x="9"
                        y="1"
                        width="2"
                        height="5"
                        rx="1"
                        fill="currentColor"
                        opacity={0.25 + index * 0.1}
                        transform={`rotate(${index * 45} 10 10)`}
                    />
                ))}
            </svg>
            <span className="agent-takeover-copy">
                <span className="agent-takeover-title">
                    {activity?.appname || `KronTerm ${activity?.surface ?? "browser"} control`}
                </span>
                <span className="agent-takeover-status">Agent is in control</span>
            </span>
            <button type="button" onClick={() => control("takeover")}>
                Take over
            </button>
            <button type="button" className="agent-takeover-stop" onClick={() => control("cancel")}>
                Stop
            </button>
        </aside>
    );
}
