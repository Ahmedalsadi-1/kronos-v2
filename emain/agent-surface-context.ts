// Copyright 2026, KronTerm. SPDX-License-Identifier: Apache-2.0

import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentActivityEvent } from "../frontend/types/agent-activity";

const ActivityContext = new AsyncLocalStorage<{ source: "hermes"; sessionId?: string; ownerTabId?: string }>();

export function runWithAgentActivitySource<T>(
    source: "hermes",
    operation: () => Promise<T>,
    sessionId?: string,
    ownerTabId?: string
): Promise<T> {
    return ActivityContext.run({ source, sessionId, ownerTabId }, operation);
}

export function attributeAgentSurfaceActivity(activity: AgentActivityEvent): AgentActivityEvent {
    const context = ActivityContext.getStore();
    if (!context) return activity;
    return {
        ...activity,
        source: context.source,
        ...(context.ownerTabId ? { ownertabid: context.ownerTabId } : {}),
        ...(context.sessionId
            ? { id: activity.id ?? activity.runid, sessionid: context.sessionId, runid: `hermes:${context.sessionId}` }
            : {}),
    };
}
