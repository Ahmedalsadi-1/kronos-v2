// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    activeAgentPresences,
    assignAgentPresencesToWindows,
    OSAgentPresenceStaleMs,
    type OSAgentPresence,
} from "@/app/tab/os-agent-presence";
import { cn } from "@/util/util";
import { memo, useEffect, useState } from "react";
import { subscribeAgentActivityStream, type LiveAgentSurfaceActivity } from "../../types/agent-activity";

const PresenceHistoryLimit = 60;

/**
 * Tracks what agents are doing right now. Re-evaluates on a timer so presences
 * expire even when a completion event is lost.
 */
export function useAgentPresences(): OSAgentPresence[] {
    const [activities, setActivities] = useState<LiveAgentSurfaceActivity[]>([]);
    const [now, setNow] = useState(() => Date.now());
    useEffect(
        () =>
            subscribeAgentActivityStream((activity) => {
                setActivities((current) => [...current, activity].slice(-PresenceHistoryLimit));
                setNow(Date.now());
            }),
        []
    );
    const presences = activeAgentPresences(activities, now);
    const hasPresence = presences.length > 0;
    useEffect(() => {
        if (!hasPresence) {
            return;
        }
        const timer = window.setInterval(() => setNow(Date.now()), Math.min(5_000, OSAgentPresenceStaleMs));
        return () => window.clearInterval(timer);
    }, [hasPresence]);
    return presences;
}

export function useAgentPresenceForBlock(blockId: string, view: string): OSAgentPresence | undefined {
    const presences = useAgentPresences();
    return assignAgentPresencesToWindows(presences, [{ blockId, view }]).get(blockId);
}

export const AgentControlIndicator = memo(
    ({ presence, className }: { presence?: OSAgentPresence; className?: string }) => {
        if (presence == null) {
            return null;
        }
        return (
            <>
                <div
                    aria-hidden="true"
                    className={cn(
                        "pointer-events-none absolute inset-0 z-[40] rounded-[inherit] ring-2 ring-inset",
                        presence.awaitingApproval ? "ring-amber-400/80" : "ring-accent/70",
                        className
                    )}
                />
            </>
        );
    }
);
AgentControlIndicator.displayName = "AgentControlIndicator";
