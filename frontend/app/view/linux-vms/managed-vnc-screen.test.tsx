// @vitest-environment jsdom
import { publishAgentActivity } from "@/types/agent-activity";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ManagedVncScreen } from "./managed-vnc-screen";
vi.mock("@/app/view/agent-surface-cursor", () => ({ AgentSurfaceCursor: () => <div data-agent-cursor="" /> }));
const clients = vi.hoisted(() => [] as any[]);
const capture = vi.hoisted(() => vi.fn());
vi.mock("@/store/global", () => ({ getApi: () => ({ performLinuxDesktopAction: capture }) }));
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
it("freezes the requested Linux guest and closes the picker when its control generation changes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const desktop = {
        id: "linux-vm:ubuntu",
        name: "Ubuntu",
        status: "running",
        viewerUrl: "ws://localhost/one",
        controlGeneration: 4,
    } as const;
    capture.mockResolvedValue({ success: true, data: { desktop, imageDataUrl: "data:image/png;base64,Y2FwdHVyZQ==" } });
    try {
        await act(async () => root.render(<ManagedVncScreen desktop={desktop as any} />));
        const pick = container.querySelector<HTMLIFrameElement>('iframe[title="Linux VM element selector"]');
        const message = { channel: "kronterm:screen-selector", action: "select" };
        await act(async () => window.dispatchEvent(new MessageEvent("message", { source: window, data: message })));
        expect(capture).not.toHaveBeenCalled();
        await act(async () =>
            window.dispatchEvent(
                new MessageEvent("message", {
                    source: pick.contentWindow,
                    data: message,
                })
            )
        );
        expect(capture).toHaveBeenCalledWith({ desktopId: desktop.id, action: "screenshot", expectedGeneration: 4 });
        const selection = container.querySelector('[aria-label="Frozen VM selection"]');
        expect(selection.classList.contains("kt-vm-screen-selection")).toBe(true);
        expect(selection.querySelector("select")).toBeNull();
        expect(container.querySelector('iframe[title="Linux VM element selector"]')).toBe(pick);
        await act(async () => root.render(<ManagedVncScreen desktop={{ ...desktop, controlGeneration: 5 } as any} />));
        expect(container.querySelector('[aria-label="Frozen VM selection"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
it("offers Return to agent after handback and preserves user input when returning fails", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const resume = vi.fn(async () => {
        throw new Error("Finish sign-in first");
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
                            controlOwner: "user",
                        } as any
                    }
                    onReturnControl={resume}
                />
            )
        );
        const button = [...container.querySelectorAll("button")].find(
            (element) => element.textContent === "Return to agent"
        );
        expect(button).toBeTruthy();
        await act(async () => button.click());
        expect(resume).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[role="alert"]').textContent).toBe("Finish sign-in first");
        expect(clients.at(-1).viewOnly).toBe(false);
    } finally {
        await act(async () => root.unmount());
    }
});
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
        expect(container.textContent).not.toContain("Agent has control");
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
        expect(container.querySelector('[role="status"]').getAttribute("aria-label")).toBe("Awaiting approval");
        expect(container.querySelector('[data-approval="true"]')).not.toBeNull();
        expect(container.querySelector("[data-agent-cursor]")).not.toBeNull();
    } finally {
        await act(async () => root.unmount());
    }
});
