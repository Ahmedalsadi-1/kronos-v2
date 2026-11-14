// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import {
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorTarget,
    $krontermSidebarTarget,
} from "@hermes/lib/kronterm-sidebar";
import { setSidebarOpen } from "@hermes/store/layout";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkspaceTabManager } from "./workspace-tab-manager";

const { openKronosSignIn } = vi.hoisted(() => ({ openKronosSignIn: vi.fn() }));
vi.mock("@/app/store/global", async () => {
    const { atom } = await import("jotai");
    return {
        atoms: { workspace: atom(null), staticTabId: atom("") },
        createTab: vi.fn(),
        getApi: () => ({ openKronosSignIn }),
    };
});
vi.mock("@/app/store/wos", () => ({}));
vi.mock("@/app/tab/widget-picker-popover", () => ({ WidgetPickerPopover: () => null }));
vi.mock("@hermes/app/workflows/workflow-context", async () => {
    const { atom } = await import("nanostores");
    return { $workflowSidebarMode: atom("sessions") };
});

it("shares one inspector between Files and chat without remounting the tiles", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const click = (label: string) =>
        act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`).click());
    try {
        setSidebarOpen(false);
        await act(async () =>
            root.render(
                <WorkspaceTabManager>
                    <div data-tile="" />
                </WorkspaceTabManager>
            )
        );
        const tile = host.querySelector("[data-tile]");
        const inspector = host.querySelector<HTMLElement>("#kronterm-right-inspector");
        const sidebar = host.querySelector<HTMLElement>("#kronterm-left-sidebar");
        expect(inspector.contains($krontermInspectorTarget.get())).toBe(true);
        expect(sidebar.contains($krontermSidebarTarget.get())).toBe(true);

        await click("Sign in to KronOS");
        expect(openKronosSignIn).toHaveBeenCalledOnce();

        await click("Files");
        expect(inspector.hidden).toBe(false);
        expect($krontermInspectorSection.get()).toBe("files");
        await click("KronOS Agent chat");
        expect($krontermInspectorSection.get()).toBe("chat");
        expect(hermesSurfaceController.getSnapshot().presentation).toBe("panel");
        await click("Files");
        expect($krontermInspectorSection.get()).toBe("files");
        expect(hermesSurfaceController.getSnapshot().presentation).toBe("panel");

        await click("Agent sidebar");
        expect(sidebar.hidden).toBe(false);
        await click("Show workspace tabs");
        expect(sidebar.hidden).toBe(true);
        expect(host.querySelector("[data-tile]")).toBe(tile);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        $krontermInspectorOpen.set(false);
        $krontermInspectorSection.set("files");
        setSidebarOpen(false);
        hermesSurfaceController.dismiss();
        vi.unstubAllGlobals();
    }
    expect($krontermInspectorTarget.get()).toBeNull();
    expect($krontermSidebarTarget.get()).toBeNull();
});
