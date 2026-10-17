// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";

import {
    addArtifactToShelf,
    dedupeSystemEvents,
    reconcileAppInstances,
    removeArtifactFromShelf,
    systemEventForAgentActivity,
} from "@/app/store/os-system";
import { normalizeOSActionName, type SystemEvent } from "@/app/store/os-system-types";

const BaseEvent: SystemEvent = {
    id: "first",
    spaceId: "space",
    kind: "notification",
    status: "available",
    title: "Update available",
    createdAt: 10_000,
};

describe("OS system model", () => {
    test("deduplicates equivalent notifications within the journal window", () => {
        const events = dedupeSystemEvents([
            BaseEvent,
            { ...BaseEvent, id: "second", createdAt: 12_000 },
            { ...BaseEvent, id: "third", createdAt: 20_000 },
        ]);
        expect(events.map((event) => event.id)).toEqual(["third", "second"]);
    });

    test("records redacted lifecycle summaries instead of agent detail", () => {
        const event = systemEventForAgentActivity("space", {
            id: "activity",
            runid: "run",
            source: "acp",
            phase: "awaiting-approval",
            surface: "terminal",
            action: "press",
            detail: "password=must-not-be-persisted",
            timestamp: Date.now(),
        });
        expect(event).toMatchObject({
            kind: "approval",
            status: "awaiting-approval",
            title: "Kronos needs approval for terminal",
        });
        expect(JSON.stringify(event)).not.toContain("must-not-be-persisted");
    });

    test("keeps spatial actions as compatibility aliases", () => {
        expect(normalizeOSActionName("spatial.focus")).toBe("os.window.focus");
        expect(normalizeOSActionName("os.app.launch")).toBe("os.app.launch");
    });

    test("keeps stable app instance identity while changing lifecycle state", () => {
        const running = reconcileAppInstances([], "space", [{ blockId: "notes", appId: "app:com.apple.Notes" }]);
        const dormant = reconcileAppInstances(running, "space", [
            { blockId: "notes", appId: "app:com.apple.Notes", collapsed: true },
        ]);
        expect(dormant[0]).toMatchObject({
            id: "space:notes",
            blockId: "notes",
            appId: "app:com.apple.Notes",
            state: "dormant",
        });
    });

    test("keeps artifact shelf entries as references and moves reused resources to the front", () => {
        const report = {
            id: "local:/repo/report.md",
            kind: "file" as const,
            name: "Report",
            resource: "/repo/report.md",
        };
        const first = addArtifactToShelf([], report, 1);
        const refreshed = addArtifactToShelf(first, { ...report, id: "new-id", name: "Updated report" }, 2);
        expect(refreshed).toEqual([{ ...report, id: "new-id", name: "Updated report", addedAt: 2 }]);
        expect(removeArtifactFromShelf(refreshed, "new-id")).toEqual([]);
    });
});
