// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { getOSNavigationTarget, placeOSCanvasObject, validateOSSurfaceControl } from "./os-surface-control";
import { getOSSurfaceCamera, makeInitialOSModeState } from "./os-workspace-model";
import type { WorkspaceSurfaceControlInput } from "./workspace-surface-runtime";

function state() {
    return makeInitialOSModeState({ oid: "tab", blockids: ["browser", "terminal"], meta: {} } as Tab, [
        "browser",
        "terminal",
    ]);
}

describe("OS surface targets", () => {
    it.each(["os.window.move", "os.window.resize", "os.window.minimize", "os.window.restore", "spatial.detach"])(
        "rejects stale targets for %s",
        (action) => {
            expect(
                validateOSSurfaceControl(state(), {
                    action,
                    blockid: "closed",
                    x: 0,
                    y: 0,
                    width: 500,
                    height: 400,
                } as WorkspaceSurfaceControlInput)
            ).toBe("OS window not found.");
        }
    );

    it("rejects missing or identical docking targets", () => {
        for (const targetblockid of ["closed", "browser", undefined]) {
            expect(
                validateOSSurfaceControl(state(), {
                    action: "os.window.snap",
                    blockid: "browser",
                    targetblockid,
                    side: "left",
                })
            ).toContain("different live target");
        }
        expect(
            validateOSSurfaceControl(state(), {
                action: "os.window.snap",
                blockid: "browser",
                targetblockid: "terminal",
                side: "right",
            })
        ).toBeUndefined();
    });

    it("rejects invalid geometry while preserving zero coordinates", () => {
        expect(validateOSSurfaceControl(state(), { action: "move", blockid: "browser", x: 0, y: 0 })).toBeUndefined();
        expect(validateOSSurfaceControl(state(), { action: "move", blockid: "browser", x: Infinity, y: 0 })).toContain(
            "Finite"
        );
        expect(
            validateOSSurfaceControl(state(), { action: "resize", blockid: "browser", width: -1, height: 400 })
        ).toContain("Positive");
    });

    it("rejects stale whiteboard objects", () => {
        expect(validateOSSurfaceControl(state(), { action: "delete_object", objectid: "deleted" })).toContain(
            "object not found"
        );
    });
});

describe("OS observation coordinates", () => {
    it("reports the camera actually applied to the window plane in every scene", () => {
        const current = state();
        current.camera = { x: 123, y: 456, zoom: 0.5 };
        current.scene = { kind: "freeform" };
        expect(getOSSurfaceCamera(current)).toEqual(current.camera);
        for (const scene of [
            { kind: "focused", blockId: "browser" },
            { kind: "overview" },
            { kind: "grouped", groupId: "pair" },
        ] as const) {
            expect(getOSSurfaceCamera({ ...current, scene })).toEqual({ x: 0, y: 0, zoom: 1 });
        }
    });
});

describe("shared Canvas controls in OS", () => {
    it("honors note geometry and appearance, and avoids occupied space", () => {
        const current = state();
        current.windows = {};
        const note = { id: "note", kind: "note" as const, x: 200, y: 200, width: 260, height: 180 };
        const input = { x: 0, y: 0, width: 333, height: 222, text: "Context", color: "blue" };
        expect(placeOSCanvasObject(current, note, input)).toMatchObject(input);
        current.objects = [note];
        expect(placeOSCanvasObject(current, note, { x: 200, y: 200 }).y).not.toBeNaN();
        expect(placeOSCanvasObject(current, note, { x: 200, y: 200 })).not.toEqual(note);
        expect(validateOSSurfaceControl(current, { action: "add_note", width: 0 })).toContain("geometry");
        expect(validateOSSurfaceControl(current, { action: "add_note", color: "invalid" })).toContain("color");
    });
    it("requires live distinct connector endpoints and navigates by window location", () => {
        const current = state();
        current.objects = [{ id: "a", kind: "note", x: 0, y: 0, width: 20, height: 20 }, { id: "b", kind: "note", x: 80, y: 0, width: 20, height: 20 }];
        expect(validateOSSurfaceControl(current, { action: "connect_objects", fromobjectid: "a", toobjectid: "b" })).toBeUndefined();
        expect(validateOSSurfaceControl(current, { action: "connect_objects", fromobjectid: "a", toobjectid: "deleted" })).toContain("live objects");
        current.selectedEntityId = "browser";
        current.windows.browser.bounds = { x: 0, y: 0, width: 400, height: 300 };
        current.windows.terminal.bounds = { x: 500, y: 0, width: 400, height: 300 };
        expect(getOSNavigationTarget(current, "right")).toBe("terminal");
        expect(getOSNavigationTarget(current, "left")).toBeUndefined();
    });
});
