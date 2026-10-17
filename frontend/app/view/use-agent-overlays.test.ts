import { describe, expect, it } from "vitest";
import type { LiveAgentSurfaceActivity } from "../../types/agent-activity";
import { createAgentOverlayOwner, matchesAgentOverlayTarget } from "./use-agent-overlays";

function activity(
    surface: LiveAgentSurfaceActivity["surface"],
    blockid?: string
): Pick<LiveAgentSurfaceActivity, "surface" | "blockid"> {
    return { surface, blockid };
}

describe("agent overlay targeting", () => {
    it("ignores activity from other surfaces", () => {
        expect(matchesAgentOverlayTarget(activity("browser", "block-1"), "sandbox", "block-1")).toBe(false);
    });

    it("ignores activity explicitly targeted at another block", () => {
        expect(matchesAgentOverlayTarget(activity("sandbox", "block-2"), "sandbox", "block-1")).toBe(false);
    });

    it("allows matching activity and limits surface-wide events to surface-wide subscribers", () => {
        expect(matchesAgentOverlayTarget(activity("sandbox", "block-1"), "sandbox", "block-1")).toBe(true);
        expect(matchesAgentOverlayTarget(activity("sandbox"), "sandbox", "block-1")).toBe(false);
        expect(matchesAgentOverlayTarget(activity("sandbox"), "sandbox")).toBe(true);
    });
});

function runActivity(runid: string, timestamp: number, overrides: Partial<LiveAgentSurfaceActivity> = {}) {
    return {
        runid,
        timestamp,
        source: "mcp",
        phase: "running",
        surface: "sandbox",
        action: "click",
        ...overrides,
    } as LiveAgentSurfaceActivity;
}

describe("agent overlay ownership", () => {
    it("clears traces before a different run takes over and rejects late events from the previous run", () => {
        const accept = createAgentOverlayOwner();
        expect(accept(runActivity("old", 1))).toBe("reset");
        expect(accept(runActivity("new", 2))).toBe("reset");
        expect(accept(runActivity("old", 3))).toBeUndefined();
        expect(accept(runActivity("old", 4, { phase: "succeeded" }))).toBeUndefined();
        expect(accept(runActivity("new", 5))).toBe("update");
    });

    it("ignores unrelated completions and thinking events without renewing ownership", () => {
        const accept = createAgentOverlayOwner();
        expect(accept(runActivity("active", 10))).toBe("reset");
        expect(accept(runActivity("other", 11, { phase: "paused" }))).toBeUndefined();
        expect(accept(runActivity("other", 12, { action: "thinking" }))).toBeUndefined();
        expect(accept(runActivity("active", 13, { phase: "cancelled" }))).toBe("clear");
    });

    it("rejects out-of-order work after takeover while allowing an explicitly resumed run", () => {
        const accept = createAgentOverlayOwner();
        accept(runActivity("active", 10));
        expect(accept(runActivity("active", 12, { phase: "paused" }))).toBe("clear");
        expect(accept(runActivity("active", 11))).toBeUndefined();
        expect(accept(runActivity("active", 13))).toBe("update");
    });
});

describe("completed overlay runs", () => {
    it("cannot revive a completed run with a late running update", () => {
        const accept = createAgentOverlayOwner();
        accept(runActivity("finished", 1));
        expect(accept(runActivity("finished", 2, { phase: "succeeded" }))).toBe("clear");
        expect(accept(runActivity("finished", 3))).toBeUndefined();
    });
});
