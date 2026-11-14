import { describe, expect, it } from "vitest";
import {
    contextForAgentActivity,
    createAgentActivityTimeline,
    cursorActionForAgentActivity,
    inferAgentActivityAction,
    inferAgentActivitySurface,
    normalizeAgentActivity,
    pointFromAgentActivityInput,
} from "./agent-activity";

describe("agent activity normalization", () => {
    it("maps legacy phases into the canonical lifecycle", () => {
        expect(
            normalizeAgentActivity({
                source: "kronoscode-tui",
                phase: "update",
                surface: "browser",
                action: "click",
            }).phase
        ).toBe("running");
        expect(
            normalizeAgentActivity({
                source: "kronoscode-tui",
                phase: "finish",
                surface: "panel",
                action: "focus",
            }).phase
        ).toBe("succeeded");
        expect(
            normalizeAgentActivity({
                source: "kronoscode-tui",
                phase: "error",
                surface: "panel",
                action: "focus",
            }).phase
        ).toBe("failed");
    });

    it("preserves explicit lifecycle and presentation metadata", () => {
        const activity = normalizeAgentActivity({
            source: "acp",
            phase: "awaiting-approval",
            surface: "terminal",
            action: "wait",
            risk: "dangerous",
            presentationHints: { cursorAction: "idle" },
        });

        expect(activity.phase).toBe("awaiting-approval");
        expect(activity.risk).toBe("dangerous");
        expect(cursorActionForAgentActivity(activity)).toBe("idle");
        expect(contextForAgentActivity(activity)).toBe("terminal");
    });

    it("retains title inference as a legacy compatibility path", () => {
        expect(inferAgentActivityAction("desktop_mouse_click")).toBe("click");
        expect(inferAgentActivityAction("browser screenshot")).toBe("screenshot");
        expect(inferAgentActivitySurface("term_run_command")).toBe("terminal");
        expect(inferAgentActivitySurface("widget_click", "block-1")).toBe("browser");
        expect(pointFromAgentActivityInput({ coordinates: { x: 12, y: 24 } })).toEqual({ x: 12, y: 24 });
    });

    it("retains a bounded canonical timeline per run", () => {
        const timeline = createAgentActivityTimeline(2);
        timeline.record({ source: "acp", phase: "start", surface: "panel", action: "thinking" }, 1);
        timeline.record({ source: "acp", phase: "running", surface: "browser", action: "open", runid: "run-1" }, 2);
        timeline.record({ source: "acp", phase: "verifying", surface: "browser", action: "verify", runid: "run-1" }, 3);
        timeline.record({ source: "acp", phase: "finish", surface: "browser", action: "verify", runid: "run-1" }, 4);

        expect(timeline.get()).toHaveLength(1);
        expect(timeline.getAll().map(({ timestamp }) => timestamp)).toEqual([1, 3, 4]);
        expect(timeline.get("run-1").map(({ phase, timestamp }) => ({ phase, timestamp }))).toEqual([
            { phase: "verifying", timestamp: 3 },
            { phase: "succeeded", timestamp: 4 },
        ]);
    });
});

it("retains the latest preview for each worker sharing a run within the image budget", () => {
    const timeline = createAgentActivityTimeline(20, 4, 24);
    const worker = (nodeId: string, previewimageurl: string) =>
        timeline.record({
            source: "hermes",
            phase: "running",
            surface: "desktop",
            action: "inspect",
            runid: "swarm",
            previewimageurl,
            swarm: { runId: "swarm", nodeId, goal: nodeId, parentSessionId: "parent", status: "running" },
        });
    worker("a", "aaaaaa");
    const original = worker("b", "bbbbbb");
    worker("a", "aaaaa2");
    expect(timeline.get("swarm").map((entry) => entry.previewimageurl)).toEqual([undefined, "bbbbbb", "aaaaa2"]);

    worker("c", "cccccc");
    expect(timeline.get("swarm").map((entry) => entry.previewimageurl)).toEqual([
        undefined,
        undefined,
        "aaaaa2",
        "cccccc",
    ]);
    expect(timeline.get("swarm").map((entry) => entry.swarm.nodeId)).toEqual(["a", "b", "a", "c"]);
    expect(original.previewimageurl).toBe("bbbbbb");
});

it("evicts least recently written runs and preserves cross-run order for simultaneous activity", () => {
    const timeline = createAgentActivityTimeline(10, 2);
    const record = (runid: string, detail: string) =>
        timeline.record({ source: "hermes", phase: "running", surface: "file", action: "inspect", runid, detail }, 1);
    record("a", "first");
    record("b", "second");
    record("a", "third");
    expect(timeline.getAll().map((entry) => entry.detail)).toEqual(["first", "second", "third"]);
    record("c", "fourth");
    expect(timeline.get("b")).toEqual([]);
    expect(timeline.getAll().map((entry) => entry.detail)).toEqual(["first", "third", "fourth"]);
});
