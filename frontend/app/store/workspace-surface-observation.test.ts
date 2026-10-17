// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { assessWorkspaceLayout, observeWorkspaceBlock, workspaceSurfaceElement } from "./workspace-surface-observation";

afterEach(() => {
    document.body.innerHTML = "";
});
describe("workspace observations", () => {
    it("reports both agent and companion panes using rendered visibility, with no bounds for parked blocks", () => {
        document.body.innerHTML =
            '<section class="widget-tabs-layout"><div data-live-blockid="agent"></div><div data-live-blockid="companion"></div><div data-live-blockid="parked" style="display:none"></div></section>';
        for (const element of document.querySelectorAll<HTMLElement>("[data-live-blockid]")) {
            element.getBoundingClientRect = () => ({ x: 100, y: 200, width: 400, height: 300 }) as DOMRect;
        }
        expect(observeWorkspaceBlock("agent", false).visible).toBe(true);
        expect(observeWorkspaceBlock("companion", false).bounds).toEqual({ x: 100, y: 200, width: 400, height: 300 });
        expect(observeWorkspaceBlock("parked", false)).toMatchObject({
            visible: false,
            availability: "hidden",
            bounds: undefined,
        });
        expect(observeWorkspaceBlock("agent", true)).toMatchObject({
            geometryscope: "desktop-window",
            bounds: undefined,
            availability: "detached",
        });
    });
    it("selects the full-screen Web surface rather than a stale tiled container", () => {
        document.body.innerHTML = '<section class="web-mode"></section>';
        expect(workspaceSurfaceElement("web", document.createElement("div"))).toBe(document.querySelector(".web-mode"));
        expect(observeWorkspaceBlock("missing", false).availability).toBe("unmounted");
    });
});

it("distinguishes offscreen widgets from clipped readable widgets", () => {
    document.body.innerHTML = '<div data-blockid="offscreen"></div><div data-blockid="clipped"></div>';
    document.querySelector<HTMLElement>('[data-blockid="offscreen"]').getBoundingClientRect = () =>
        ({ x: 2000, y: 0, width: 400, height: 300 }) as DOMRect;
    document.querySelector<HTMLElement>('[data-blockid="clipped"]').getBoundingClientRect = () =>
        ({ x: -200, y: 0, width: 400, height: 300 }) as DOMRect;
    expect(observeWorkspaceBlock("offscreen", false)).toMatchObject({
        visible: false,
        availability: "offscreen",
        visibleFraction: 0,
    });
    expect(observeWorkspaceBlock("clipped", false)).toMatchObject({
        visible: true,
        clipped: true,
        visibleFraction: 0.5,
    });
});

it("reports visual concerns as evidence requiring screenshot verification", () => {
    const result = assessWorkspaceLayout([
        { blockid: "tiny", visible: true, bounds: { width: 100, height: 100 }, clipped: true },
    ]);
    expect(result.screenshotRequiredForVisualQuality).toBe(true);
    expect(result.issues.map((issue) => issue.issue)).toEqual(["small-content-area", "partially-outside-viewport"]);
});
