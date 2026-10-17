// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishAgentActivity } from "../../types/agent-activity";
import { useAgentOverlays } from "./use-agent-overlays";

describe("agent overlay lifetime", () => {
    let root: Root;
    let container: HTMLDivElement;
    let state: ReturnType<typeof useAgentOverlays>;
    function OverlayProbe() {
        state = useAgentOverlays("sandbox", "device");
        return null;
    }
    const emit = (runid: string, phase = "running") =>
        act(() => {
            publishAgentActivity({
                runid,
                phase: phase as "running",
                source: "mcp",
                surface: "sandbox",
                blockid: "device",
                action: "click",
                point: { x: 0.3, y: 0.4 },
            });
        });

    beforeEach(() => {
        vi.useFakeTimers();
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        root = createRoot(container);
        act(() => root.render(<OverlayProbe />));
    });
    afterEach(() => {
        act(() => root.unmount());
        vi.useRealTimers();
    });

    it("does not let stale completion extend the visible lifetime of the current run", () => {
        emit("old");
        emit("current");
        expect(state.markers).toHaveLength(1);
        act(() => vi.advanceTimersByTime(14_000));
        emit("old", "succeeded");
        expect(state.cursorActive).toBe(true);
        act(() => vi.advanceTimersByTime(1_001));
        expect(state.cursorActive).toBe(false);
        expect(state.markers).toEqual([]);
        expect(state.cursorLabel).toBeUndefined();
    });

    it("shows the resolved location of ref-based tool clicks until feedback settles", () => {
        emit("active");
        act(() =>
            window.dispatchEvent(
                new CustomEvent("kron-agent-pointer", {
                    detail: { blockId: "device", point: { x: 140, y: 80 }, action: "click" },
                })
            )
        );
        expect(state.cursorPoint).toEqual({ x: 140, y: 80 });
        emit("active", "succeeded");
        expect(state.cursorActive).toBe(true);
        act(() => vi.advanceTimersByTime(3001));
        expect(state.cursorActive).toBe(false);
    });

    it("clears cursor, markers, and pending expiry immediately on human takeover", () => {
        emit("active");
        expect(state.cursorActive).toBe(true);
        emit("active", "paused");
        expect(state.waterflowActive).toBe(false);
        expect(state.cursorPoint).toBeNull();
        expect(state.markers).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
});
