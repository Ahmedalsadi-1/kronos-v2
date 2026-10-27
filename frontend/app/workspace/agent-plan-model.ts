// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { LiveAgentSurfaceActivity } from "@/types/agent-activity";

export type AgentPlanTask = {
    id: string;
    label: string;
    status: "pending" | "running" | "done" | "failed";
    children: AgentPlanTask[];
};

export function activityToPlan(events: LiveAgentSurfaceActivity[]): AgentPlanTask[] {
    const tasks = new Map<string, AgentPlanTask>();
    const parents = new Map<string, string>();
    for (const event of events) {
        const id = event.id ?? `${event.runid ?? "default"}:${event.blockid ?? event.surface}:${event.action}`;
        const status =
            event.phase === "succeeded"
                ? "done"
                : ["failed", "cancelled", "degraded"].includes(event.phase)
                  ? "failed"
                  : ["running", "verifying"].includes(event.phase)
                    ? "running"
                    : "pending";
        tasks.set(id, {
            id,
            label: event.detail || `${event.action} ${event.appname || event.surface}`,
            status,
            children: [],
        });
        if (event.parentid) parents.set(id, event.parentid);
    }
    const roots: AgentPlanTask[] = [];
    for (const task of tasks.values()) {
        const parentId = parents.get(task.id);
        let cursor = parentId;
        const seen = new Set([task.id]);
        while (cursor && !seen.has(cursor)) {
            seen.add(cursor);
            cursor = parents.get(cursor);
        }
        const parent = parentId && tasks.get(parentId);
        if (parent && !cursor) parent.children.push(task);
        else roots.push(task);
    }
    return roots;
}
