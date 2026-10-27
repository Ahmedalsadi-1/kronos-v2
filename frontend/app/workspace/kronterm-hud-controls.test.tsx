// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { kronTermHudController } from "./kronterm-hud-controller";
import { KronTermHudControls } from "./kronterm-hud-controls";

const launch = vi.hoisted(() => vi.fn().mockResolvedValue("device-block"));
vi.mock("./kronterm-hud-islands", () => ({ launchKronTermHudIsland: launch }));
vi.mock("@/store/global", () => ({ getApi: () => ({}) }));
vi.mock("@/app/view/hermes/selection-context", () => ({ desktopSelectionPrompt: vi.fn() }));
vi.mock("@/app/components/system-ui", () => ({ SystemButton: "button", SystemPopover: "section" }));

afterEach(() => {
    hermesSurfaceController.resetForTests();
    kronTermHudController.resetForTests();
    vi.clearAllMocks();
});

it.each(["hud", "panel"] as const)("returns to workspace preserving %s chat and session", async (presentation) => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    kronTermHudController.openExclusiveHud();
    if (presentation === "panel") hermesSurfaceController.requestOpenPanel("ongoing-task");
    else hermesSurfaceController.requestOpenHud("ongoing-task");
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<KronTermHudControls onOpenWidgetCatalog={vi.fn()} />));
        await act(async () =>
            host.querySelector<HTMLButtonElement>('[aria-label="Return to workspace with current chat"]').click()
        );
        expect(kronTermHudController.getSnapshot().active).toBe(false);
        expect(hermesSurfaceController.getSnapshot()).toMatchObject({ presentation, sessionId: "ongoing-task" });
    } finally {
        await act(async () => root.unmount());
    }
});

it("opens device selection through the existing shared machines surface", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<KronTermHudControls onOpenWidgetCatalog={vi.fn()} />));
        await act(async () =>
            host.querySelector<HTMLButtonElement>('[aria-label="Open Android and iOS devices"]').click()
        );
        expect(launch).toHaveBeenCalledWith("machines", { machineKind: "android", machinePicker: true });
    } finally {
        await act(async () => root.unmount());
    }
});
