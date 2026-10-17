// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { productivitySummary, type ProductivityState } from "../frontend/types/productivity";
import { getWaveDataDir } from "./emain-platform";
import { ProductivityStore } from "./productivity-store";

let store: ProductivityStore;
let timer: ReturnType<typeof setInterval>;
const Subscribers = new Set<(state: ProductivityState) => void>();

export function productivityStore(): ProductivityStore {
    if (store) return store;
    store = new ProductivityStore(path.join(getWaveDataDir(), "productivity", "journal.json"));
    store.subscribe((state) => {
        for (const listener of Subscribers) listener(state);
    });
    return store;
}

export function subscribeProductivity(listener: (state: ProductivityState) => void): () => void {
    Subscribers.add(listener);
    return () => Subscribers.delete(listener);
}

export function initializeProductivity(notify: (title: string, body: string) => void): void {
    productivityStore();
    if (timer) return;
    timer = setInterval(() => {
        try {
            const { reminders, focusCompleted } = store.tick();
            for (const reminder of reminders) notify("KronTerm reminder", reminder.title);
            if (focusCompleted) {
                notify("Focus session complete", "Your focus session has finished. Take a moment to reset.");
                const focus = store.snapshot().focus.find((row) => row.status === "completed");
                if (focus) store.recordActivity("focus", "Focus session completed", focus.runningMs);
            }
        } catch (error) {
            console.error("[productivity] Timer update failed", error);
        }
    }, 1000);
    timer.unref();
}

export function managedSiteBlocked(url: string): boolean {
    try {
        return store?.blocksSite(url) === true;
    } catch {
        return false;
    }
}

export function managedAppBlocked(identifier: string): boolean {
    try {
        return store?.blocksApp(identifier) === true;
    } catch {
        return false;
    }
}

export function recordProductivityAgent(source: string, phase: string): void {
    phase = ({ finish: "completed", succeeded: "completed", error: "failed", "awaiting-approval": "approval" } as Record<string, string>)[phase] ?? phase;
    if (!["completed", "failed", "blocked", "approval"].includes(phase)) return;
    const name = ["hermes", "kronoscode", "codex", "claude", "opencode", "gemini"].includes(source) ? source : "Agent";
    try {
        store?.recordActivity("agent", `${name}: ${phase}`);
    } catch (error) {
        console.warn("[productivity] Activity unavailable", error);
    }
}

export function queryProductivity(input: { collection: string; query?: string; limit?: number }): unknown {
    const state = productivityStore().snapshot();
    if (input.collection === "preferences") return state.preferences;
    const rows =
        input.collection === "reminders"
            ? state.tasks.filter((row) => row.dueAt != null)
            : state[input.collection as "tasks" | "notes" | "habits" | "focus" | "activity"];
    if (!Array.isArray(rows)) throw new Error("Unknown productivity collection");
    const needle = (input.query ?? "").trim().toLocaleLowerCase();
    const matches = rows.filter((row) => !needle || JSON.stringify(row).toLocaleLowerCase().includes(needle));
    const limit = Math.max(1, Math.min(50, input.limit ?? 20));
    return { collection: input.collection, total: matches.length, items: matches.slice(0, limit) };
}

export function commandProductivity(input: unknown): unknown {
    const state = productivityStore().command(input);
    const action = input as { type: string; id?: string };
    const collection = action.type.split(".")[0];
    const items =
        collection === "task"
            ? state.tasks
            : collection === "note"
              ? state.notes
              : collection === "habit"
                ? state.habits
                : collection === "focus"
                  ? state.focus
                  : undefined;
    const item = items?.find((row) => row.id === action.id) ?? (action.id == null ? items?.[0] : undefined);
    return { saved: true, id: item?.id, summary: productivitySummary(state) };
}
