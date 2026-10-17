// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getWorkspaceSurfaceModeProvider } from "@/app/tab/workspace-surface-runtime";
import { globalStore } from "@/app/store/jotaiStore";
import { atoms, refocusNode } from "@/store/global";
import {
    isAgentActivityActive,
    subscribeAgentActivityStream,
} from "../../types/agent-activity";

// The activity stream emits an event per agent action (click, type, scroll…).
// Re-focusing on every one of those would yank focus constantly while the
// agent works one widget; only a genuinely NEW target moves the view.
const FollowCooldownMs = 1_500;

let lastFollowedBlockId: string | undefined;
let lastFollowedAt = 0;

/**
 * When the agent starts working on a widget, the workspace follows it: the
 * used block takes focus in whatever presentation is mounted. Focus routes
 * through the active presentation's surface provider (widgets / tabs / canvas
 * / OS all register one); `refocusNode` is the fallback for unmounted
 * presentations.
 */
export function installAgentFollow(): () => void {
    return subscribeAgentActivityStream((activity) => {
        if (!isAgentActivityActive(activity.phase) || activity.surface === "panel") {
            return;
        }

        const blockId = activity.blockid?.trim();
        if (!blockId) {
            return;
        }

        const now = Date.now();
        if (blockId === lastFollowedBlockId && now - lastFollowedAt < FollowCooldownMs) {
            return;
        }
        lastFollowedBlockId = blockId;
        lastFollowedAt = now;

        followBlock(blockId);
    });
}

function followBlock(blockId: string): void {
    const tabId = globalStore.get(atoms.staticTabId);
    const provider = getWorkspaceSurfaceModeProvider(tabId);

    if (!provider) {
        refocusNode(blockId);
        return;
    }

    void Promise.resolve(provider.control({ action: "focus", blockid: blockId }))
        .then((result) => {
            if (!result.success) {
                refocusNode(blockId);
            }
        })
        .catch(() => refocusNode(blockId));
}
