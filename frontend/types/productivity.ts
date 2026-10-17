// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type ProductivityTask = {
    id: string;
    title: string;
    status: "open" | "completed" | "deleted";
    createdAt: number;
    updatedAt: number;
    dueAt?: number;
    notifiedAt?: number;
};
export type ProductivityNote = {
    id: string;
    title: string;
    body: string;
    createdAt: number;
    updatedAt: number;
    deleted: boolean;
};
export type ProductivityHabit = {
    id: string;
    title: string;
    target: number;
    progress: Record<string, number>;
    archived: boolean;
    snoozedUntil?: number;
    createdAt: number;
    updatedAt: number;
};
export type ProductivityFocus = {
    id: string;
    label: string;
    status: "running" | "paused" | "completed" | "stopped";
    startedAt: number;
    updatedAt: number;
    plannedMs: number;
    remainingMs: number;
    runningMs: number;
    finishedAt?: number;
};
export type ProductivityActivity = {
    id: string;
    kind: "agent" | "workspace" | "focus";
    label: string;
    occurredAt: number;
    durationMs?: number;
};
export type ProductivityState = {
    version: 1;
    tasks: ProductivityTask[];
    notes: ProductivityNote[];
    habits: ProductivityHabit[];
    focus: ProductivityFocus[];
    activity: ProductivityActivity[];
    preferences: { activityEnabled: boolean; blockedSites: string[]; blockedApps: string[] };
};
export type ProductivityAction =
    | { type: "task.save"; id?: string; title: string; dueAt?: number }
    | { type: "task.status"; id: string; status: ProductivityTask["status"] }
    | { type: "task.snooze"; id: string; minutes: number }
    | { type: "note.save"; id?: string; title: string; body: string }
    | { type: "note.delete"; id: string; deleted: boolean }
    | { type: "habit.save"; id?: string; title: string; target: number }
    | { type: "habit.progress"; id: string; date: string; delta: number }
    | { type: "habit.archive"; id: string; archived: boolean }
    | { type: "habit.snooze"; id: string; minutes: number }
    | { type: "focus.start"; label: string; minutes: number }
    | { type: "focus.pause" | "focus.resume" | "focus.stop" }
    | { type: "focus.extend"; minutes: number }
    | { type: "preferences.save"; activityEnabled: boolean; blockedSites: string[]; blockedApps: string[] }
    | { type: "activity.clear" };

export function emptyProductivityState(): ProductivityState {
    return {
        version: 1,
        tasks: [],
        notes: [],
        habits: [],
        focus: [],
        activity: [],
        preferences: { activityEnabled: false, blockedSites: [], blockedApps: [] },
    };
}

export function productivitySummary(state: ProductivityState, now = Date.now()) {
    const focus = state.focus.find((row) => row.status === "running" || row.status === "paused");
    return {
        focus: focus
            ? { label: focus.label, status: focus.status, remainingMs: focus.remainingMs, updatedAt: focus.updatedAt }
            : null,
        openTasks: state.tasks.filter((row) => row.status === "open").length,
        dueTasks: state.tasks.filter((row) => row.status === "open" && row.dueAt != null && row.dueAt <= now).length,
        habits: state.habits.filter((row) => !row.archived && !(row.snoozedUntil > now)).length,
    };
}
