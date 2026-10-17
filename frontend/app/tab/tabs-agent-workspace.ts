import { resolveBlockView } from "@/app/block/retired-chat-view";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const TabsAgentCompanionRequestEvent = "kronterm:tabs-agent-companion";
const TabsAgentCompanionPromoteEvent = "kronterm:tabs-agent-companion-promote";

const AgentChatViews = new Set(["hermes"]);

type TabsAgentCompanionRequest = {
    blockId: string;
};

function isAgentChatView(view: string): boolean {
    return AgentChatViews.has(resolveBlockView(view));
}

function requestTabsAgentCompanion(blockId: string): void {
    if (typeof window === "undefined" || !blockId.trim()) {
        return;
    }
    window.dispatchEvent(
        new CustomEvent<TabsAgentCompanionRequest>(TabsAgentCompanionRequestEvent, {
            detail: { blockId: blockId.trim() },
        })
    );
}

function promoteTabsAgentCompanion(blockId: string): void {
    if (typeof window === "undefined" || !blockId.trim()) {
        return;
    }
    window.dispatchEvent(
        new CustomEvent<TabsAgentCompanionRequest>(TabsAgentCompanionPromoteEvent, {
            detail: { blockId: blockId.trim() },
        })
    );
}

export {
    isAgentChatView,
    promoteTabsAgentCompanion,
    requestTabsAgentCompanion,
    TabsAgentCompanionPromoteEvent,
    TabsAgentCompanionRequestEvent,
    type TabsAgentCompanionRequest,
};
