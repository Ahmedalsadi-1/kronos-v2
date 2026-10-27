// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
export type AgentBotTask = { threadId: string; title: string; busy?: boolean };
export type AgentBot = { id: string; name: string; threadId: string; tasks: AgentBotTask[] };
export type AgentBotMessage = {
    id: string;
    role: "bot" | "user";
    kind: string;
    text?: string;
    at: number;
    card?: {
        title: string;
        requestId?: string;
        requestType?: string;
        answered?: boolean;
        dismissed?: boolean;
        expired?: boolean;
    };
    tool?: { name: string; summary?: string; output?: string; ok?: boolean };
};
export type AgentBotCommand =
    | { action: "list" }
    | { action: "history" | "interrupt"; botId: string; threadId: string; before?: string }
    | { action: "send"; botId: string; threadId: string; text: string; sendId: string };
export type AgentBotResult = {
    bots?: AgentBot[];
    messages?: AgentBotMessage[];
    hasMore?: boolean;
    busy?: boolean;
    ok?: boolean;
};
