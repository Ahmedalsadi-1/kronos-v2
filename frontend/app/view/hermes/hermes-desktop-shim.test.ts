// @vitest-environment jsdom

// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildGatewayWsUrl,
    buildProfileScopedApiUrl,
    configureHermesDesktopShim,
    replaceHermesDesktopShim,
    workspaceSnapshotSurfaces,
} from "./hermes-desktop-shim";

vi.mock("@/app/store/global", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/app/store/global")>();
    const { atom } = await import("jotai");
    return { ...original, atoms: { ...original.atoms, staticTabId: atom("owner-tab") } };
});

vi.mock("@/app/view/agent-widget-bridge", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/app/view/agent-widget-bridge")>();
    return { ...original, listAgentWidgets: () => [] };
});

beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
            clear: () => values.clear(),
            getItem: (key: string) => values.get(key) ?? null,
            removeItem: (key: string) => values.delete(key),
            setItem: (key: string, value: string) => values.set(key, value),
        },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
    Reflect.deleteProperty(window, "api");
    Reflect.deleteProperty(window, "localStorage");
});

describe("Kronos profile routing", () => {
    it("opens preview files through the native external browser bridge", async () => {
        const openExternal = vi.fn();
        Object.defineProperty(window, "api", { configurable: true, value: { openExternal } });
        replaceHermesDesktopShim();
        await window.hermesDesktop.openPreviewInBrowser("file:///repo/index.html");
        expect(openExternal).toHaveBeenCalledWith("file:///repo/index.html");
    });

    it("opens the native folder picker and preserves cancellation", async () => {
        const selectDirectory = vi.fn().mockResolvedValueOnce("/repo").mockResolvedValueOnce(null);
        Object.defineProperty(window, "api", { configurable: true, value: { selectDirectory } });
        replaceHermesDesktopShim();
        await expect(window.hermesDesktop.selectPaths({ directories: true })).resolves.toEqual(["/repo"]);
        await expect(window.hermesDesktop.selectPaths({ directories: true })).resolves.toEqual([]);
        expect(selectDirectory).toHaveBeenCalledTimes(2);
    });

    it("selects files through preload and respects single selection", async () => {
        const selectFiles = vi.fn().mockResolvedValue(["/repo/one.html", "/repo/two.png"]);
        Object.defineProperty(window, "api", { configurable: true, value: { selectFiles } });
        replaceHermesDesktopShim();
        await expect(window.hermesDesktop.selectPaths({ multiple: false })).resolves.toEqual(["/repo/one.html"]);
        await expect(window.hermesDesktop.selectPaths({ multiple: true })).resolves.toEqual([
            "/repo/one.html",
            "/repo/two.png",
        ]);
    });

    it("reports unavailable pickers instead of silently cancelling", async () => {
        Object.defineProperty(window, "api", { configurable: true, value: {} });
        replaceHermesDesktopShim();
        await expect(window.hermesDesktop.selectPaths({ directories: true })).rejects.toThrow("Folder selection");
    });

    it("loads inspector files and git diffs through the managed backend", async () => {
        const hermesApi = vi.fn(async (request: HermesApiIpcRequest) => {
            if (request.path.startsWith("/api/fs/list"))
                return { entries: [{ name: "changed.ts", path: "/repo/changed.ts", isDirectory: false }] };
            if (request.path.startsWith("/api/git/review/list")) return { files: [] };
            return { diff: "-old\n+new" };
        });
        Object.defineProperty(window, "api", { configurable: true, value: { hermesApi } });
        configureHermesDesktopShim({ token: "session-token" });
        replaceHermesDesktopShim();
        await expect(window.hermesDesktop.readDir("/repo")).resolves.toEqual({
            entries: [expect.objectContaining({ name: "changed.ts" })],
        });
        await expect(window.hermesDesktop.git.review.list("/repo", "uncommitted", null)).resolves.toEqual({
            files: [],
        });
        await expect(
            window.hermesDesktop.git.review.diff("/repo", "changed.ts", "uncommitted", null, false)
        ).resolves.toBe("-old\n+new");
        expect(hermesApi).toHaveBeenCalledWith(
            expect.objectContaining({ path: expect.stringContaining("/api/git/review/diff?") })
        );
    });
    it("never persists the daemon session token across renderer lifetimes", () => {
        window.localStorage.setItem("kronterm.hermes.shim.token", "expired-token");

        configureHermesDesktopShim({ baseUrl: "http://127.0.0.1:62554", token: "current-token" });

        expect(window.localStorage.getItem("kronterm.hermes.shim.token")).toBeNull();
    });

    it("routes REST settings to the selected profile without dropping existing query parameters", () => {
        expect(buildProfileScopedApiUrl("http://127.0.0.1:9119", "/api/skills?enabled=true", "research")).toBe(
            "http://127.0.0.1:9119/api/skills?enabled=true&profile=research"
        );
    });

    it("routes the gateway socket to the selected profile while retaining token authentication", () => {
        expect(buildGatewayWsUrl("http://127.0.0.1:9119", "session token", "research")).toBe(
            "ws://127.0.0.1:9119/api/ws?token=session+token&profile=research"
        );
    });

    it("persists profile selection through the managed backend instead of returning a no-op success", async () => {
        const hermesApi = vi.fn(async (request: HermesApiIpcRequest) => {
            const body = request.body as { name?: string } | undefined;
            return { active: body?.name ?? "default", current: "default" };
        });
        Object.defineProperty(window, "api", { configurable: true, value: { hermesApi } });
        configureHermesDesktopShim({ baseUrl: "http://127.0.0.1:9119", token: "session-token" });
        replaceHermesDesktopShim();

        await expect(window.hermesDesktop!.profile.set("research")).resolves.toEqual({ profile: "research" });
        expect(hermesApi).toHaveBeenCalledWith(
            expect.objectContaining({
                body: { name: "research" },
                method: "POST",
                path: "/api/profiles/active",
            })
        );
    });
});

describe("HUD owner surface inventory", () => {
    it("routes HUD inventory, expand, and screenshots to the owning workspace tab", async () => {
        window.history.replaceState({}, "", "/?nativeSurface=hud");
        const snapshot = vi.spyOn(RpcApi, "WorkspaceSurfaceSnapshotCommand").mockResolvedValue(
            JSON.stringify({
                blocks: [{ blockid: "existing-browser", view: "web", title: "Browser" }],
            })
        );
        const control = vi
            .spyOn(RpcApi, "WorkspaceSurfaceControlCommand")
            .mockResolvedValue(JSON.stringify({ success: true }));
        const capture = vi
            .spyOn(RpcApi, "CaptureBlockScreenshotCommand")
            .mockResolvedValue("data:image/png;base64,preview");
        replaceHermesDesktopShim();
        await expect(window.hermesDesktop.krontermSurfaces.list()).resolves.toEqual([
            expect.objectContaining({ id: "existing-browser" }),
        ]);
        await expect(window.hermesDesktop.krontermSurfaces.promote("existing-browser")).resolves.toEqual({ ok: true });
        await expect(window.hermesDesktop.krontermSurfaces.preview("existing-browser")).resolves.toBe(
            "data:image/png;base64,preview"
        );
        expect(snapshot).toHaveBeenCalledWith(TabRpcClient, { route: "tab:owner-tab" });
        expect(control).toHaveBeenCalledWith(
            TabRpcClient,
            { action: "hud.open", blockid: "existing-browser" },
            { route: "tab:owner-tab" }
        );
        expect(capture).toHaveBeenCalledWith(
            TabRpcClient,
            { blockid: "existing-browser", passive: true },
            { route: "tab:owner-tab", timeout: 5000 }
        );
        await expect(window.hermesDesktop.krontermSurfaces.preview("other-tab-browser")).rejects.toThrow(
            "widget-not-in-current-tab"
        );
    });

    it("preserves canonical block IDs while excluding chats and sensitive metadata", () => {
        expect(
            workspaceSnapshotSurfaces({
                blocks: [
                    {
                        blockid: "browser",
                        view: "web",
                        title: "Browser",
                        focused: true,
                        meta: { token: "secret" },
                        bounds: { x: 20 },
                    },
                    { blockid: "sandbox", view: "sandbox", title: "Sandbox", focused: false },
                    { blockid: "chat", view: "hermes" },
                    { view: "web" },
                ],
            })
        ).toEqual([
            { id: "browser", view: "web", title: "Browser", focused: true, active: false, surfaceKind: "widget" },
            { id: "sandbox", view: "sandbox", title: "Sandbox", focused: false, active: false, surfaceKind: "widget" },
        ]);
    });
    it("handles absent workspace inventory", () => {
        expect(workspaceSnapshotSurfaces(null)).toEqual([]);
        expect(workspaceSnapshotSurfaces({ blocks: {} })).toEqual([]);
    });
});

describe("Machine launcher HUD routing", () => {
    it("sends layout toggles through the narrow notch bridge", () => {
        const syncNativeNotch = vi.fn();
        Object.defineProperty(window, "api", { configurable: true, value: { syncNativeNotch } });
        replaceHermesDesktopShim();
        window.hermesDesktop.krontermSurfaces.toggleChatLayout();
        expect(syncNativeNotch).toHaveBeenCalledWith({ chatLayout: "toggle" });
    });
    it("routes device selection and settings to the owning workspace without booting a runtime", async () => {
        window.history.replaceState({}, "", "/?nativeSurface=hud");
        vi.spyOn(RpcApi, "WorkspaceSurfaceSnapshotCommand").mockResolvedValue(JSON.stringify({ blocks: [] }));
        const control = vi
            .spyOn(RpcApi, "WorkspaceSurfaceControlCommand")
            .mockResolvedValue(JSON.stringify({ success: true }));
        replaceHermesDesktopShim();
        await expect(window.hermesDesktop.krontermSurfaces.openMachines("iphone", true)).resolves.toEqual({ ok: true });
        expect(control).toHaveBeenCalledWith(
            TabRpcClient,
            {
                action: "hud.launch",
                view: "machines",
                text: JSON.stringify({ machineKind: "iphone", machineSettings: true }),
            },
            { route: "tab:owner-tab" }
        );
    });
});
