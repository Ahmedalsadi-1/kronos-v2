// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAgentOverlays } from "@/app/view/use-agent-overlays";
import { useReducedAgentMotion } from "@/app/view/use-reduced-agent-motion";
import "./agent-block-aura.css";

export function AgentBlockAura({
    blockId,
    enabled = true,
    active = false,
}: {
    blockId: string;
    enabled?: boolean;
    active?: boolean;
}) {
    const { waterflowActive } = useAgentOverlays(undefined, blockId);
    const reducedMotion = useReducedAgentMotion();
    return (
        <div
            className="agent-block-aura"
            data-active={(enabled && (active || waterflowActive)) || undefined}
            data-reduced-motion={reducedMotion || undefined}
            aria-hidden="true"
        >
            <div className="agent-block-aura-haze" />
        </div>
    );
}
