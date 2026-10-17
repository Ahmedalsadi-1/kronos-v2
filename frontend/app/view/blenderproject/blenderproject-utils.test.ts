// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { findBlenderApp, validateBlendPath } from "./blenderproject-utils";
describe("Blender project adapter", () => {
    it("finds the installed Blender app without matching unrelated Blender tools", () => {
        const apps = [
            { name: "Blender helper", path: "/helper" },
            { name: "Blender", path: "/Applications/Blender.app", bundleid: "org.blenderfoundation.blender" },
        ] as InstalledAppInfo[];
        expect(findBlenderApp(apps)?.path).toBe("/Applications/Blender.app");
        expect(findBlenderApp(apps.slice(0, 1))).toBeUndefined();
    });
    it("keeps scene references local and requires Blender format", () => {
        expect(validateBlendPath(" ~/Scenes/scene.blend ")).toBe("~/Scenes/scene.blend");
        expect(validateBlendPath("/Users/me/Scene.BLEND")).toBe("/Users/me/Scene.BLEND");
        for (const value of ["scene.blend", "https://example.com/scene.blend", "/tmp/script.py", "/tmp/x\0.blend"])
            expect(() => validateBlendPath(value)).toThrow();
    });
});
