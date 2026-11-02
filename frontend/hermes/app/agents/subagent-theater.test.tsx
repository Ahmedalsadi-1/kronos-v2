// @vitest-environment jsdom
import { registerSubagentSurfaceSource } from "@hermes/lib/subagent-surface";
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
