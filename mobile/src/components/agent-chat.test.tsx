import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KronosHostClient } from "../lib/kronos-client";
import type { HostProfile, KronosSession } from "../types";
import { AgentChat } from "./agent-chat";

const Host: HostProfile = {
    id: "host",
    label: "Test host",
    baseUrl: "https://host.example",
    kind: "computer",
    color: "blue",
    capabilities: ["kronoscode"],
    createdAt: 0,
};
const Session: KronosSession = { id: "session", directory: "/project" };
let container: HTMLDivElement;
let root: Root;
const runtime = () => ({
    listMessages: vi
        .fn()
        .mockResolvedValue([{ info: { id: "m1", role: "assistant" }, parts: [{ type: "text", text: "Saved reply" }] }]),
    getSessionStatuses: vi.fn().mockResolvedValue({}),
    onEvent: vi.fn(() => vi.fn()),
    sendMessage: vi.fn().mockResolvedValue("sent"),
    abortSession: vi.fn().mockResolvedValue(true),
});

beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

const enterDraft = async (value: string) => {
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
};

describe("native mobile agent chat", () => {
    it("loads the real transcript without an embedded web chat", async () => {
        const client = runtime();
        await act(async () =>
            root.render(
                <AgentChat
                    open
                    hostsLoaded
                    host={Host}
                    session={Session}
                    client={client as unknown as KronosHostClient}
                    onEnsureSession={async () => Session}
                    onOpenHosts={vi.fn()}
                    onOpenWorkspace={vi.fn()}
                />
            )
        );
        expect(client.listMessages).toHaveBeenCalledWith("session");
        expect(container.textContent).toContain("Saved reply");
        expect(container.querySelector("iframe")).toBeNull();
    });

    it("creates a first session, submits once, and clears the accepted draft", async () => {
        const client = runtime();
        function FirstChat() {
            const [session, setSession] = useState<KronosSession>();
            return (
                <AgentChat
                    open
                    hostsLoaded
                    host={Host}
                    session={session}
                    client={client as unknown as KronosHostClient}
                    onEnsureSession={async () => {
                        setSession(Session);
                        return Session;
                    }}
                    onOpenHosts={vi.fn()}
                    onOpenWorkspace={vi.fn()}
                />
            );
        }
        await act(async () => root.render(<FirstChat />));
        await enterDraft("Review the project");
        await act(async () =>
            container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(client.sendMessage).toHaveBeenCalledExactlyOnceWith("session", "Review the project", "/project");
        expect(container.querySelector("textarea")!.value).toBe("");
    });

    it("retains the draft and reports a failed submission", async () => {
        const client = runtime();
        client.sendMessage.mockRejectedValue(new Error("Host disconnected"));
        await act(async () =>
            root.render(
                <AgentChat
                    open
                    hostsLoaded
                    host={Host}
                    session={Session}
                    client={client as unknown as KronosHostClient}
                    onEnsureSession={async () => Session}
                    onOpenHosts={vi.fn()}
                    onOpenWorkspace={vi.fn()}
                />
            )
        );
        await enterDraft("Keep this task");
        await act(async () =>
            container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(container.querySelector("textarea")!.value).toBe("Keep this task");
        expect(container.querySelector('[role="alert"]')!.textContent).toContain("Host disconnected");
    });

    it("keeps stop available when cancellation is not confirmed", async () => {
        const client = runtime();
        client.getSessionStatuses.mockResolvedValue({ session: { type: "busy" } });
        client.abortSession.mockResolvedValue(false);
        await act(async () =>
            root.render(
                <AgentChat
                    open
                    hostsLoaded
                    host={Host}
                    session={Session}
                    client={client as unknown as KronosHostClient}
                    onEnsureSession={async () => Session}
                    onOpenHosts={vi.fn()}
                    onOpenWorkspace={vi.fn()}
                />
            )
        );
        await act(async () => (container.querySelector('[aria-label="Stop agent"]') as HTMLButtonElement).click());
        expect(client.abortSession).toHaveBeenCalledWith("session", "/project");
        expect(container.querySelector('[aria-label="Stop agent"]')).not.toBeNull();
        expect(container.textContent).toContain("did not confirm cancellation");
    });

    it("does not poll or expose focusable chat controls when closed", async () => {
        const client = runtime();
        await act(async () =>
            root.render(
                <AgentChat
                    open={false}
                    hostsLoaded
                    host={Host}
                    session={Session}
                    client={client as unknown as KronosHostClient}
                    onEnsureSession={async () => Session}
                    onOpenHosts={vi.fn()}
                    onOpenWorkspace={vi.fn()}
                />
            )
        );
        expect(client.listMessages).not.toHaveBeenCalled();
        expect(container.querySelector("section")!.hasAttribute("inert")).toBe(true);
    });
});
