// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { kronTermHudController } from "./kronterm-hud-controller";

afterEach(() => kronTermHudController.resetForTests());

describe("KronTerm HUD controller", () => {
    it("restores island IDs only for their owning workspace", () => {
        const stored = new Map<string, string>();
        vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
        kronTermHudController.setOwnerTab("space-a");
        kronTermHudController.setActive(true);
        kronTermHudController.registerIsland("browser-a");
        kronTermHudController.setOwnerTab("space-b");
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual([]);
        kronTermHudController.setOwnerTab("space-a");
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual(["browser-a"]);
        kronTermHudController.resetForTests();
        kronTermHudController.setOwnerTab("space-a");
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual(["browser-a"]);
        vi.unstubAllGlobals();
    });
    it("toggles independently from the Hermes chat surface", () => {
        expect(kronTermHudController.getSnapshot().active).toBe(false);
        expect(kronTermHudController.toggle()).toBe(true);
        expect(kronTermHudController.getSnapshot().active).toBe(true);
        expect(kronTermHudController.toggle()).toBe(false);
    });

    it("tracks detached islands without replacing existing workspace blocks", () => {
        kronTermHudController.setActive(true);
        kronTermHudController.registerIsland("browser-block");

        expect(kronTermHudController.isIsland("browser-block")).toBe(true);
        expect(kronTermHudController.isIsland("existing-workspace-block")).toBe(false);

        kronTermHudController.unregisterIsland("browser-block");
        expect(kronTermHudController.isIsland("browser-block")).toBe(false);

        kronTermHudController.setActive(false);
        kronTermHudController.setActive(true);
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual([]);
    });

    it("retains detached widget identities when reopening HUD", () => {
        kronTermHudController.setActive(true);
        kronTermHudController.registerIsland("browser-block");
        kronTermHudController.setActive(false);
        kronTermHudController.setActive(true);
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual(["browser-block"]);
    });

    it("backgrounds and restores a widget without changing its island identity", () => {
        kronTermHudController.setActive(true);
        kronTermHudController.registerIsland("browser-block");
        kronTermHudController.setBlockBackground("browser-block", true);
        kronTermHudController.setBlockBackground("browser-block", true);
        expect(kronTermHudController.getSnapshot().backgroundBlockIds).toEqual(["browser-block"]);
        kronTermHudController.setBlockBackground("browser-block", false);
        expect(kronTermHudController.getSnapshot().backgroundBlockIds).toEqual([]);
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual(["browser-block"]);
    });

    it("can float the HUD alongside an unchanged workspace", () => {
        kronTermHudController.openAlongsideWorkspace();
        expect(kronTermHudController.getSnapshot()).toMatchObject({ active: true, keepWorkspaceVisible: true });
        kronTermHudController.registerIsland("browser-block");
        kronTermHudController.openAlongsideWorkspace();
        expect(kronTermHudController.getSnapshot().islandBlockIds).toEqual(["browser-block"]);

        kronTermHudController.setActive(false);
        kronTermHudController.toggle();
        expect(kronTermHudController.getSnapshot()).toMatchObject({ active: true, keepWorkspaceVisible: false });
    });

    it("switches an active HUD to workspace placement without losing its islands", () => {
        kronTermHudController.setActive(true);
        kronTermHudController.registerIsland("terminal-block");
        kronTermHudController.openAlongsideWorkspace();
        expect(kronTermHudController.getSnapshot()).toMatchObject({
            active: true,
            keepWorkspaceVisible: true,
            islandBlockIds: ["terminal-block"],
        });
        kronTermHudController.openExclusiveHud();
        expect(kronTermHudController.getSnapshot()).toMatchObject({
            active: true,
            keepWorkspaceVisible: false,
            islandBlockIds: ["terminal-block"],
        });
    });
});
