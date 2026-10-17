// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
    emptyProductivityState,
    type ProductivityAction,
    type ProductivityState,
} from "../frontend/types/productivity";

const Text = z.string().trim().min(1).max(300);
const Id = z.string().uuid();
const Time = z.number().int().min(0).max(8_640_000_000_000_000);
const Minutes = z.number().int().min(1).max(1440);
const Preferences = z.object({
    activityEnabled: z.boolean(),
    blockedSites: z.array(z.string().trim().min(1).max(253)).max(100),
    blockedApps: z.array(z.string().trim().min(1).max(200)).max(100),
});
const ActionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("task.save"), id: Id.optional(), title: Text, dueAt: Time.optional() }),
    z.object({ type: z.literal("task.status"), id: Id, status: z.enum(["open", "completed", "deleted"]) }),
    z.object({ type: z.literal("task.snooze"), id: Id, minutes: Minutes }),
    z.object({ type: z.literal("note.save"), id: Id.optional(), title: Text, body: z.string().max(100_000) }),
    z.object({ type: z.literal("note.delete"), id: Id, deleted: z.boolean() }),
    z.object({
        type: z.literal("habit.save"),
        id: Id.optional(),
        title: Text,
        target: z.number().int().min(1).max(1000),
    }),
    z.object({
        type: z.literal("habit.progress"),
        id: Id,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        delta: z.number().int().min(-1000).max(1000),
    }),
    z.object({ type: z.literal("habit.archive"), id: Id, archived: z.boolean() }),
    z.object({ type: z.literal("habit.snooze"), id: Id, minutes: Minutes }),
    z.object({ type: z.literal("focus.start"), label: Text, minutes: Minutes }),
    z.object({ type: z.enum(["focus.pause", "focus.resume", "focus.stop"]) }),
    z.object({ type: z.literal("focus.extend"), minutes: Minutes }),
    Preferences.extend({ type: z.literal("preferences.save") }),
    z.object({ type: z.literal("activity.clear") }),
]);
const StateSchema = z.object({
    version: z.literal(1),
    tasks: z
        .array(
            z.object({
                id: Id,
                title: Text,
                status: z.enum(["open", "completed", "deleted"]),
                createdAt: Time,
                updatedAt: Time,
                dueAt: Time.optional(),
                notifiedAt: Time.optional(),
            })
        )
        .max(5000),
    notes: z
        .array(
            z.object({
                id: Id,
                title: Text,
                body: z.string().max(100_000),
                createdAt: Time,
                updatedAt: Time,
                deleted: z.boolean(),
            })
        )
        .max(5000),
    habits: z
        .array(
            z.object({
                id: Id,
                title: Text,
                target: z.number().int().min(1).max(1000),
                progress: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.number().int().min(0).max(1000)),
                archived: z.boolean(),
                snoozedUntil: Time.optional(),
                createdAt: Time,
                updatedAt: Time,
            })
        )
        .max(5000),
    focus: z
        .array(
            z.object({
                id: Id,
                label: Text,
                status: z.enum(["running", "paused", "completed", "stopped"]),
                startedAt: Time,
                updatedAt: Time,
                plannedMs: Time,
                remainingMs: Time,
                runningMs: Time,
                finishedAt: Time.optional(),
            })
        )
        .max(5000),
    activity: z
        .array(
            z.object({
                id: Id,
                kind: z.enum(["agent", "workspace", "focus"]),
                label: Text,
                occurredAt: Time,
                durationMs: Time.optional(),
            })
        )
        .max(1000),
    preferences: Preferences,
});

function copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export class ProductivityStore {
    private state: ProductivityState;
    private listeners = new Set<(state: ProductivityState) => void>();
    private lastCheckpoint = 0;

    constructor(
        private file: string,
        private clock = Date.now
    ) {
        this.state = fs.existsSync(file)
            ? (StateSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))) as ProductivityState)
            : emptyProductivityState();
        // Offline spans are unknown; resume explicitly rather than inventing recorded focus time.
        for (const focus of this.state.focus.filter((row) => row.status === "running")) {
            focus.status = "paused";
            focus.updatedAt = clock();
        }
        this.persist(this.state);
    }

    snapshot(): ProductivityState {
        const state = copy(this.state);
        this.advanceFocus(state, this.clock());
        return state;
    }

    subscribe(listener: (state: ProductivityState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private persist(state: ProductivityState): void {
        StateSchema.parse(state);
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
            fs.renameSync(temporary, this.file);
        } finally {
            fs.rmSync(temporary, { force: true });
        }
    }

    private commit(state: ProductivityState): ProductivityState {
        this.persist(state);
        this.state = state;
        this.lastCheckpoint = this.clock();
        const snapshot = this.snapshot();
        for (const listener of this.listeners) listener(copy(snapshot));
        return snapshot;
    }

    private advanceFocus(state: ProductivityState, now: number): void {
        for (const focus of state.focus.filter((row) => row.status === "running")) {
            const elapsed = Math.min(focus.remainingMs, Math.max(0, now - focus.updatedAt));
            focus.remainingMs -= elapsed;
            focus.runningMs += elapsed;
            focus.updatedAt = now;
            if (focus.remainingMs === 0) {
                focus.status = "completed";
                focus.finishedAt = now;
            }
        }
    }

    command(input: unknown): ProductivityState {
        const action = ActionSchema.parse(input) as ProductivityAction;
        const now = this.clock();
        const draft = this.snapshot();
        const find = <T extends { id: string }>(rows: T[], id: string): T => {
            const row = rows.find((entry) => entry.id === id);
            if (!row) throw new Error("Item no longer exists");
            return row;
        };
        switch (action.type) {
            case "task.save": {
                const row = action.id
                    ? find(draft.tasks, action.id)
                    : { id: randomUUID(), title: "", status: "open" as const, createdAt: now, updatedAt: now };
                Object.assign(row, { title: action.title, dueAt: action.dueAt, updatedAt: now, notifiedAt: undefined });
                if (!action.id) draft.tasks.unshift(row);
                break;
            }
            case "task.status":
                Object.assign(find(draft.tasks, action.id), {
                    status: action.status,
                    updatedAt: now,
                    notifiedAt: undefined,
                });
                break;
            case "task.snooze":
                Object.assign(find(draft.tasks, action.id), {
                    dueAt: now + action.minutes * 60_000,
                    status: "open",
                    notifiedAt: undefined,
                    updatedAt: now,
                });
                break;
            case "note.save": {
                const row = action.id
                    ? find(draft.notes, action.id)
                    : { id: randomUUID(), title: "", body: "", deleted: false, createdAt: now, updatedAt: now };
                Object.assign(row, { title: action.title, body: action.body, updatedAt: now });
                if (!action.id) draft.notes.unshift(row);
                break;
            }
            case "note.delete":
                Object.assign(find(draft.notes, action.id), { deleted: action.deleted, updatedAt: now });
                break;
            case "habit.save": {
                const row = action.id
                    ? find(draft.habits, action.id)
                    : {
                          id: randomUUID(),
                          title: "",
                          target: 1,
                          progress: {},
                          archived: false,
                          createdAt: now,
                          updatedAt: now,
                      };
                Object.assign(row, { title: action.title, target: action.target, updatedAt: now });
                if (!action.id) draft.habits.unshift(row);
                break;
            }
            case "habit.progress": {
                const row = find(draft.habits, action.id);
                const parsed = new Date(`${action.date}T12:00:00Z`);
                if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== action.date)
                    throw new Error("Invalid habit date");
                row.progress[action.date] = Math.max(
                    0,
                    Math.min(1000, (row.progress[action.date] ?? 0) + action.delta)
                );
                row.updatedAt = now;
                break;
            }
            case "habit.archive":
                Object.assign(find(draft.habits, action.id), { archived: action.archived, updatedAt: now });
                break;
            case "habit.snooze":
                Object.assign(find(draft.habits, action.id), {
                    snoozedUntil: now + action.minutes * 60_000,
                    updatedAt: now,
                });
                break;
            case "focus.start": {
                if (draft.focus.some((row) => row.status === "running" || row.status === "paused"))
                    throw new Error("Stop or finish the current focus session first");
                draft.focus.unshift({
                    id: randomUUID(),
                    label: action.label,
                    status: "running",
                    startedAt: now,
                    updatedAt: now,
                    plannedMs: action.minutes * 60_000,
                    remainingMs: action.minutes * 60_000,
                    runningMs: 0,
                });
                draft.focus = draft.focus.slice(0, 5000);
                break;
            }
            case "focus.pause":
            case "focus.resume":
            case "focus.stop":
            case "focus.extend": {
                const row = draft.focus.find((entry) => entry.status === "running" || entry.status === "paused");
                if (!row) throw new Error("No active focus session");
                if (action.type === "focus.extend") {
                    row.remainingMs += action.minutes * 60_000;
                    row.plannedMs += action.minutes * 60_000;
                } else {
                    row.status =
                        action.type === "focus.pause"
                            ? "paused"
                            : action.type === "focus.resume"
                              ? "running"
                              : "stopped";
                    if (row.status === "stopped") row.finishedAt = now;
                }
                row.updatedAt = now;
                break;
            }
            case "preferences.save": {
                const blockedSites = action.blockedSites.map((site) => {
                    const hostname = new URL(site.includes("://") ? site : `https://${site}`).hostname.toLowerCase();
                    if (!hostname || hostname.includes("*"))
                        throw new Error("Enter a site hostname, without wildcards");
                    return hostname;
                });
                draft.preferences = {
                    activityEnabled: action.activityEnabled,
                    blockedSites: [...new Set(blockedSites)],
                    blockedApps: [...new Set(action.blockedApps)],
                };
                if (!action.activityEnabled) draft.activity = [];
                break;
            }
            case "activity.clear":
                draft.activity = [];
                break;
        }
        return this.commit(draft);
    }

    tick(): { reminders: ProductivityState["tasks"]; focusCompleted: boolean } {
        const now = this.clock();
        const draft = this.snapshot();
        const focusCompleted = draft.focus.some(
            (row) =>
                row.status === "completed" &&
                this.state.focus.find((entry) => entry.id === row.id)?.status === "running"
        );
        const reminders = draft.tasks.filter(
            (row) => row.status === "open" && row.dueAt != null && row.dueAt <= now && row.notifiedAt == null
        );
        for (const row of reminders) row.notifiedAt = now;
        if (
            focusCompleted ||
            reminders.length ||
            (now - this.lastCheckpoint >= 15_000 && draft.focus.some((row) => row.status === "running"))
        )
            this.commit(draft);
        return { reminders: copy(reminders), focusCompleted };
    }

    recordActivity(kind: "agent" | "workspace" | "focus", label: string, durationMs?: number): void {
        if (!this.state.preferences.activityEnabled) return;
        const draft = this.snapshot();
        draft.activity.unshift({
            id: randomUUID(),
            kind,
            label: Text.parse(label),
            occurredAt: this.clock(),
            ...(durationMs != null ? { durationMs: Time.parse(durationMs) } : {}),
        });
        draft.activity = draft.activity.slice(0, 1000);
        this.commit(draft);
    }

    blocksSite(url: string): boolean {
        if (!this.snapshot().focus.some((row) => row.status === "running")) return false;
        try {
            const host = new URL(url).hostname.toLowerCase();
            return this.state.preferences.blockedSites.some((site) => host === site || host.endsWith(`.${site}`));
        } catch {
            return false;
        }
    }

    blocksApp(identifier: string): boolean {
        return (
            this.snapshot().focus.some((row) => row.status === "running") &&
            this.state.preferences.blockedApps.some((app) => app.toLowerCase() === identifier.toLowerCase())
        );
    }
}
