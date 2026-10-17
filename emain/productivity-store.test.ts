// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ProductivityStore } from "./productivity-store";

describe("durable productivity journal", () => {
    let root: string;
    let file: string;
    let now: number;
    let store: ProductivityStore;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-productivity-"));
        file = path.join(root, "journal.json");
        now = 1_800_000_000_000;
        store = new ProductivityStore(file, () => now);
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    test("counts observed running time, excludes pauses, and pauses after restart", () => {
        store.command({ type: "focus.start", label: "Ship", minutes: 25 });
        now += 30_000;
        store.command({ type: "focus.pause" });
        now += 60_000;
        expect(store.snapshot().focus[0]).toMatchObject({ runningMs: 30_000, remainingMs: 1_470_000 });
        store.command({ type: "focus.resume" });
        now += 20_000;
        store.tick();
        now += 600_000;
        const reopened = new ProductivityStore(file, () => now);
        expect(reopened.snapshot().focus[0]).toMatchObject({ status: "paused", runningMs: 50_000 });
        expect(() => reopened.command({ type: "focus.start", label: "Second", minutes: 5 })).toThrow("current");
    });

    test("emits a due reminder once across restart and delivers again after snooze", () => {
        const state = store.command({ type: "task.save", title: "Review", dueAt: now + 1000 });
        const id = state.tasks[0].id;
        now += 1000;
        expect(store.tick().reminders.map((row) => row.id)).toEqual([id]);
        expect(store.tick().reminders).toEqual([]);
        store = new ProductivityStore(file, () => now);
        expect(store.tick().reminders).toEqual([]);
        store.command({ type: "task.snooze", id, minutes: 5 });
        now += 300_000;
        expect(store.tick().reminders).toHaveLength(1);
    });

    test("finishes exactly once and extending preserves recorded time", () => {
        store.command({ type: "focus.start", label: "Read", minutes: 1 });
        now += 30_000;
        store.command({ type: "focus.extend", minutes: 1 });
        now += 90_000;
        expect(store.tick().focusCompleted).toBe(true);
        expect(store.tick().focusCompleted).toBe(false);
        expect(store.snapshot().focus[0]).toMatchObject({ runningMs: 120_000, remainingMs: 0, plannedMs: 120_000 });
    });

    test("preserves recoverable tasks/notes and rejects invalid habit dates without writing", () => {
        const task = store.command({ type: "task.save", title: "Test" }).tasks[0];
        store.command({ type: "task.status", id: task.id, status: "deleted" });
        store.command({ type: "task.status", id: task.id, status: "open" });
        const note = store.command({ type: "note.save", title: "Notes", body: "Keep this" }).notes[0];
        store.command({ type: "note.delete", id: note.id, deleted: true });
        store.command({ type: "note.delete", id: note.id, deleted: false });
        const habit = store.command({ type: "habit.save", title: "Read", target: 1 }).habits[0];
        const before = fs.readFileSync(file, "utf8");
        expect(() => store.command({ type: "habit.progress", id: habit.id, date: "2026-02-30", delta: 1 })).toThrow();
        expect(fs.readFileSync(file, "utf8")).toBe(before);
        expect(new ProductivityStore(file, () => now).snapshot()).toMatchObject({
            tasks: [{ status: "open" }],
            notes: [{ body: "Keep this", deleted: false }],
        });
    });

    test("activity is opt-in, clears on disabling, and blocking applies only while running", () => {
        store.recordActivity("agent", "Agent completed");
        expect(store.snapshot().activity).toEqual([]);
        store.command({
            type: "preferences.save",
            activityEnabled: true,
            blockedSites: ["https://example.com/path"],
            blockedApps: ["Browser"],
        });
        store.recordActivity("agent", "Agent completed");
        expect(store.snapshot().activity).toHaveLength(1);
        store.command({ type: "focus.start", label: "Focus", minutes: 25 });
        expect(store.blocksSite("https://sub.example.com/")).toBe(true);
        expect(store.blocksSite("https://notexample.com/")).toBe(false);
        expect(store.blocksApp("browser")).toBe(true);
        store.command({ type: "focus.pause" });
        expect(store.blocksSite("https://example.com/")).toBe(false);
        store.command({ type: "preferences.save", activityEnabled: false, blockedSites: [], blockedApps: [] });
        expect(store.snapshot().activity).toEqual([]);
    });

    test("a corrupt journal is preserved and malformed commands cannot mutate state", () => {
        const before = fs.readFileSync(file, "utf8");
        expect(() => store.command({ type: "focus.start", minutes: -1, label: "Bad" })).toThrow();
        expect(fs.readFileSync(file, "utf8")).toBe(before);
        fs.writeFileSync(file, "{broken");
        expect(() => new ProductivityStore(file)).toThrow();
        expect(fs.readFileSync(file, "utf8")).toBe("{broken");
    });
});
