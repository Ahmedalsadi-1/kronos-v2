// @vitest-environment jsdom

// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { clampHermesHudGeometry, hermesSurfaceController } from "./hermes-surface-controller";

afterEach(() => {
    hermesSurfaceController.resetForTests();
});

describe("Hermes surface controller", () => {
    it("defaults ordinary chat to HUD while preserving explicitly docked chat and its session", () => {
        hermesSurfaceController.requestOpenChat("session-1");
        expect(hermesSurfaceController.getSnapshot().presentation).toBe("hud");
        hermesSurfaceController.requestOpenPanel();
        hermesSurfaceController.requestOpenChat();
        expect(hermesSurfaceController.getSnapshot()).toMatchObject({ presentation: "panel", sessionId: "session-1" });
        hermesSurfaceController.requestOpenHud();
        expect(hermesSurfaceController.getSnapshot()).toMatchObject({ presentation: "hud", sessionId: "session-1" });
        hermesSurfaceController.dismiss();
        hermesSurfaceController.requestOpenChat();
        expect(hermesSurfaceController.getSnapshot().presentation).toBe("hud");
    });

    it("retains the conversation when the side panel is dismissed and reopened in the HUD", () => {
        hermesSurfaceController.requestOpenPanel("session-2");
        hermesSurfaceController.dismiss();
        expect(hermesSurfaceController.getSnapshot().presentation).toBe("closed");
        hermesSurfaceController.requestOpenHud();
        expect(hermesSurfaceController.getSnapshot()).toMatchObject({ presentation: "hud", sessionId: "session-2" });
    });
});

describe("Hermes HUD geometry", () => {
    it("reclamps saved geometry when HUD opens after the OS work area has changed", () => {
        const surface = document.createElement("div");
        surface.className = "workspace-surface-row";
        surface.dataset.workspacePresentation = "os";
        surface.getBoundingClientRect = () => new DOMRect(40, 100, 1000, 480);
        document.body.append(surface);
        try {
            hermesSurfaceController.requestOpenHud();
            const geometry = hermesSurfaceController.getSnapshot().geometry;
            expect(geometry.y).toBeGreaterThanOrEqual(188);
            expect(geometry.y + geometry.height).toBeLessThanOrEqual(502);
            expect(geometry.x).toBeGreaterThanOrEqual(52);
            expect(geometry.x + geometry.width).toBeLessThanOrEqual(1028);
        } finally {
            surface.remove();
        }
    });

    it("fits narrow displays without forcing its minimum width", () => {
        expect(clampHermesHudGeometry({}, new DOMRect(0, 0, 280, 500))).toEqual({
            x: 12,
            y: 12,
            width: 256,
            height: 410,
        });
    });
    it("defaults to a tall sidepanel and clamps saved bounds inside the workspace", () => {
        const bounds = new DOMRect(100, 50, 1000, 700);
        const initial = clampHermesHudGeometry({}, bounds);
        expect(initial).toMatchObject({ x: 112, y: 62, width: 360, height: 610 });

        expect(clampHermesHudGeometry({ x: -500, y: 2000, width: 2000, height: 20 }, bounds)).toEqual({
            x: 112,
            y: 512,
            width: 976,
            height: 160,
        });
    });
});
