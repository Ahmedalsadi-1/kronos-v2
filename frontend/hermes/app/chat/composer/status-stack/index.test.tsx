// @vitest-environment jsdom

import { createClientSessionState } from "@hermes/lib/chat-runtime";
import { $sessionStates, dropSessionState, publishSessionState } from "@hermes/store/session-states";
import { $subagentsBySession, clearSessionSubagents, upsertSubagent } from "@hermes/store/subagents";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { useSessionStatusPresence } from "../hooks/use-status-presence";
import { ComposerStatusStack } from "./index";

test("keeps Stop available after the parent turn ends until this chat's worker settles", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const onStop = vi.fn();
    const stopButton = () => container.querySelector<HTMLButtonElement>('[aria-label="Stop 1 Subagent"]');
    try {
        upsertSubagent("chat-1", { subagent_id: "worker-1", status: "running" });
        upsertSubagent("chat-2", { subagent_id: "worker-2", status: "running" });
        await act(() => {
            root.render(
                <MemoryRouter>
                    <ComposerStatusStack queue={null} sessionId="chat-1" onStopSubagents={onStop} />
                </MemoryRouter>
            );
        });
        expect(stopButton()).not.toBeNull();
        await act(() => stopButton().click());
        expect(onStop).toHaveBeenCalledOnce();

        await act(() => {
            upsertSubagent("chat-1", { subagent_id: "worker-1", status: "interrupted" }, false, "subagent.complete");
        });
        expect(stopButton()).toBeNull();
    } finally {
        await act(() => root.unmount());
        clearSessionSubagents("chat-1");
        clearSessionSubagents("chat-2");
        vi.unstubAllGlobals();
    }
});

test("keeps the stored chat's swarm workers through a runtime reconnect", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const previousSubagents = $subagentsBySession.get();
    const stored = "stored-chat";
    const oldRuntime = "original-runtime";
    const newRuntime = "resumed-runtime";
    const swarm = { subagent_id: "swarm-worker", status: "running", swarm_worker: true, goal: "Inspect inventory" };
    function Status({ runtime }: { runtime: string }) {
        const present = useSessionStatusPresence(runtime, stored);
        return (
            <div data-status-present={present}>
                <ComposerStatusStack queue={null} sessionId={runtime} storedSessionId={stored} />
            </div>
        );
    }
    const render = (runtime: string) =>
        root.render(
            <MemoryRouter>
                <Status runtime={runtime} />
            </MemoryRouter>
        );
    try {
        publishSessionState(oldRuntime, createClientSessionState(stored));
        upsertSubagent(stored, swarm);
        upsertSubagent(oldRuntime, { ...swarm, goal: "Stale copy" });
        upsertSubagent(oldRuntime, { subagent_id: "old-delegate", status: "running" });
        upsertSubagent(stored, { subagent_id: "stored-delegate", status: "running" });
        upsertSubagent("other-stored-chat", { ...swarm, subagent_id: "other-swarm" });
        await act(() => render(oldRuntime));
        expect(container.textContent).toContain("2 Subagents");

        await act(() => {
            dropSessionState(oldRuntime);
            publishSessionState(newRuntime, createClientSessionState(stored));
            render(newRuntime);
        });
        expect($sessionStates.get()[oldRuntime]).toBeUndefined();
        expect(container.querySelector('[data-status-present="true"]')).not.toBeNull();
        const group = Array.from(container.querySelectorAll("button")).find(
            (button) => button.textContent === "1 Subagent"
        );
        expect(group).toBeDefined();
        await act(() => group.click());
        const worker = Array.from(container.querySelectorAll<HTMLElement>('[role="button"]')).find((button) =>
            button.textContent.includes("Inspect inventory")
        );
        expect(worker).toBeDefined();
        await act(() => worker.click());
        expect(document.querySelector('[role="dialog"]').textContent).toContain("Inspect inventory");
        expect(document.querySelectorAll('[role="tab"]')).toHaveLength(1);

        await act(() => {
            upsertSubagent(stored, { ...swarm, status: "completed" }, false, "subagent.complete");
        });
        expect(container.querySelector('[data-status-present="false"]')).not.toBeNull();
    } finally {
        await act(() => root.unmount());
        container.remove();
        dropSessionState(oldRuntime);
        dropSessionState(newRuntime);
        $subagentsBySession.set(previousSubagents);
        vi.unstubAllGlobals();
    }
});
