// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type KronOSV2AgentPointerDetail = {
    blockId: string;
    point: { x: number; y: number };
    action: string;
    scrollAxis?: "x" | "y";
    typingDurationMs?: number;
    followDelayMs?: number;
    target?: { x: number; y: number; width: number; height: number };
};

export const KronOSV2AgentPointerEvent = "kronos-v2-agent-pointer";
export const KronOSV2AgentFollowPauseEvent = "kronos-v2-agent-follow-pause";
