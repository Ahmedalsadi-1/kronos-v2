// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSWorkspaceSetup } from "./os-workspace-setup";

it("creates a KronOS workspace without mounting the OpenMausBot UI", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    try {
        await act(async () => root.render(<OSWorkspaceSetup onCreate={onCreate} onClose={() => {}} />));
        expect(host.querySelector("iframe")).toBeNull();
        const input = host.querySelector("input");
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        await act(async () => {
            setValue.call(input, " Research ");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true })));
        expect(onCreate).toHaveBeenCalledWith("Research", expect.objectContaining({ id: "build" }), undefined);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("keeps the linked channel when renaming an existing workspace", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const channel = {
        version: 1,
        status: "active",
        engine: "kronoscode",
        companion: "coucou",
        upstreamGroupId: "saved-group",
        bots: [],
    } as const;
    try {
        await act(async () =>
            root.render(
                <OSWorkspaceSetup
                    editing
                    initialName="Research"
                    initialChannel={{ ...channel, bots: [] }}
                    onCreate={onCreate}
                    onClose={() => {}}
                />
            )
        );
        await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true })));
        expect(onCreate).toHaveBeenCalledWith("Research", expect.objectContaining({ id: "build" }), channel);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
