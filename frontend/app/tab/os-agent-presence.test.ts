// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { LiveAgentSurfaceActivity } from "../../types/agent-activity";
import {
    activeAgentPresences,
    agentLabelForSource,
    assignAgentPresencesToWindows,
    describeAgentPresence,
    OSAgentPresenceStaleMs,
} from "./os-agent-presence";

function activity(overrides: Partial<LiveAgentSurfaceActivity>): LiveAgentSurfaceActivity {
    return {
        id: "a1",
        source: "hermes",
        phase: "running",
        surface: "browser",
        action: "click",
        detail: "click Save",
        timestamp: 1_000,
        ...overrides,
    };
}

describe("activeAgentPresences", () => {
    it("drops an activity once its latest event completes", () => {
        const presences = activeAgentPresences(
            [activity({ phase: "running" }), activity({ phase: "succeeded", timestamp: 1_100 })],
            1_200
        );
        expect(presences).toEqual([]);
    });

    it("keeps in-flight activity and labels the agent", () => {
        const [presence] = activeAgentPresences([activity({ blockid: "b1" })], 1_200);
        expect(presence.agent).toBe("KronOS Agent");
        expect(presence.blockId).toBe("b1");
        expect(describeAgentPresence(presence)).toBe("KronOS Agent · click Save");
    });

    it("expires activity that never reported completion", () => {
        expect(activeAgentPresences([activity({})], 1_000 + OSAgentPresenceStaleMs + 1)).toEqual([]);
    });

    it("flags approvals", () => {
        const [presence] = activeAgentPresences([activity({ phase: "awaiting-approval", source: "acp" })], 1_100);
        expect(describeAgentPresence(presence)).toBe("KronosCode needs approval");
    });
});

describe("assignAgentPresencesToWindows", () => {
    const windows = [
        { blockId: "web-1", view: "web" },
        { blockId: "term-1", view: "term" },
        { blockId: "term-2", view: "term" },
    ];

    it("targets the exact block when the activity names one", () => {
        const presences = activeAgentPresences([activity({ blockid: "web-1" })], 1_100);
        expect([...assignAgentPresencesToWindows(presences, windows).keys()]).toEqual(["web-1"]);
    });

    it("claims the only window of a view for untargeted activity", () => {
        const presences = activeAgentPresences([activity({ blockid: undefined })], 1_100);
        expect([...assignAgentPresencesToWindows(presences, windows).keys()]).toEqual(["web-1"]);
    });

    it("never lights every window when several share a view", () => {
        const presences = activeAgentPresences([activity({ surface: "terminal", blockid: undefined })], 1_100);
        expect(assignAgentPresencesToWindows(presences, windows).size).toBe(0);
    });

    it("ignores activity aimed at a block that is not on this desktop", () => {
        const presences = activeAgentPresences([activity({ blockid: "elsewhere" })], 1_100);
        expect(assignAgentPresencesToWindows(presences, windows).size).toBe(0);
    });
});

describe("agentLabelForSource", () => {
    it("names each engine", () => {
        expect(agentLabelForSource("hermes")).toBe("KronOS Agent");
        expect(agentLabelForSource("acp")).toBe("KronosCode");
        expect(agentLabelForSource("mcp")).toBe("KronOS Agent");
    });
});
