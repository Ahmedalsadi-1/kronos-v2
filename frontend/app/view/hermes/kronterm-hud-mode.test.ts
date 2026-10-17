// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSurfaceUiActivityEvent, type LiveAgentSurfaceActivity } from "../../../types/agent-activity";
import { useKrontermHudMode, type KrontermHudModeState } from "./kronterm-hud-mode";

describe("HUD activity lifecycle", () => {
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    let snapshot: KrontermHudModeState;
    beforeEach(() => {
        vi.useFakeTimers();
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        root = createRoot(container);
        const Probe = () => {
            snapshot = useKrontermHudMode();
            return null;
        };
        act(() => root.render(createElement(Probe)));
    });
    afterEach(() => {
        act(() => root.unmount());
        vi.useRealTimers();
        delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    });
    const send = (phase: LiveAgentSurfaceActivity["phase"], runid = "run1") =>
        act(() => {
            window.dispatchEvent(
                new CustomEvent(AgentSurfaceUiActivityEvent, {
                    detail: {
                        phase,
                        runid,
                        surface: "browser",
                        blockid: "browser1",
                        action: "click",
                        timestamp: 1000,
                        previewimageurl: phase === "running" ? "data:image/png;base64,preview" : undefined,
                    },
                })
            );
        });
    it("handles terminal events and clears preview after the completion hold", () => {
        send("running");
        expect(snapshot.active).toBe(true);
        send("succeeded");
        expect(snapshot.activity?.phase).toBe("succeeded");
        act(() => vi.advanceTimersByTime(5000));
        expect(snapshot.active).toBe(false);
        expect(snapshot.previewUrl).toBeUndefined();
    });
    it("ignores completion from a different run", () => {
        send("running");
        send("cancelled", "otherRun");
        act(() => vi.advanceTimersByTime(5000));
        expect(snapshot.active).toBe(true);
        expect(snapshot.activity?.runid).toBe("run1");
    });
    it("cancels pending completion when the next activity begins", () => {
        send("running");
        send("failed");
        send("running", "run2");
        act(() => vi.advanceTimersByTime(5000));
        expect(snapshot.active).toBe(true);
        expect(snapshot.activity?.runid).toBe("run2");
    });
});
