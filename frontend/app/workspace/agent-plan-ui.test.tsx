// @vitest-environment jsdom
import { $activeSessionId } from "@hermes/store/session";
import { $todosBySession } from "@hermes/store/todos";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentPlan } from "./agent-plan";

vi.mock("@hermes/store/session", async () => ({ $activeSessionId: (await import("nanostores")).atom("session-one") }));
vi.mock("@hermes/store/todos", async () => ({ $todosBySession: (await import("nanostores")).atom({}) }));

it("renders the selected Hermes plan and updates task states without replacing its row", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    $todosBySession.set({
        "session-one": [{ id: "read", content: "Read the editor", status: "pending" }],
        "session-two": [{ id: "other", content: "Other workspace task", status: "in_progress" }],
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () => root.render(<AgentPlan blockIds={[]} />));
        const row = container.querySelector("li");
        expect(row.textContent).toContain("pending");
        await act(async () =>
            $todosBySession.set({ "session-one": [{ id: "read", content: "Read the editor", status: "completed" }] })
        );
        expect(container.querySelector("li")).toBe(row);
        expect(row.textContent).toContain("done");
        expect(container.textContent).not.toContain("Other workspace task");
        await act(async () => $activeSessionId.set("session-two"));
        expect(container.textContent).not.toContain("Read the editor");
    } finally {
        await act(async () => root.unmount());
        $todosBySession.set({});
        vi.unstubAllGlobals();
    }
});
