// @vitest-environment jsdom
// Copyright 2026, KronOS. SPDX-License-Identifier: Apache-2.0

import { reportAgentSurfaceActivity } from "@/app/aipanel/desktop-pet-activity";
import { subscribeSubagentSurface } from "@hermes/lib/subagent-surface";
import { $subagentsBySession, clearSessionSubagents, upsertSubagent } from "@hermes/store/subagents";
import { afterEach, expect, it, vi } from "vitest";
import { JsonRpcGatewayClient } from "../../../hermes-shared/json-rpc-gateway";
import { agentActivityTimeline, publishAgentActivity, type AgentActivityEvent } from "../../../types/agent-activity";
import { installSubagentSurfaceSource } from "./subagent-surface-source";
import { installSwarmSubagentSource, projectSwarmActivity, stopSwarmChild } from "./swarm-subagent-source";

const { setDesktopPetActivity } = vi.hoisted(() => ({ setDesktopPetActivity: vi.fn() }));
vi.mock("@/store/global", () => ({ getApi: () => ({ setDesktopPetActivity }) }));

function worker(overrides: Partial<AgentActivityEvent["swarm"]> = {}): AgentActivityEvent {
    return {
        runid: "swarm:run",
        source: "hermes",
        phase: "running",
        action: "inspect",
        surface: "browser",
        blockid: "browser-a",
        surfaceid: "widget:browser-a",
        appname: "Browser A",
        swarm: {
            runId: "run",
            nodeId: "a",
            parentSessionId: "parent",
            goal: "Inspect inventory",
            status: "running",
            ...overrides,
        },
    };
}

afterEach(() => {
    $subagentsBySession.set({});
    agentActivityTimeline.clear();
    setDesktopPetActivity.mockClear();
    vi.restoreAllMocks();
});

it("keeps scoped lifecycle and tool activity local to the renderer", () => {
    const activity = { ...worker({ childSessionId: "live-a" }), blockid: undefined };
    reportAgentSurfaceActivity(activity);
    reportAgentSurfaceActivity({ ...activity, swarm: undefined, ownertabid: "tab", sessionid: "live-a" });
    expect(agentActivityTimeline.getAll()).toHaveLength(2);
    expect(setDesktopPetActivity).not.toHaveBeenCalled();
    reportAgentSurfaceActivity({ ...activity, swarm: undefined });
    expect(setDesktopPetActivity).toHaveBeenCalledOnce();
});

it("keeps workers from the same parent separate and attaches only live child IDs", () => {
    projectSwarmActivity(worker({ status: "pending", childSessionId: "placeholder" }));
    projectSwarmActivity(worker({ nodeId: "b", goal: "Check dashboard", childSessionId: "live-b" }));
    projectSwarmActivity(worker({ parentSessionId: "other-parent", childSessionId: "other-live-a" }));
    expect($subagentsBySession.get().parent).toMatchObject([
        { id: "run:a", status: "queued", sessionId: undefined },
        { id: "run:b", status: "running", sessionId: "live-b" },
    ]);
    projectSwarmActivity(worker({ childSessionId: "live-a", toolName: "widget_snapshot", toolPreview: "Inventory" }));
    expect($subagentsBySession.get().parent).toMatchObject([
        { id: "run:a", status: "running", sessionId: "live-a", currentTool: "widget_snapshot" },
        { id: "run:b", status: "running", sessionId: "live-b", stream: [] },
    ]);
    expect($subagentsBySession.get()["other-parent"]).toMatchObject([{ id: "run:a", sessionId: "other-live-a" }]);
    projectSwarmActivity(worker({ nodeId: "c", childSessionId: "parent" }));
    expect($subagentsBySession.get().parent[2].sessionId).toBeUndefined();
});

it("preserves distinct terminal outcomes and ignores late progress and private reasoning", () => {
    projectSwarmActivity({
        ...worker({ childSessionId: "live-a" }),
        action: "thinking",
        detail: "Private detail",
        thought: "Private thought",
        reasoningSteps: ["Private reasoning"],
    });
    expect($subagentsBySession.get().parent[0].stream).toEqual([]);
    projectSwarmActivity(worker({ status: "uncertain", summary: "The click effect could not be confirmed." }));
    const terminal = $subagentsBySession.get().parent[0];
    projectSwarmActivity(worker({ status: "running", toolName: "widget_snapshot", childSessionId: "late-session" }));
    expect($subagentsBySession.get().parent[0]).toBe(terminal);
    expect(terminal).toMatchObject({
        status: "failed",
        sessionId: "live-a",
        swarm: { outcome: "uncertain" },
        currentTool: undefined,
        stream: [{ kind: "summary", text: "The click effect could not be confirmed.", isError: true }],
    });
    projectSwarmActivity(worker({ nodeId: "b", status: "blocked" }));
    expect($subagentsBySession.get().parent[1]).toMatchObject({
        status: "failed",
        swarm: { outcome: "blocked" },
        summary: "The worker was blocked.",
    });
});

it("keeps independently running workers visible when the parent turn stops", () => {
    upsertSubagent("parent", { subagent_id: "native", status: "running" });
    projectSwarmActivity(worker({ childSessionId: "live-a" }));
    clearSessionSubagents("parent");
    expect($subagentsBySession.get().parent).toMatchObject([{ id: "run:a", sessionId: "live-a" }]);
});

it("replays activity recorded before the projection was installed and consumes later events", () => {
    publishAgentActivity(worker({ status: "pending" }));
    installSwarmSubagentSource(async () => "ws://localhost:9119/api/ws");
    expect($subagentsBySession.get().parent).toMatchObject([{ id: "run:a", status: "queued" }]);
    publishAgentActivity(worker({ childSessionId: "live-a" }));
    expect($subagentsBySession.get().parent).toMatchObject([{ id: "run:a", sessionId: "live-a", status: "running" }]);
});

it("removes queued work and reopens its ID cleanly when a later plan reuses it", () => {
    installSwarmSubagentSource(async () => "ws://localhost:9119/api/ws");
    installSubagentSurfaceSource(vi.fn());
    const old = worker({ status: "pending" });
    publishAgentActivity({ ...old, previewimageurl: "data:image/png;base64,previous-plan" });
    publishAgentActivity(worker({ nodeId: "b", status: "pending" }));
    publishAgentActivity({
        ...old,
        phase: "cancelled",
        swarm: { ...old.swarm, status: "cancelled", removed: true },
    });
    expect($subagentsBySession.get().parent).toMatchObject([{ id: "run:b", status: "queued" }]);

    publishAgentActivity({
        ...worker({ childSessionId: "replacement", goal: "Check the new plan" }),
        appname: "Replacement",
    });
    expect($subagentsBySession.get().parent).toMatchObject([
        { id: "run:b", status: "queued" },
        { id: "run:a", status: "running", sessionId: "replacement", goal: "Check the new plan" },
    ]);
    const update = vi.fn();
    const unsubscribe = subscribeSubagentSurface(
        { id: "run:a", sessionId: "replacement", swarm: true, live: false },
        update
    );
    try {
        expect(update.mock.lastCall[0]).toMatchObject({ title: "Replacement", imageUrl: undefined });
    } finally {
        unsubscribe();
    }
});

it("keeps selected worker evidence and label through generic activity and terminal updates", () => {
    const capture = vi.fn();
    installSubagentSurfaceSource(capture);
    const activity = worker({ childSessionId: "live-a" });
    const update = vi.fn();
    publishAgentActivity(activity);
    publishAgentActivity({
        ...activity,
        swarm: undefined,
        sessionid: "live-a",
        appname: undefined,
        previewimageurl: "data:image/png;base64,evidence-a",
    });
    publishAgentActivity({
        ...activity,
        swarm: undefined,
        sessionid: "live-a",
        blockid: "wrong-browser",
        previewimageurl: "data:image/png;base64,wrong-browser",
    });
    publishAgentActivity({
        ...activity,
        swarm: undefined,
        sessionid: "live-a",
        surface: "panel",
        blockid: undefined,
        surfaceid: undefined,
        action: "thinking",
        detail: "Private reasoning",
    });
    publishAgentActivity({ ...activity, swarm: { ...activity.swarm, status: "succeeded", summary: "Verified." } });
    publishAgentActivity({
        ...activity,
        swarm: undefined,
        sessionid: "live-a",
        previewimageurl: "data:image/png;base64,late-a",
    });
    publishAgentActivity({
        ...worker({ nodeId: "b", childSessionId: "live-b" }),
        blockid: "browser-b",
        surfaceid: "widget:browser-b",
        previewimageurl: "data:image/png;base64,evidence-b",
    });
    const unsubscribe = subscribeSubagentSurface(
        { id: "run:a", sessionId: "live-a", swarm: true, live: false },
        update
    );
    try {
        expect(capture).not.toHaveBeenCalled();
        expect(update.mock.lastCall[0]).toMatchObject({
            title: "Browser A",
            imageUrl: "data:image/png;base64,evidence-a",
            detail: "Verified.",
        });
        expect(update.mock.calls.map(([snapshot]) => snapshot.detail)).not.toContain("Private reasoning");
    } finally {
        unsubscribe();
    }
});

it("interrupts the exact child on the local gateway and closes the short-lived connection", async () => {
    const connect = vi.spyOn(JsonRpcGatewayClient.prototype, "connect").mockResolvedValue();
    const request = vi.spyOn(JsonRpcGatewayClient.prototype, "request").mockResolvedValue({ status: "interrupted" });
    const close = vi.spyOn(JsonRpcGatewayClient.prototype, "close");
    const localGateway = async () => "ws://localhost:9119/api/ws";
    await stopSwarmChild("live-b", localGateway);
    expect(connect).toHaveBeenCalledExactlyOnceWith(await localGateway());
    expect(request).toHaveBeenCalledExactlyOnceWith("session.interrupt", { session_id: "live-b" }, 5000);
    expect(close).toHaveBeenCalledOnce();
    request.mockResolvedValue({ status: "idle" });
    await expect(stopSwarmChild("live-b", localGateway)).rejects.toThrow("did not confirm");
    expect(close).toHaveBeenCalledTimes(2);
});
