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
    const capture = vi.fn(async (activity) => `data:image/png;base64,${activity.blockid}`);
    installSubagentSurfaceSource(capture);
    publishAgentActivity({
        source: "acp",
        sessionid: "child-a",
        surface: "browser",
        action: "inspect",
        phase: "running",
        blockid: "selected-browser",
    });
    publishAgentActivity({
        source: "acp",
        sessionid: "child-b",
        runid: "hermes:child-a",
        surface: "browser",
        action: "inspect",
        phase: "running",
        blockid: "other-browser",
    });
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "a", sessionId: "child-a" }, updates);
    expect(updates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ blockid: "selected-browser" }));
    expect(capture).not.toHaveBeenCalledWith(expect.objectContaining({ blockid: "other-browser" }));
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

it("captures a VM without a widget immediately and coalesces tool bursts", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(async () => "data:image/png;base64,vm");
    installSubagentSurfaceSource(capture);
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "vm-child" }, updates);
    const activity = {
        source: "hermes",
        sessionid: "vm-child",
        surface: "sandbox",
        surfaceid: "vm:one",
        controlgeneration: 3,
        action: "inspect",
        phase: "running",
    } as const;
    publishAgentActivity(activity);
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ surfaceid: "vm:one", controlgeneration: 3 }));
    for (let i = 0; i < 10; i++) publishAgentActivity({ ...activity, phase: "succeeded" });
    await vi.advanceTimersByTimeAsync(500);
    expect(capture).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(updates.mock.lastCall[0].imageUrl).toContain(",vm");
    dispose();
});

it("clears stale previews and reports capture failures without stopping activity", async () => {
    vi.useFakeTimers();
    const capture = vi
        .fn()
        .mockResolvedValueOnce("data:image/png;base64,vm")
        .mockRejectedValue(new Error("Control changed"));
    installSubagentSurfaceSource(capture);
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "vm-child" }, updates);
    publishAgentActivity({
        source: "hermes",
        sessionid: "vm-child",
        surface: "sandbox",
        surfaceid: "vm:one",
        controlgeneration: 3,
        action: "inspect",
        phase: "running",
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(updates.mock.lastCall[0]).toMatchObject({ imageUrl: undefined, captureError: "Control changed" });
    dispose();
});

it("does not overwrite newer tool evidence with an earlier capture of the same target", async () => {
    vi.useFakeTimers();
    let finish: (image: string) => void;
    installSubagentSurfaceSource(
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            })
    );
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "child" }, updates);
    const activity = {
        source: "hermes",
        sessionid: "child",
        surface: "browser",
        blockid: "browser",
        action: "inspect",
        phase: "running",
    } as const;
    publishAgentActivity(activity);
    publishAgentActivity({ ...activity, phase: "succeeded", previewimageurl: "data:image/png;base64,new" });
    finish("data:image/png;base64,old");
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.mock.lastCall[0].imageUrl).toContain(",new");
    expect(updates.mock.calls.some(([snapshot]) => snapshot.imageUrl?.includes(",old"))).toBe(false);
    dispose();
});

it("keeps an in-flight capture when tool metadata changes on the same target", async () => {
    vi.useFakeTimers();
    let finish: (image: string) => void;
    const capture = vi.fn(
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            })
    );
    installSubagentSurfaceSource(capture);
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "child" }, updates);
    const activity = {
        source: "hermes",
        sessionid: "child",
        surface: "browser",
        blockid: "browser",
        action: "inspect",
        phase: "running",
    } as const;
    publishAgentActivity(activity);
    publishAgentActivity({ ...activity, phase: "succeeded", detail: "Found the result." });
    publishAgentActivity({ ...activity, phase: "succeeded", detail: "Found the result." });
    finish("data:image/png;base64,result");
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(updates).toHaveBeenCalledTimes(3);
    expect(updates.mock.lastCall[0]).toMatchObject({
        imageUrl: "data:image/png;base64,result",
        detail: "Found the result.",
    });
    dispose();
});

it("does not capture in a hidden document and resumes when it becomes visible", async () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const capture = vi.fn(async () => "data:image/png;base64,result");
    installSubagentSurfaceSource(capture);
    const dispose = subscribeSubagentSurface({ id: "child" }, vi.fn());
    try {
        publishAgentActivity({
            source: "hermes",
            sessionid: "child",
            surface: "browser",
            blockid: "browser",
            action: "inspect",
            phase: "running",
        });
        await vi.advanceTimersByTimeAsync(6000);
        expect(capture).not.toHaveBeenCalled();
        hidden.mockReturnValue(false);
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
        expect(capture).toHaveBeenCalledOnce();
    } finally {
        dispose();
        hidden.mockRestore();
    }
});

it("uses a tool-provided preview without starting a redundant capture", async () => {
    vi.useFakeTimers();
    const capture = vi.fn(async () => "data:image/png;base64,live");
    installSubagentSurfaceSource(capture);
    const updates = vi.fn();
    const dispose = subscribeSubagentSurface({ id: "child" }, updates);
    publishAgentActivity({
        source: "hermes",
        sessionid: "child",
        surface: "browser",
        blockid: "browser",
        action: "screenshot",
        phase: "succeeded",
        previewimageurl: "data:image/png;base64,tool",
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture).not.toHaveBeenCalled();
    expect(updates.mock.lastCall[0].imageUrl).toContain(",tool");
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture).toHaveBeenCalledOnce();
    dispose();
});

it("shares one capture across exact viewers and drops the result for a closed viewer", async () => {
    vi.useFakeTimers();
    let finish: (image: string) => void;
    const capture = vi.fn(
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            })
    );
    installSubagentSurfaceSource(capture);
    const target = { id: "worker", sessionId: "child" };
    const first = vi.fn();
    const second = vi.fn();
    const closeFirst = subscribeSubagentSurface(target, first);
    const closeSecond = subscribeSubagentSurface(target, second);
    publishAgentActivity({
        source: "hermes",
        sessionid: "child",
        surface: "sandbox",
        surfaceid: "vm:one",
        controlgeneration: 1,
        action: "inspect",
        phase: "running",
    });
    expect(capture).toHaveBeenCalledOnce();
    closeFirst();
    finish("data:image/png;base64,shared");
    await vi.advanceTimersByTimeAsync(0);
    expect(first.mock.lastCall[0].imageUrl).toBeUndefined();
    expect(second.mock.lastCall[0].imageUrl).toBe("data:image/png;base64,shared");
    await vi.advanceTimersByTimeAsync(2000);
    expect(capture).toHaveBeenCalledTimes(2);
    closeSecond();
});

it.each([
    { sessionid: "other" },
    { surfaceid: "vm:other" },
    { controlgeneration: 2 },
    { action: "click", phase: "succeeded" },
] as const)("never joins a capture across a newer authority or action: %j", async (change) => {
    vi.useFakeTimers();
    const pending: ((image: string) => void)[] = [];
    const capture = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve)));
    installSubagentSurfaceSource(capture);
    const target = { id: "child", sessionId: "child" };
    const closeOld = subscribeSubagentSurface(target, vi.fn());
    const activity = {
        source: "hermes",
        sessionid: "child",
        surface: "sandbox",
        surfaceid: "vm:one",
        controlgeneration: 1,
        action: "inspect",
        phase: "running",
    } as const;
    publishAgentActivity(activity);
    const next = { ...activity, ...change };
    publishAgentActivity(next);
    const updates = vi.fn();
    const closeNew = subscribeSubagentSurface({ id: next.sessionid, sessionId: next.sessionid }, updates);
    expect(capture).toHaveBeenCalledTimes(2);
    pending[0]("data:image/png;base64,old");
    pending[1]("data:image/png;base64,new");
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.mock.calls.some(([snapshot]) => snapshot.imageUrl?.endsWith(",old"))).toBe(false);
    expect(updates.mock.lastCall[0].imageUrl).toBe("data:image/png;base64,new");
    closeNew();
    closeOld();
});
