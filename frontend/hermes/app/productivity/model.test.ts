import { describe, expect, it } from "vitest";
import type { ProductivityFocus, ProductivityNote } from "../../../types/productivity";
import { clockLabel, focusRemaining, localDay, searchNotes } from "./model";

describe("productivity presentation", () => {
    it("counts active time without consuming paused time or allowing negative time", () => {
        const focus = { remainingMs: 60000, updatedAt: 1000, status: "running" } as ProductivityFocus;
        expect(focusRemaining(focus, 11000)).toBe(50000);
        expect(focusRemaining({ ...focus, status: "paused" }, 11000)).toBe(60000);
        expect(focusRemaining(focus, 100000)).toBe(0);
        expect(focusRemaining(focus, 500)).toBe(60000);
    });
    it("uses local calendar dates and rounds countdown upward", () => {
        expect(localDay(new Date(2026, 9, 10, 23, 59))).toBe("2026-10-10");
        expect(clockLabel(60001)).toBe("1:01");
        expect(clockLabel(-20)).toBe("0:00");
    });
    it("searches content and titles case insensitively while excluding deleted notes", () => {
        const notes = [
            { id: "a", title: "Launch", body: "Review the NOTCH" },
            { id: "b", title: "Notch", body: "", deleted: true },
        ] as ProductivityNote[];
        expect(searchNotes(notes, " notch ").map((row) => row.id)).toEqual(["a"]);
        expect(searchNotes(notes, "launch").map((row) => row.id)).toEqual(["a"]);
    });
});
