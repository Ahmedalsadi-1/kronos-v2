// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import type { ProductivityFocus, ProductivityNote } from "../../../types/productivity";

export function localDay(now = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function focusRemaining(focus: ProductivityFocus, now = Date.now()): number {
    return Math.max(0, focus.remainingMs - (focus.status === "running" ? Math.max(0, now - focus.updatedAt) : 0));
}
export function clockLabel(ms: number): string {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function searchNotes(notes: ProductivityNote[], query: string): ProductivityNote[] {
    const needle = query.trim().toLocaleLowerCase();
    return notes.filter((note) => !note.deleted && `${note.title} ${note.body}`.toLocaleLowerCase().includes(needle));
}
