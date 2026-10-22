// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSWorkspaceSetup } from "./os-workspace-setup";
const runtime = vi.hoisted(() => ({ openAgentWorkspace: vi.fn(), openBotDesktop: vi.fn(), switchWorkspace: vi.fn() }));
vi.mock("@/store/global", () => ({ getApi: () => runtime }));

it("loads the upstream source UI and accepts a channel only from its exact frame and origin", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    runtime.openAgentWorkspace.mockResolvedValue({
        origin: "http://127.0.0.1:9012",
        parentOrigin: "http://localhost:9124",
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    try {
        await act(async () => root.render(<OSWorkspaceSetup onCreate={onCreate} onClose={() => {}} />));
        const frame = container.querySelector("iframe");
        expect(new URL(frame.src).pathname).toBe("/kronterm-setup");
        const data = { source: "kronterm-openmausbot", type: "created", group: { id: "channel-1", name: "Research" } };
        await act(async () =>
            window.dispatchEvent(
                new MessageEvent("message", { origin: "https://example.com", source: frame.contentWindow, data })
            )
        );
        expect(onCreate).not.toHaveBeenCalled();
        await act(async () =>
            window.dispatchEvent(new MessageEvent("message", { origin: "http://127.0.0.1:9012", source: window, data }))
        );
        expect(onCreate).not.toHaveBeenCalled();
        await act(async () =>
            window.dispatchEvent(
                new MessageEvent("message", { origin: "http://127.0.0.1:9012", source: frame.contentWindow, data })
            )
        );
        expect(onCreate).toHaveBeenCalledWith(
            "Research",
            expect.objectContaining({ id: "build" }),
            expect.objectContaining({ status: "active", upstreamGroupId: "channel-1" })
        );
        await act(async () =>
            window.dispatchEvent(
                new MessageEvent("message", { origin: "http://127.0.0.1:9012", source: frame.contentWindow, data })
            )
        );
        expect(onCreate).toHaveBeenCalledTimes(1);
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});

it("opens a saved upstream channel in the actual messaging app", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    runtime.openAgentWorkspace.mockResolvedValue({ origin: "http://127.0.0.1:9012", parentOrigin: "null" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () =>
            root.render(
                <OSWorkspaceSetup
                    editing
                    initialChannel={{
                        version: 1,
                        status: "active",
                        engine: "kronoscode",
                        companion: "coucou",
                        bots: [],
                        upstreamGroupId: "saved-group",
                    }}
                    onCreate={async () => {}}
                    onClose={() => {}}
                />
            )
        );
        const url = new URL(container.querySelector("iframe").src);
        expect(url.pathname).toBe("/kronterm-app");
        expect(url.searchParams.get("group")).toBe("saved-group");
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});

it("opens only the trusted bot desktop and switches to its saved workspace", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    runtime.openAgentWorkspace.mockResolvedValue({ origin: "http://127.0.0.1:9012", parentOrigin: "null" });
    runtime.openBotDesktop.mockResolvedValue({ botId: "bot-one", workspaceId: "bot-workspace" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onClose = vi.fn();
    try {
        await act(async () => root.render(<OSWorkspaceSetup onCreate={async () => {}} onClose={onClose} />));
        const frame = container.querySelector("iframe");
        const data = { source: "kronterm-openmausbot", type: "open-desktop", botId: "bot-one" };
        await act(async () =>
            window.dispatchEvent(
                new MessageEvent("message", { origin: "https://example.com", source: frame.contentWindow, data })
            )
        );
        expect(runtime.openBotDesktop).not.toHaveBeenCalled();
        await act(async () =>
            window.dispatchEvent(
                new MessageEvent("message", { origin: "http://127.0.0.1:9012", source: frame.contentWindow, data })
            )
        );
        expect(runtime.openBotDesktop).toHaveBeenCalledWith("bot-one");
        expect(runtime.switchWorkspace).toHaveBeenCalledWith("bot-workspace");
        expect(onClose).toHaveBeenCalledOnce();
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});
