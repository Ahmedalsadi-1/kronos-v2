// @vitest-environment jsdom
import { registerSubagentSurfaceSource, registerSwarmWorkerStop } from "@hermes/lib/subagent-surface";
import type { SubagentProgress } from "@hermes/store/subagents";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SubagentTheater } from "./subagent-theater";

const Agents: SubagentProgress[] = ["a", "b"].map((id) => ({
    id,
    sessionId: `child-${id}`,
    parentId: null,
    goal: `Agent ${id}`,
    status: "running",
    taskCount: 2,
    taskIndex: 0,
    startedAt: 0,
    updatedAt: 0,
    filesRead: [],
    filesWritten: [],
    stream: [{ at: 0, kind: "tool", text: `Activity ${id}` }],
}));

it("switches agent previews, stops only the selected child, and closes without stopping", async () => {
    const unsubscribed = vi.fn();
    registerSubagentSurfaceSource((target, update) => {
        update({ imageUrl: `data:image/png;base64,${target.id}`, title: target.id });
        return unsubscribed;
    });
    const onClose = vi.fn();
    const onStop = vi.fn(async () => {});
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<SubagentTheater agents={Agents} onClose={onClose} onStop={onStop} />));
        expect(document.querySelector("img").getAttribute("src")).toContain(",a");
        act(() => document.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
        expect(document.querySelector("img").getAttribute("src")).toContain(",b");
        expect(document.querySelector('[aria-label="Agent activity"]').textContent).toContain("Activity b");
        expect(unsubscribed).toHaveBeenCalledTimes(1);
        await act(async () =>
            Array.from(document.querySelectorAll("button"))
                .find((button) => button.textContent.includes("Stop agent"))
                .click()
        );
        expect(onStop).toHaveBeenCalledExactlyOnceWith(Agents[1]);
        act(() => document.querySelector<HTMLButtonElement>('[aria-label="Close subagents"]').click());
        expect(onClose).toHaveBeenCalledOnce();
        expect(onStop).toHaveBeenCalledTimes(1);
    } finally {
        act(() => root.unmount());
        host.remove();
    }
});

it("shows file edits and tool output in the main box without leaking the previous agent's screenshot", async () => {
    registerSubagentSurfaceSource((target, update) => {
        if (target.id === "a") update({ imageUrl: "data:image/png;base64,browser", title: "Browser" });
        return () => {};
    });
    const agents = [
        Agents[0],
        {
            ...Agents[1],
            currentTool: "apply_patch",
            toolPreview: "Updating retry handling",
            inlineDiff: "- retries: 0\n+ retries: 2",
            filesWritten: ["src/browser.ts"],
        },
    ];
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<SubagentTheater agents={agents} onClose={() => {}} />));
        expect(document.querySelector("img")).not.toBeNull();
        act(() => document.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
        expect(document.querySelector("img")).toBeNull();
        const panel = document.querySelector('[aria-label="Selected agent tool"]');
        expect(panel.textContent).toContain("Updating retry handling");
        expect(panel.textContent).toContain("src/browser.ts");
        expect(panel.textContent).toContain("+ retries: 2");
        expect(panel.textContent).not.toContain("Waiting for screenshot");
    } finally {
        act(() => root.unmount());
        host.remove();
    }
});

it("uses the exact swarm worker session for Stop only after the worker is live", async () => {
    const stop = vi.fn(async () => {});
    registerSwarmWorkerStop(stop);
    const source = vi.fn(() => () => {});
    registerSubagentSurfaceSource(source);
    const settled = { ...Agents[0], status: "failed", swarm: { outcome: "uncertain" } } as const;
    const queued = { ...Agents[1], status: "queued", sessionId: undefined, swarm: {} } as const;
    const live = { ...queued, status: "running", sessionId: "live-b" } as const;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const stopButton = () =>
        Array.from(document.querySelectorAll("button")).find((button) => button.textContent.includes("Stop agent"));
    try {
        await act(async () =>
            root.render(<SubagentTheater agents={[settled, queued]} initialAgentId="b" onClose={() => {}} />)
        );
        expect(document.querySelectorAll('[role="tab"]')[0].textContent).toContain("Uncertain");
        expect(stopButton()).toBeUndefined();
        expect(source).toHaveBeenLastCalledWith(
            { id: "b", sessionId: undefined, live: false, swarm: true },
            expect.any(Function)
        );
        await act(async () =>
            root.render(<SubagentTheater agents={[settled, live]} initialAgentId="b" onClose={() => {}} />)
        );
        await act(async () => stopButton().click());
        expect(stop).toHaveBeenCalledExactlyOnceWith("live-b");
    } finally {
        act(() => root.unmount());
        host.remove();
    }
});

it("clears the previous session's preview when the same worker ID is reused", async () => {
    registerSubagentSurfaceSource((target, update) => {
        if (target.sessionId === "child-a") update({ imageUrl: "data:image/png;base64,old-session" });
        return () => {};
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<SubagentTheater agents={[Agents[0]]} onClose={() => {}} />));
        expect(document.querySelector("img")).not.toBeNull();
        await act(async () =>
            root.render(<SubagentTheater agents={[{ ...Agents[0], sessionId: "replacement" }]} onClose={() => {}} />)
        );
        expect(document.querySelector("img")).toBeNull();
    } finally {
        act(() => root.unmount());
        host.remove();
    }
});
