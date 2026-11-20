// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type PenTaskAction = {
    id: string;
    title: string;
    timestamp: number;
    status: "running" | "completed" | "failed";
    blockId?: string;
    result?: string;
    image?: string;
};
export type PenTaskGroup = {
    id: string;
    title: string;
    status: "running" | "completed" | "failed";
    tabIds: string[];
    actions: PenTaskAction[];
};

export function updatePenTask(groups: PenTaskGroup[], task: Omit<PenTaskGroup, "actions" | "tabIds">,
    ownedIds: string[], action?: PenTaskAction): PenTaskGroup[] {
    const prior = groups.find(({ id }) => id === task.id);
    const actions = prior?.actions ?? [];
    const next: PenTaskGroup = {
        ...task,
        tabIds: [...new Set([...(prior?.tabIds ?? []), ...ownedIds])],
        actions: action
            ? [...actions.filter(({ id }) => id !== action.id), { ...actions.find(({ id }) => id === action.id), ...action }]
                .sort((a, b) => a.timestamp - b.timestamp).slice(-24)
            : actions,
    };
    return prior ? groups.map((group) => group.id === task.id ? next : group) : [...groups, next];
}
