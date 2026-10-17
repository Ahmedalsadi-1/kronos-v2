// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
export function findBlenderApp(apps: InstalledAppInfo[]): InstalledAppInfo {
    return apps.find(
        (app) => app.bundleid === "org.blenderfoundation.blender" || /^blender(?:\.app)?$/i.test(app.name)
    );
}
export function validateBlendPath(value: string): string {
    const scene = value.trim();
    if ((!scene.startsWith("/") && !scene.startsWith("~/")) || !/\.blend$/i.test(scene) || /[\0\r\n]/.test(scene)) {
        throw new Error("Use an absolute local path to a .blend scene, or a path beginning with ~/.");
    }
    return scene;
}
