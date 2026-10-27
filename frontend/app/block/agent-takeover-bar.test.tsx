// @vitest-environment jsdom
import { publishAgentActivity } from "@/types/agent-activity";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentTakeoverBar } from "./agent-takeover-bar";

const controls = vi.hoisted(() => ({ dispatch: vi.fn(), takeover: vi.fn() }));
vi.mock("@/app/components/computer-use-status-card", () => ({ dispatchComputerUseControl: controls.dispatch }));
vi.mock("@/app/view/hermes/hermes-tool-activity", () => ({ requestAgentTakeover: controls.takeover }));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const emit = (sessionid?: string, blockid = "browser", phase: "running" | "paused" = "running") =>
    act(() => {
        publishAgentActivity({
            source: "hermes",
            runid: "run",
            sessionid,
            blockid,
            surface: "browser",
            action: "click",
            phase,
        });
    });
beforeEach(() => {
    vi.useFakeTimers();
    controls.dispatch.mockClear();
    controls.takeover.mockClear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    root = createRoot(container);
    act(() => root.render(<AgentTakeoverBar blockId="browser" />));
});
afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
});
it("targets the current agent and ignores late work after takeover", () => {
    emit("session", "other");
    expect(container.querySelector("button")).toBeNull();
    emit("session");
    act(() => container.querySelector("button").click());
    expect(controls.dispatch).toHaveBeenCalledWith(
        "takeover",
        expect.objectContaining({ sessionid: "session", blockid: "browser" })
    );
    expect(controls.takeover).not.toHaveBeenCalled();
    expect(container.querySelector("button")).toBeNull();
    emit("session");
    expect(container.querySelector("button")).toBeNull();
});
it("uses the owning tab takeover route when activity has no session", () => {
    emit();
    act(() => container.querySelector("button").click());
    expect(controls.takeover).toHaveBeenCalledTimes(1);
});
it("routes the reference Stop button to cancellation", () => {
    emit("session");
    act(() => container.querySelector<HTMLButtonElement>(".agent-takeover-stop").click());
    expect(controls.dispatch).toHaveBeenCalledWith("cancel", expect.objectContaining({ sessionid: "session" }));
    expect(container.querySelector("button")).toBeNull();
});
it("removes controls when work pauses or expires", () => {
    emit("session");
    emit("session", "browser", "paused");
    expect(container.querySelector("button")).toBeNull();
    emit("session");
    act(() => vi.advanceTimersByTime(15000));
    expect(container.querySelector("button")).toBeNull();
});
it("lets the preview demonstrate takeover without stopping real sessions", () => {
    const onTakeOver = vi.fn();
    act(() => root.render(<AgentTakeoverBar blockId="preview" active onTakeOver={onTakeOver} />));
    act(() => container.querySelector("button").click());
    expect(onTakeOver).toHaveBeenCalledTimes(1);
    expect(controls.dispatch).not.toHaveBeenCalled();
});
