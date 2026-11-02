// @vitest-environment jsdom
import { publishAgentActivity } from "@/types/agent-activity";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ManagedVncScreen } from "./managed-vnc-screen";
vi.mock("@/app/view/agent-surface-cursor", () => ({ AgentSurfaceCursor: () => <div data-agent-cursor="" /> }));
const clients = vi.hoisted(() => [] as any[]);
vi.mock("@novnc/novnc", () => ({
    default: class {
        disconnect = vi.fn();
        addEventListener = vi.fn();
        viewOnly = false;
        scaleViewport = true;
        constructor(
            _element: unknown,
            public url: string
        ) {
            clients.push(this);
        }
    },
}));
it("keeps two computers connected independently and preserves the connection on fullscreen", async () => {
    clients.length = 0;
    const container = document.createElement("div");
    const root = createRoot(container);
    const fullscreen = vi.fn(async () => {});
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: fullscreen });
    try {
        await act(async () =>
            root.render(
                <>
                    <ManagedVncScreen
                        desktop={{ id: "one", status: "running", viewerUrl: "ws://127.0.0.1:10001/one" } as any}
                    />
                    <ManagedVncScreen
                        desktop={{ id: "two", status: "running", viewerUrl: "ws://127.0.0.1:10002/two" } as any}
                    />
                </>
            )
        );
        expect(clients.map((client) => client.url)).toEqual(["ws://127.0.0.1:10001/one", "ws://127.0.0.1:10002/two"]);
        const button = [...container.querySelectorAll("button")].find((button) => button.textContent === "Fullscreen");
        await act(async () => button.click());
        expect(fullscreen).toHaveBeenCalledTimes(1);
        expect(clients).toHaveLength(2);
        expect(clients[0].disconnect).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        delete HTMLElement.prototype.requestFullscreen;
    }
    expect(clients.every((client) => client.disconnect.mock.calls.length === 1)).toBe(true);
});

it("fences agent input before connecting and preserves that fence when takeover fails", async () => {
    clients.length = 0;
    const container = document.createElement("div");
    const root = createRoot(container);
    const takeover = vi.fn(async () => {
        throw new Error("Control changed");
    });
    try {
        await act(async () =>
            root.render(
                <ManagedVncScreen
                    desktop={
                        {
                            id: "one",
                            status: "running",
                            viewerUrl: "ws://127.0.0.1:10001/one",
                            controlOwner: "agent",
                        } as any
                    }
                    onTakeControl={takeover}
                />
            )
        );
        expect(clients[0].viewOnly).toBe(true);
        expect(container.textContent).toContain("Agent has control");
        const button = [...container.querySelectorAll("button")].find((button) => button.textContent === "Take over");
        await act(async () => button.click());
        expect(takeover).toHaveBeenCalledOnce();
        expect(clients[0].viewOnly).toBe(true);
        expect(container.querySelector('[role="alert"]').textContent).toContain("Control changed");
        expect(clients).toHaveLength(1);
    } finally {
        await act(async () => root.unmount());
    }
});

it("shows activity only for this VM and keeps the cursor subscriber mounted through approval", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const event = {
        source: "acp" as const,
        surface: "sandbox" as const,
        action: "click" as const,
        phase: "running" as const,
        runid: "computer-test",
    };
    try {
        await act(async () =>
            root.render(
                <ManagedVncScreen
                    desktop={
                        {
                            id: "one",
                            status: "running",
                            viewerUrl: "ws://127.0.0.1:10001/one",
                            controlOwner: "agent",
                        } as any
                    }
                />
            )
        );
        await act(async () => {
            publishAgentActivity({ ...event, surfaceid: "vm:other" });
        });
        expect(container.querySelector('[data-active="true"]')).toBeNull();
        expect(container.querySelector("[data-agent-cursor]")).not.toBeNull();
        await act(async () => {
            publishAgentActivity({ ...event, surfaceid: "vm:one" });
        });
        expect(container.querySelector('[data-active="true"]')).not.toBeNull();
        expect(container.querySelector("[data-agent-cursor]")).not.toBeNull();
        await act(async () => {
            publishAgentActivity({ ...event, surfaceid: "vm:one", phase: "awaiting-approval" });
        });
        expect(container.textContent).toContain("Awaiting approval");
        expect(container.querySelector('[data-approval="true"]')).not.toBeNull();
        expect(container.querySelector("[data-agent-cursor]")).not.toBeNull();
    } finally {
        await act(async () => root.unmount());
    }
});
