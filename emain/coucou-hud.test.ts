import type { ChildProcess } from "node:child_process";
import { describe, expect, test, vi } from "vitest";
import {
    coucouActivityPayload,
    coucouChatBounds,
    coucouPreviewBounds,
    coucouProgress,
    coucouRecoveryChatBounds,
    parseCoucouHudEvent,
    writeCoucouState,
} from "./coucou-hud";

const event = { event: "ready" as const, x: -1512, y: 100, width: 1512, height: 982, inset: 32 };

describe("Coucou notch bridge", () => {
    test("recovery chat stays beside a docked VM and below the character", () => {
        const screen = { ...event, x: 0, y: 0, width: 1235, height: 803 };
        const preview = { x: 573, y: 44, width: 572, height: 578 };
        const recovered = coucouRecoveryChatBounds(screen, preview);
        expect(recovered.x + recovered.width).toBeLessThan(preview.x);
        expect(recovered.y).toBe(204);
        expect(recovered.y + recovered.height).toBeLessThanOrEqual(622);
        expect(coucouRecoveryChatBounds(event)).toEqual(coucouChatBounds(event));
    });
    test("starts progress safely when an activity has no session identifier", () => {
        expect(
            coucouProgress({
                source: "hermes",
                surface: "terminal",
                action: "type",
                phase: "running",
                detail: "Reading file",
            })
        ).toMatchObject({ steps: ["Typing · Working in the terminal"] });
    });
    test("accepts every palette and workspace action through the real companion parser", () => {
        for (const route of [
            "coucou",
            "coucou-white",
            "coucou-red",
            "coucou-orange",
            "coucou-yellow",
            "coucou-green",
            "coucou-teal",
            "coucou-sky",
            "coucou-indigo",
            "coucou-purple",
            "coucou-pink",
        ]) {
            expect(
                parseCoucouHudEvent(JSON.stringify({ ...event, event: "action", action: "theme-select", route }))
            ).toMatchObject({ route });
        }
        expect(
            parseCoucouHudEvent(
                JSON.stringify({ ...event, event: "action", action: "theme-select", route: "arbitrary" })
            )
        ).toBeUndefined();
        for (const action of ["workspace-create", "workspace-select:workspace-1"]) {
            expect(parseCoucouHudEvent(JSON.stringify({ ...event, event: "action", action }))).toMatchObject({
                action,
            });
        }
    });
    test("accepts browser navigation and tabs through the companion parser", () => {
        for (const action of [
            "browser-navigate",
            "browser-back",
            "browser-forward",
            "browser-reload",
            "browser-select:tab-1",
        ])
            expect(parseCoucouHudEvent(JSON.stringify({ ...event, event: "action", action }))).toMatchObject({
                action,
            });
        expect(
            parseCoucouHudEvent(JSON.stringify({ ...event, event: "action", action: "browser-select:../../other" }))
        ).toBeUndefined();
    });
    test("accepts revisioned layout and rejects missing or malformed intent", () => {
        const layout = { ...event, event: "chat-layout", layoutRevision: 3, layoutReady: false, chatIntent: true };
        expect(parseCoucouHudEvent(JSON.stringify(layout))).toMatchObject({ layoutRevision: 3, chatIntent: true });
        for (const invalid of [
            { layoutRevision: -1 },
            { layoutRevision: 1.5 },
            { layoutReady: "yes" },
            { chatIntent: null },
        ])
            expect(parseCoucouHudEvent(JSON.stringify({ ...layout, ...invalid }))).toBeUndefined();
    });
    test("accepts simultaneous widget chat and rejects malformed split flags", () => {
        expect(parseCoucouHudEvent(JSON.stringify({ ...event, event: "chat-open", splitChat: true }))).toMatchObject({
            splitChat: true,
        });
        expect(
            parseCoucouHudEvent(JSON.stringify({ ...event, event: "chat-open", splitChat: "true" }))
        ).toBeUndefined();
    });
    test("routes live work and completion through the upstream agent hook protocol", () => {
        const activity = {
            source: "hermes" as const,
            surface: "terminal" as const,
            action: "type" as const,
            sessionid: "hud-chat",
            detail: "Reading file",
        };
        expect(coucouActivityPayload({ ...activity, phase: "running" })).toMatchObject({
            coucou_agent: "kronoscode",
            session_id: "hud-chat",
            hook_event_name: "PreToolUse",
            tool_input: { command: "Working in the terminal" },
        });
        expect(coucouActivityPayload({ ...activity, phase: "succeeded" }).hook_event_name).toBe("Stop");
        expect(coucouActivityPayload({ ...activity, phase: "failed" }).hook_event_name).toBe("StopFailure");
    });
    test("positions the HUD below the notch on the native panel's display", () => {
        expect(coucouChatBounds(event)).toEqual({ x: -936, y: 152, width: 360, height: 720 });
    });
    test("keeps a tall chat inside small displays", () => {
        const bounds = coucouChatBounds({ ...event, x: 0, y: 0, width: 280, height: 500 });
        expect(bounds).toEqual({ x: 16, y: 52, width: 248, height: 428 });
    });
    test("uses the native island content rectangle for integrated chat", () => {
        expect(
            coucouChatBounds({ ...event, contentX: -1062, contentY: 152, contentWidth: 612, contentHeight: 364 })
        ).toEqual({ x: -1062, y: 152, width: 612, height: 364 });
    });
    test("validates measured preview bounds on secondary displays", () => {
        const layout = {
            ...event,
            event: "preview-layout" as const,
            previewX: -1000,
            previewY: 152,
            previewWidth: 450,
            previewHeight: 320,
            previewVisible: true,
        };
        expect(parseCoucouHudEvent(JSON.stringify(layout))).toEqual(layout);
        expect(coucouPreviewBounds(layout)).toEqual({ x: -1000, y: 152, width: 450, height: 320 });
        for (const invalid of [
            { previewWidth: 0 },
            { previewHeight: -1 },
            { previewX: -2000 },
            { previewY: 0 },
            { previewWidth: 2000 },
            { previewVisible: "yes" },
            { previewY: null },
        ]) {
            expect(parseCoucouHudEvent(JSON.stringify({ ...layout, ...invalid }))).toBeUndefined();
        }
        expect(parseCoucouHudEvent(JSON.stringify({ ...layout, previewVisible: false }))).toBeDefined();
    });
    test("accepts only known native header actions", () => {
        const launch = { ...event, event: "action", action: "web" };
        expect(parseCoucouHudEvent(JSON.stringify(launch))).toEqual(launch);
        for (const action of [
            "pet-attach",
            "preview-dock",
            "preview-detach",
            "dock-hidden",
            "dock-visible",
            "machines",
            "android",
            "iphone",
        ]) {
            expect(parseCoucouHudEvent(JSON.stringify({ ...launch, action }))?.action).toBe(action);
        }
        expect(parseCoucouHudEvent(JSON.stringify({ ...launch, action: "run-command" }))).toBeUndefined();
    });
    test("ignores native diagnostics and malformed geometry", () => {
        expect(parseCoucouHudEvent("[Resend] HTTP 200")).toBeUndefined();
        expect(parseCoucouHudEvent(JSON.stringify({ ...event, width: -1 }))).toBeUndefined();
        expect(parseCoucouHudEvent(JSON.stringify({ ...event, event: "launch-shell" }))).toBeUndefined();
        expect(parseCoucouHudEvent(JSON.stringify(event))).toEqual(event);
    });
});

describe("Coucou state updates", () => {
    function companion() {
        return { stdin: { writable: true, write: vi.fn() }, killed: false };
    }

    test("sends only changed fields across overlapping polling updates", () => {
        const child = companion();
        const send = (state: Record<string, unknown>) => writeCoucouState(child as unknown as ChildProcess, state);
        send({ title: "Terminal", agents: [{ id: "agent" }], preview: "frame" });
        send({ agents: [{ id: "agent" }] });
        send({ title: "Terminal", preview: "frame" });
        expect(child.stdin.write).toHaveBeenCalledTimes(1);
        send({ title: "Browser", agents: [], preview: "frame" });
        expect(child.stdin.write).toHaveBeenLastCalledWith('{"title":"Browser","agents":[]}\n');
        send({ preview: "" });
        expect(child.stdin.write).toHaveBeenLastCalledWith('{"preview":""}\n');
    });

    test("keeps repeated chat-open commands actionable", () => {
        const child = companion();
        writeCoucouState(child as unknown as ChildProcess, { showChat: true });
        writeCoucouState(child as unknown as ChildProcess, { showChat: true });
        expect(child.stdin.write).toHaveBeenCalledTimes(2);
    });

    test("delivers every layout toggle instead of deduplicating button clicks", () => {
        const child = companion();
        writeCoucouState(child as unknown as ChildProcess, { chatLayout: "toggle" });
        writeCoucouState(child as unknown as ChildProcess, { chatLayout: "toggle" });
        expect(child.stdin.write).toHaveBeenCalledTimes(2);
    });

    test("replays state to replacement companions and after an unwritable stream", () => {
        const first = companion();
        first.stdin.writable = false;
        writeCoucouState(first as unknown as ChildProcess, { title: "Terminal" });
        expect(first.stdin.write).not.toHaveBeenCalled();
        first.stdin.writable = true;
        writeCoucouState(first as unknown as ChildProcess, { title: "Terminal" });
        expect(first.stdin.write).toHaveBeenCalledTimes(1);
        const second = companion();
        writeCoucouState(second as unknown as ChildProcess, { title: "Terminal" });
        expect(second.stdin.write).toHaveBeenCalledTimes(1);
    });
});

test("keeps bounded public progress, deduplicates updates, and resets for another run", () => {
    const activity = {
        source: "hermes" as const,
        surface: "terminal" as const,
        action: "thinking" as const,
        phase: "running" as const,
        runid: "one",
        thought: "private reasoning",
        detail: "raw terminal content",
    };
    const first = coucouProgress(activity);
    expect(first.steps).toEqual(["Thinking"]);
    expect(JSON.stringify(first)).not.toContain("private reasoning");
    expect(JSON.stringify(first)).not.toContain("raw terminal content");
    expect(coucouProgress(activity, first).steps).toEqual(["Thinking"]);
    const finished = coucouProgress({ ...activity, phase: "succeeded" }, first);
    expect(finished.steps).toEqual(["Thinking", "Task complete"]);
    expect(coucouProgress({ ...activity, runid: "two" }, finished).steps).toEqual(["Thinking"]);
    expect(coucouProgress(activity, { ...first, steps: ["a", "b", "c", "d"] }).steps).toHaveLength(4);
});
