// @vitest-environment jsdom
import { subscribeSubagentSurface } from "@hermes/lib/subagent-surface";
import { afterEach, expect, it, vi } from "vitest";
import { agentActivityTimeline, publishAgentActivity } from "../../../types/agent-activity";
import { installSubagentSurfaceSource } from "./subagent-surface-source";

afterEach(() => {
    agentActivityTimeline.clear();
    vi.useRealTimers();
});

it("captures only the selected child's surface and stops polling on close", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(async (id: string) => `data:image/png;base64,${id}`);
    installSubagentSurfaceSource(capture);
    publishAgentActivity({
        source: "acp",
        sessionid: "child-b",
        surface: "browser",
        action: "inspect",
        phase: "running",
        blockid: "other-browser",
    });
    publishAgentActivity({
        source: "acp",
        sessionid: "child-a",
        surface: "browser",
        action: "inspect",
        phase: "running",
        blockid: "selected-browser",
    });
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "a", sessionId: "child-a" }, updates);
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledWith("selected-browser");
    expect(capture).not.toHaveBeenCalledWith("other-browser");
    expect(updates.mock.lastCall[0].imageUrl).toContain("selected-browser");
    dispose();
    await vi.advanceTimersByTimeAsync(6000);
    expect(capture).toHaveBeenCalledTimes(1);
});

it("discards a capture when the selected child moves to another widget", async () => {
    vi.useFakeTimers();
    let resolve: (value: string) => void;
    const capture = vi.fn(
        () =>
            new Promise<string>((done) => {
                resolve = done;
            })
    );
    installSubagentSurfaceSource(capture);
    publishAgentActivity({
        source: "acp",
        sessionid: "child-a",
        surface: "browser",
        action: "inspect",
        phase: "running",
        blockid: "old",
    });
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "a", sessionId: "child-a" }, updates);
    publishAgentActivity({
        source: "acp",
        sessionid: "child-a",
        surface: "browser",
        action: "inspect",
        phase: "running",
        blockid: "new",
    });
    resolve("data:image/png;base64,old");
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.mock.calls.some(([snapshot]) => snapshot.imageUrl?.includes("old"))).toBe(false);
    dispose();
});

it("uses recorded evidence for a completed agent without capturing its now-shared widget", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(async () => "data:image/png;base64,current-shared-widget");
    installSubagentSurfaceSource(capture);
    publishAgentActivity({
        source: "acp",
        sessionid: "done-child",
        surface: "browser",
        action: "inspect",
        phase: "succeeded",
        blockid: "shared",
        previewimageurl: "data:image/png;base64,recorded-child-evidence",
    });
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "done", sessionId: "done-child", live: false }, updates);
    await vi.advanceTimersByTimeAsync(6000);
    expect(capture).not.toHaveBeenCalled();
    expect(updates.mock.lastCall[0].imageUrl).toContain("recorded-child-evidence");
    dispose();
});
