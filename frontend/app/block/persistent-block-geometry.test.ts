// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { collectSurfaceOccluders, intersectSurfaceRects, makeSurfaceClipPath } from "./persistent-block-geometry";

const Surface = { x: 100, y: 80, width: 200, height: 100 };

describe("detached live surface clipping", () => {
    it("clips content to its viewport in unscaled local coordinates", () => {
        expect(makeSurfaceClipPath(Surface, { x: 150, y: 80, width: 100, height: 100 }, [], 400, 200)).toBe(
            'path("M100 0H300V200H100Z")'
        );
    });

    it("removes the higher window's entire frame, including its titlebar, without removing uncovered content", () => {
        expect(makeSurfaceClipPath(Surface, Surface, [{ x: 180, y: 60, width: 80, height: 90 }], 200, 100)).toBe(
            'path("M0 70H200V100H0Z M0 0H80V70H0Z M160 0H200V70H160Z")'
        );
    });

    it("handles overlapping occluders without even-odd holes revealing hidden content", () => {
        expect(
            makeSurfaceClipPath(
                Surface,
                Surface,
                [
                    { x: 100, y: 80, width: 100, height: 100 },
                    { x: 150, y: 80, width: 100, height: 100 },
                ],
                200,
                100
            )
        ).toBe('path("M150 0H200V100H150Z")');
    });

    it("clips fully covered or out-of-viewport surfaces and ignores disjoint windows", () => {
        expect(makeSurfaceClipPath(Surface, Surface, [Surface], 200, 100)).toBe("inset(100%)");
        expect(makeSurfaceClipPath(Surface, { x: 0, y: 0, width: 10, height: 10 }, [], 200, 100)).toBe("inset(100%)");
        expect(makeSurfaceClipPath(Surface, Surface, [{ x: 400, y: 80, width: 20, height: 20 }], 200, 100)).toBe(
            'path("M0 0H200V100H0Z")'
        );
        expect(intersectSurfaceRects(Surface, { x: 0, y: 0, width: 10, height: 10 }).width).toBe(0);
    });
});

describe("live surface DOM occlusion", () => {
    it("respects OS ranks and visible original shadow nodes without clipping the entire shadow host", () => {
        const scene = document.createElement("div");
        document.body.append(scene);
        const add = (parent: Element | ShadowRoot, className: string, z = 0, width = 80) => {
            const element = document.createElement("div");
            element.className = className;
            element.style.zIndex = String(z);
            element.getBoundingClientRect = () => ({ x: z, y: 0, width, height: 40 }) as DOMRect;
            parent.append(element);
            return element;
        };
        try {
            const owner = add(scene, "os-window", 4);
            const slot = add(owner, "slot");
            add(owner, "os-canvas-object", 99);
            add(scene, "os-window", 3);
            add(scene, "os-canvas-object", 5);
            const hidden = add(scene, "os-canvas-object", 6);
            hidden.style.display = "none";
            const world = add(scene, "", 0, 1500);
            world.dataset.workflowWorld = "";
            const shadow = world.attachShadow({ mode: "open" });
            add(shadow, "vue-flow__node", 2);
            add(shadow, "vue-flow__node", 7);
            const chrome = add(scene, "", 1500, 1500);
            chrome.dataset.workflowChrome = "";
            chrome.style.pointerEvents = "none";
            const chromeShadow = chrome.attachShadow({ mode: "open" });
            const full = add(chromeShadow, "", 0, 1500);
            full.style.pointerEvents = "none";
            const picker = add(full, "", 8, 320);
            picker.style.pointerEvents = "auto";
            const details = add(scene, "", 1700, 1500);
            details.dataset.workflowDetails = "";
            details.style.pointerEvents = "none";
            const dialog = add(details.attachShadow({ mode: "open" }), "", 10, 760);
            dialog.dataset.workflowNodeEditor = "";
            dialog.style.pointerEvents = "auto";
            add(dialog, "", 11, 200).style.pointerEvents = "auto";
            const empty = add(full, "", 9, 0);
            empty.style.pointerEvents = "auto";
            expect(collectSurfaceOccluders(scene, slot, owner, true).map((rect) => rect.x)).toEqual([5, 7, 8, 10]);
            world.hidden = true;
            picker.style.opacity = "0";
            expect(collectSurfaceOccluders(scene, slot, owner, true).map((rect) => rect.x)).toEqual([5, 10]);
        } finally {
            scene.remove();
        }
    });
});

it("keeps widget content below a floating focus card interactive instead of clipping the full panel host", () => {
    const scene = document.createElement("div");
    document.body.append(scene);
    const owner = document.createElement("div");
    owner.className = "os-window";
    owner.style.zIndex = "1";
    const slot = document.createElement("div");
    owner.append(slot);
    scene.append(owner);
    const host = document.createElement("div");
    host.dataset.workflowDetails = "";
    host.style.cssText = "z-index:1700;pointer-events:none";
    host.getBoundingClientRect = () => ({ x: 240, y: 0, width: 760, height: 800 }) as DOMRect;
    scene.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const portal = document.createElement("div");
    portal.style.pointerEvents = "none";
    shadow.append(portal);
    const card = document.createElement("div");
    card.dataset.testId = "focus-sidebar";
    card.style.pointerEvents = "auto";
    card.getBoundingClientRect = () => ({ x: 660, y: 0, width: 340, height: 280 }) as DOMRect;
    portal.append(card);
    try {
        const occluders = collectSurfaceOccluders(scene, slot, owner, true);
        expect(occluders).toHaveLength(1);
        expect(occluders[0]).toEqual({ x: 660, y: 0, width: 340, height: 280 });
        const surface = { x: 0, y: 0, width: 1000, height: 800 };
        expect(makeSurfaceClipPath(surface, surface, occluders, 1000, 800)).toContain("M0 280H1000V800H0Z");
    } finally {
        scene.remove();
    }
});
