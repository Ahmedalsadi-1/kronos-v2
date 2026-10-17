// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveAgentSurfaceActivity } from "../../types/agent-activity";
import { ComputerUseControlEvent, dispatchComputerUseControl } from "./computer-use-status-card";

const takeover = vi.hoisted(() => vi.fn());
vi.mock("@/app/view/hermes/hermes-tool-activity", () => ({ requestAgentTakeover: takeover }));

afterEach(() => vi.clearAllMocks());

describe("computer use controls", () => {
    it.each(["pause", "cancel", "takeover"] as const)("routes %s to the controlling session", (action) => {
        const activity = { sessionid: "active-session", blockid: "browser" } as LiveAgentSurfaceActivity;
        const listener = vi.fn();
        window.addEventListener(ComputerUseControlEvent, listener);
        try {
            dispatchComputerUseControl(action, activity);
            expect(takeover).toHaveBeenCalledExactlyOnceWith("active-session");
            expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ action, activity });
        } finally {
            window.removeEventListener(ComputerUseControlEvent, listener);
        }
    });
    it("does not interrupt unrelated chats when activity has no session identity", () => {
        dispatchComputerUseControl("takeover", { blockid: "browser" } as LiveAgentSurfaceActivity);
        expect(takeover).not.toHaveBeenCalled();
    });
});
