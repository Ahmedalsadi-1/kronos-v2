// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type OSChannelBot = {
    id: string;
    name: string;
    role: "chief" | "specialist";
    instructions: string;
    title?: string;
    description?: string;
    color?: string;
    expression?: "idle" | "thinking" | "working" | "finished" | "sleeping";
    team?: string;
    skills?: string;
    memory?: string;
    routines?: string;
    folder?: string;
    model?: string;
    approval?: "ask" | "auto";
    voice?: boolean;
    alerts?: boolean;
};

export type OSChannelSetupDraft = {
    version: 1;
    status: "draft" | "active";
    upstreamGroupId?: string;
    engine: "kronoscode";
    companion: "coucou";
    context?: string;
    memberIds?: string[];
    bots: OSChannelBot[];
};
