// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
    createFromPath: vi.fn(),
    getFileIcon: vi.fn(),
    execFile: vi.fn(),
}));
vi.mock("electron", () => ({
    nativeImage: { createFromPath: electronMock.createFromPath },
    app: { getFileIcon: electronMock.getFileIcon },
}));

vi.mock("node:child_process", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:child_process")>();
    electronMock.execFile.mockImplementation(original.execFile);
    return { ...original, execFile: electronMock.execFile };
});

import { loadNativeAppIcons, resolveBundleIcnsPath } from "./emain-app-icons";

let root: string;

function makeBundle(name: string, plist: Record<string, string>, icnsName?: string): string {
    const appPath = path.join(root, `${name}.app`);
    fs.mkdirSync(path.join(appPath, "Contents", "Resources"), { recursive: true });
    const entries = Object.entries(plist)
        .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
        .join("");
    fs.writeFileSync(
        path.join(appPath, "Contents", "Info.plist"),
        `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${entries}</dict></plist>`
    );
    if (icnsName) fs.writeFileSync(path.join(appPath, "Contents", "Resources", icnsName), "icns-bytes");
    return appPath;
}

beforeEach(() => {
    vi.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-app-icons-"));
    electronMock.createFromPath.mockImplementation((filePath: string) => {
        const png = fs.readFileSync(filePath, "utf8");
        return { isEmpty: () => png === "", toDataURL: () => `data:image/png;base64,${png}` };
    });
    electronMock.getFileIcon.mockResolvedValue({
        isEmpty: () => false,
        toDataURL: () => "data:image/png;base64,GENERIC",
    });
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("native app icons", () => {
    test.skipIf(process.platform !== "darwin")(
        "resolves .icns from CFBundleIconFile with or without extension",
        async () => {
            const bare = makeBundle("Bare", { CFBundleIconFile: "app" }, "app.icns");
            const explicit = makeBundle("Explicit", { CFBundleIconFile: "icon.icns" }, "icon.icns");
            const missing = makeBundle("Missing", { CFBundleIconName: "AppIcon" });
            expect(await resolveBundleIcnsPath(bare)).toBe(path.join(bare, "Contents/Resources/app.icns"));
            expect(await resolveBundleIcnsPath(explicit)).toBe(path.join(explicit, "Contents/Resources/icon.icns"));
            expect(await resolveBundleIcnsPath(missing)).toBeUndefined();
        }
    );

    test.skipIf(process.platform !== "darwin")(
        "converts bundle icons once, caches them, and falls back to getFileIcon",
        async () => {
            const chrome = makeBundle("Chrome", { CFBundleIconFile: "app" }, "app.icns");
            const catalogOnly = makeBundle("Catalog", { CFBundleIconName: "AppIcon" });
            const cacheDir = path.join(root, "cache");
            const convert = vi.fn(async (_icns: string, out: string) => {
                fs.writeFileSync(out, "REAL");
            });

            const first = await loadNativeAppIcons([chrome, catalogOnly, "/nope.app"], cacheDir, convert);
            expect(first[chrome]).toBe("data:image/png;base64,REAL");
            expect(first[catalogOnly]).toBe("data:image/png;base64,GENERIC");
            expect(first["/nope.app"]).toBe("data:image/png;base64,GENERIC");
            expect(convert).toHaveBeenCalledTimes(1);

            const second = await loadNativeAppIcons([chrome], cacheDir, convert);
            expect(second[chrome]).toBe("data:image/png;base64,REAL");
            expect(convert).toHaveBeenCalledTimes(1);
        }
    );
    test.skipIf(process.platform !== "darwin")("reuses decoded artwork across ten unchanged requests", async () => {
        const appPath = makeBundle("Warm", { CFBundleIconFile: "app" }, "app.icns");
        const cacheDir = path.join(root, "cache");
        const convert = vi.fn(async (_icns: string, out: string) => fs.writeFileSync(out, "REAL"));
        for (let index = 0; index < 10; index++) {
            expect((await loadNativeAppIcons([appPath], cacheDir, convert))[appPath]).toBe(
                "data:image/png;base64,REAL"
            );
        }
        expect(electronMock.createFromPath).toHaveBeenCalledTimes(1);
        expect(electronMock.execFile).toHaveBeenCalledTimes(1);
        expect(convert).toHaveBeenCalledTimes(1);
    });

    test.skipIf(process.platform !== "darwin")("shares conversion between overlapping requests", async () => {
        const appPath = makeBundle("Concurrent", { CFBundleIconFile: "app" }, "app.icns");
        const cacheDir = path.join(root, "cache");
        const convert = vi.fn(async (_icns: string, out: string) => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            fs.writeFileSync(out, "REAL");
        });
        const results = await Promise.all([
            loadNativeAppIcons([appPath, appPath], cacheDir, convert),
            loadNativeAppIcons([appPath], cacheDir, convert),
        ]);
        expect(results[0][appPath]).toBe("data:image/png;base64,REAL");
        expect(results[1]).toEqual(results[0]);
        expect(convert).toHaveBeenCalledTimes(1);
    });

    test.skipIf(process.platform !== "darwin")("refreshes artwork after icon or plist changes", async () => {
        const appPath = makeBundle("Updated", { CFBundleIconFile: "app" }, "app.icns");
        const cacheDir = path.join(root, "cache");
        const convert = vi.fn(async (icns: string, out: string) => {
            fs.writeFileSync(out, fs.readFileSync(icns, "utf8"));
        });
        await loadNativeAppIcons([appPath], cacheDir, convert);
        fs.writeFileSync(path.join(appPath, "Contents/Resources/app.icns"), "UPDATED-ICON");
        expect((await loadNativeAppIcons([appPath], cacheDir, convert))[appPath]).toBe(
            "data:image/png;base64,UPDATED-ICON"
        );
        makeBundle("Updated", { CFBundleIconFile: "replacement" }, "replacement.icns");
        expect((await loadNativeAppIcons([appPath], cacheDir, convert))[appPath]).toBe(
            "data:image/png;base64,icns-bytes"
        );
        expect(convert).toHaveBeenCalledTimes(3);
    });
    test.skipIf(process.platform !== "darwin")(
        "retries failed conversions and drops artwork for removed bundles",
        async () => {
            const appPath = makeBundle("Retry", { CFBundleIconFile: "app" }, "app.icns");
            const cacheDir = path.join(root, "cache");
            const convert = vi.fn(async (_icns: string, out: string) => fs.writeFileSync(out, "REAL"));
            convert.mockRejectedValueOnce(new Error("temporary failure"));
            expect(await loadNativeAppIcons([appPath], cacheDir, convert)).toEqual({});
            expect((await loadNativeAppIcons([appPath], cacheDir, convert))[appPath]).toBe(
                "data:image/png;base64,REAL"
            );
            fs.rmSync(appPath, { recursive: true });
            expect((await loadNativeAppIcons([appPath], cacheDir, convert))[appPath]).toBe(
                "data:image/png;base64,GENERIC"
            );
            expect(convert).toHaveBeenCalledTimes(2);
        }
    );
});
