// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { N8nWorkflows } from "./n8n-workflows";
import { $workflowContext } from "./workflow-context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@hermes/components/ui/codicon", () => ({ Codicon: () => null }));

it("opens real workflow and management content from one left navigation without a duplicate builder", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    const opened = vi.fn();
    let selectedWorkflowId = "flow-a";
    const api = vi.fn(async (request) => {
        const { operation, workflowId } = request.body;
        if (operation === "state")
            return {
                running: true,
                folders: [{ id: "research", name: "Research", workflowIds: ["flow-a"] }],
                selectedWorkflowId,
                accountRequired: false,
            };
        if (operation === "workflows")
            return [
                { id: "flow-a", name: "Daily briefing" },
                { id: "flow-b", name: "Browser tasks" },
            ];
        if (operation === "open") {
            selectedWorkflowId = workflowId;
            return { opened: true };
        }
        throw new Error(`Unexpected operation: ${operation}`);
    });
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    window.addEventListener("kronterm:workflow-open", opened);
    $workflowContext.set({ tabId: "tab-a", workflowId: "flow-a", hasExecutions: false });
    try {
        await act(async () => root.render(<N8nWorkflows />));
        expect(host.textContent).toContain("Research");
        expect(host.textContent).toContain("Daily briefing");
        expect(host.textContent).not.toMatch(/Connected widgets|Edit with Hermes|Stop runtime/);
        expect(opened).not.toHaveBeenCalled();
        const click = async (text: string) => {
            const button = [...host.querySelectorAll("button")].find((entry) => entry.textContent === text);
            expect(button).toBeTruthy();
            await act(async () => button.click());
        };
        await click("Browser tasks");
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({ body: { operation: "open", surface: "canvas", workflowId: "flow-b" } })
        );
        expect(opened.mock.calls.at(-1)[0].detail).toEqual({
            tabId: "tab-a",
            surface: "canvas",
            focusWorkflow: true,
            workflowId: "flow-b",
        });
        await click("Credentials");
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({ body: { operation: "open", surface: "credentials", workflowId: "flow-b" } })
        );
        expect(opened.mock.calls.at(-1)[0].detail).toEqual({ tabId: "tab-a", surface: "credentials" });
        expect(host.querySelector('[aria-label="Workflow management"]').textContent).not.toContain("Executions");
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
        $workflowContext.set({});
        window.removeEventListener("kronterm:workflow-open", opened);
    }
});

it("connects through the managed session without a separate signup", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    let running = false;
    const api = vi.fn(async (request) => {
        if (request.body.operation === "open") {
            running = true;
            return {};
        }
        if (request.body.operation === "workflows") return [];
        return { running, folders: [], workflows: [] };
    });
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    try {
        await act(async () => root.render(<N8nWorkflows />));
        expect(host.querySelector('input[type="password"]')).toBeNull();
        expect(host.querySelector('[aria-label="Workflow navigation"]')).toBeTruthy();
        expect(api.mock.calls.map(([request]) => request.body.operation)).toEqual([
            "state",
            "open",
            "state",
            "workflows",
        ]);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
    }
});

it("waits for an explicit connection switch when another tab owns the workflow runtime", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    let switched = false;
    let confirm = false;
    const api = vi.fn(async (request) => {
        const { operation, expectedGeneration } = request.body;
        if (operation === "state") return { running: switched, occupiedGeneration: switched ? undefined : 5, folders: [] };
        if (operation === "switch-workspace") {
            expect(expectedGeneration).toBe(5);
            switched = confirm;
            return confirm ? { desktop: true } : { cancelled: true };
        }
        if (operation === "workflows") return [{ id: "mine", name: "My workflow" }];
        throw new Error(`Unexpected operation: ${operation}`);
    });
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    try {
        await act(async () => root.render(<N8nWorkflows />));
        expect(api.mock.calls.map(([request]) => request.body.operation)).toEqual(["state"]);
        expect(host.textContent).toContain("Workflows are connected to another tab.");
        const switchButton = host.querySelector("button");
        await act(async () => switchButton.click());
        expect(host.textContent).toContain("Workflows are connected to another tab.");
        confirm = true;
        await act(async () => switchButton.click());
        expect(host.textContent).toContain("My workflow");
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
    }
});

it("keeps command failures through polling while clearing recovered status failures", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    let failStatus = true;
    const api = vi.fn(async (request) => {
        if (request.body.operation === "open") throw new Error("Credentials unavailable");
        if (failStatus) throw new Error("Status unavailable");
        if (request.body.operation === "workflows") return [];
        return { running: true, folders: [], workflows: [], accountRequired: false };
    });
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    try {
        await act(async () => root.render(<N8nWorkflows />));
        expect(host.querySelector('[role="alert"]').textContent).toBe("Status unavailable");
        failStatus = false;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(host.querySelector('[role="alert"]')).toBeNull();
        const credentials = [...host.querySelectorAll("button")].find((button) => button.textContent === "Credentials");
        await act(async () => credentials.click());
        expect(host.querySelector('[role="alert"]').textContent).toBe("Credentials unavailable");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(host.querySelector('[role="alert"]').textContent).toBe("Credentials unavailable");
        expect(host.textContent).not.toContain("No workflows yet.");
        const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Try again");
        await act(async () => retry.click());
        expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
        vi.useRealTimers();
    }
});

it("reconnects a stopped configured runtime once and restores saved rows without moving the OS camera", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    const opened = vi.fn();
    let running = false;
    let finishOpen: () => void;
    const api = vi.fn(async (request) => {
        const { operation } = request.body;
        if (operation === "state") return { running, accountRequired: false, selectedWorkflowId: "saved", folders: [] };
        if (operation === "open") {
            await new Promise<void>((resolve) => {
                finishOpen = resolve;
            });
            running = true;
            return {};
        }
        if (operation === "workflows") return [{ id: "saved", name: "Saved production workflow" }];
        throw new Error(operation);
    });
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    window.addEventListener("kronterm:workflow-open", opened);
    try {
        await act(async () => root.render(<N8nWorkflows />));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(15000);
        });
        expect(api.mock.calls.filter(([request]) => request.body.operation === "open")).toHaveLength(1);
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({ body: { operation: "open", surface: "canvas", workflowId: "saved" } })
        );
        await act(async () => finishOpen());
        expect(host.textContent).toContain("Saved production workflow");
        expect(opened).not.toHaveBeenCalled();
        running = false;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(api.mock.calls.filter(([request]) => request.body.operation === "open")).toHaveLength(1);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
        window.removeEventListener("kronterm:workflow-open", opened);
        vi.useRealTimers();
    }
});

it("waits for explicit workflow navigation before reconnecting and preserves navigation on re-entry", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    let running = false;
    const api = vi.fn(async (request) => {
        if (request.body.operation === "open") {
            running = true;
            return {};
        }
        if (request.body.operation === "workflows") return [{ id: "saved", name: "Recovered saved workflow" }];
        return { running, accountRequired: false, selectedWorkflowId: "saved", folders: [] };
    });
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    try {
        await act(async () => root.render(<N8nWorkflows active={false} />));
        expect(api).not.toHaveBeenCalled();
        await act(async () => root.render(<N8nWorkflows active />));
        expect(host.textContent).toContain("Recovered saved workflow");
        expect(api.mock.calls.filter(([request]) => request.body.operation === "open")).toHaveLength(1);
        running = false;
        await act(async () => root.render(<N8nWorkflows active={false} />));
        expect(host.textContent).toContain("Recovered saved workflow");
        await act(async () => root.render(<N8nWorkflows active />));
        expect(api.mock.calls.filter(([request]) => request.body.operation === "open")).toHaveLength(2);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
    }
});
