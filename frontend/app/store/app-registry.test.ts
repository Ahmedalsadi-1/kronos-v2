// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from "vitest";

import {
    focusOrCreateDecision,
    getBuiltinViewDescriptors,
    launchSystemApp,
    makeInstalledAppDescriptor,
    makeViewAppDescriptor,
    mergeAppDescriptors,
    rankInstalledApps,
    searchApps,
    systemAppIdForBlock,
    type AppBlockRef,
} from "@/app/store/app-registry";

function makeBlock(view: string, blockId: string): AppBlockRef {
    return { blockId, view, title: blockId };
}

describe("app-registry", () => {
    test("machine aliases focus the shared launcher without creating another live block", () => {
        const launcher = makeViewAppDescriptor("linux-vms", ["machines-1"]);
        expect(launcher.launchPolicy).toBe("singleton");
        for (const query of ["machines", "android vm", "iphone vm", "virtual linux"]) {
            expect(searchApps([launcher], query).map((app) => app.id)).toEqual(["view:linux-vms"]);
        }
        expect(focusOrCreateDecision(launcher)).toEqual({ action: "focus", blockId: "machines-1" });
        expect(focusOrCreateDecision(launcher, { newWindow: true })).toEqual({
            action: "focus",
            blockId: "machines-1",
        });
    });
    test("device search launches the Computers app and reuses its live block", () => {
        const devices = makeViewAppDescriptor("computers", ["devices-1"]);
        expect(devices.name).toBe("Computers & Devices");
        expect(searchApps([devices], "iphone").map((app) => app.id)).toEqual(["view:computers"]);
        expect(focusOrCreateDecision(devices)).toEqual({ action: "focus", blockId: "devices-1" });
    });
    test("view descriptor carries block view name, icon, and running blocks", () => {
        const descriptor = makeViewAppDescriptor("term", ["b1", "b2"]);
        expect(descriptor.id).toBe("view:term");
        expect(descriptor.kind).toBe("builtin");
        expect(descriptor.view).toBe("term");
        expect(descriptor.name.length).toBeGreaterThan(0);
        expect(descriptor.icon).toBeTruthy();
        expect(descriptor.runningBlockIds).toEqual(["b1", "b2"]);
        expect(descriptor.pinned).toBe(true);
        expect(descriptor.aliases).toContain("terminal");
        expect(descriptor.launchPolicy).toBe("multi-window");
        expect(descriptor.capabilities).toContain("terminal");
    });

    test("installed app descriptor uses platform icon and stable id", () => {
        const descriptor = makeInstalledAppDescriptor({
            name: "Google Chrome",
            appid: "com.google.Chrome",
            path: "/Applications/Google Chrome.app",
            icon: "data:image/png;base64,AAAA",
            category: "Applications",
            source: "macos",
            bundleid: "com.google.Chrome",
        });
        expect(descriptor.id).toBe("app:com.google.Chrome");
        expect(descriptor.kind).toBe("native");
        expect(descriptor.icon).toBe("data:image/png;base64,AAAA");
        expect(descriptor.aliases).toContain("google chrome");
        expect(descriptor.capabilities).toContain("screen-capture");
    });

    test("merge attaches running blocks to view descriptors", () => {
        const builtins = getBuiltinViewDescriptors([
            makeBlock("term", "t1"),
            makeBlock("web", "w1"),
            makeBlock("web", "w2"),
        ]);
        const chrome = makeInstalledAppDescriptor({
            name: "Google Chrome",
            appid: "com.google.Chrome",
            path: "/Applications/Google Chrome.app",
            source: "macos",
        });
        const merged = mergeAppDescriptors(
            builtins,
            [chrome],
            [makeBlock("term", "t1"), makeBlock("web", "w1"), makeBlock("web", "w2")]
        );
        const term = merged.find((descriptor) => descriptor.id === "view:term");
        const web = merged.find((descriptor) => descriptor.id === "view:web");
        expect(term?.runningBlockIds).toEqual(["t1"]);
        expect(web?.runningBlockIds).toEqual(["w1", "w2"]);
        expect(merged.filter((descriptor) => descriptor.id === "app:com.google.Chrome")).toHaveLength(1);
    });

    test("search matches names and aliases case-insensitively", () => {
        const descriptors = getBuiltinViewDescriptors([]);
        expect(searchApps(descriptors, "SHEET").map((d) => d.id)).toEqual(["view:datastudio"]);
        expect(searchApps(descriptors, "unknown application xyz")).toEqual([]);
        expect(searchApps(descriptors, "terminal").map((d) => d.id)).toContain("view:term");
        expect(searchApps(descriptors, "browser").map((d) => d.id)).toContain("view:web");
        expect(searchApps(descriptors, "hermes").map((d) => d.id)).toContain("view:hermes");
        expect(searchApps(descriptors, "").length).toBe(descriptors.length);
    });

    test("launch decision focuses running, creates views, defers native", () => {
        const running = makeViewAppDescriptor("web", ["w1"]);
        expect(focusOrCreateDecision(running)).toEqual({ action: "focus", blockId: "w1" });
        expect(focusOrCreateDecision(running, { newWindow: true })).toEqual({ action: "create", view: "web" });

        const idle = makeViewAppDescriptor("term", []);
        expect(focusOrCreateDecision(idle)).toEqual({ action: "create", view: "term" });

        const native = makeInstalledAppDescriptor({
            name: "Figma",
            appid: "com.figma.Desktop",
            path: "/Applications/Figma.app",
            source: "macos",
        });
        expect(focusOrCreateDecision(native)).toEqual({
            action: "create-appstream",
            appid: "com.figma.Desktop",
            appname: "Figma",
        });
    });

    test("routes every launch through one lifecycle handler", async () => {
        const focusBlock = vi.fn();
        const createView = vi.fn();
        const createAppStream = vi.fn();
        const handlers = { focusBlock, createView, createAppStream };

        await launchSystemApp(makeViewAppDescriptor("web", ["web-1"]), handlers);
        await launchSystemApp(makeViewAppDescriptor("term", []), handlers);
        await launchSystemApp(
            makeInstalledAppDescriptor({
                name: "Notes",
                appid: "com.apple.Notes",
                path: "/System/Applications/Notes.app",
                source: "macos",
            }),
            handlers
        );

        expect(focusBlock).toHaveBeenCalledWith("web-1");
        expect(createView).toHaveBeenCalledWith("term");
        expect(createAppStream).toHaveBeenCalledWith("com.apple.Notes", "Notes");
    });

    test("uses native app identity for app stream blocks", () => {
        expect(systemAppIdForBlock({ view: "appstream", appStreamAppId: "com.apple.Notes" })).toBe(
            "app:com.apple.Notes"
        );
        expect(systemAppIdForBlock({ view: "web" })).toBe("view:web");
    });

    test("ranks running apps, then everyday productivity apps, ahead of the alphabetical tail", () => {
        const make = (name: string, appid: string, running: string[] = []) => ({
            ...makeInstalledAppDescriptor({ name, appid, path: `/Applications/${name}.app`, source: "macos" }),
            runningBlockIds: running,
        });
        const ranked = rankInstalledApps([
            make("Activity Monitor", "com.apple.ActivityMonitor"),
            make("Slack", "com.tinyspeck.slackmacgap"),
            make("Zed", "dev.zed.Zed", ["b1"]),
            make("Google Chrome", "com.google.Chrome"),
        ]);
        expect(ranked.map((app) => app.name)).toEqual(["Zed", "Google Chrome", "Slack", "Activity Monitor"]);
    });
});
