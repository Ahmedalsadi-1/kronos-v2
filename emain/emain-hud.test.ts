// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceService } from "@/app/store/services";
import { nativeTheme } from "electron";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { parseCoucouHudEvent } from "./coucou-hud";

const mocks = vi.hoisted(() => {
    type EventHandler = (...args: any[]) => void;

    class FakeEmitter {
        handlers = new Map<string, Set<EventHandler>>();

        emit(event: string, ...args: any[]): void {
            for (const handler of this.handlers.get(event) ?? []) handler(...args);
        }

        on(event: string, handler: EventHandler): this {
            const handlers = this.handlers.get(event) ?? new Set<EventHandler>();
            handlers.add(handler);
            this.handlers.set(event, handlers);
            return this;
        }

        off(event: string, handler: EventHandler): this {
            this.handlers.get(event)?.delete(handler);
            return this;
        }

        once(event: string, handler: EventHandler): this {
            const onceHandler: EventHandler = (...args) => {
                this.handlers.get(event)?.delete(onceHandler);
                handler(...args);
            };
            return this.on(event, onceHandler);
        }
    }

    const windows: FakeBrowserWindow[] = [];

    class FakeBrowserWindow extends FakeEmitter {
        static nextId = 1;

        destroyed = false;
        options: Electron.BrowserWindowConstructorOptions;
        position: [number, number];
        visible = false;
        webContents: FakeEmitter & {
            id: number;
            isDestroyed: ReturnType<typeof vi.fn>;
            send: ReturnType<typeof vi.fn>;
        };

        close = vi.fn(() => {
            this.destroyed = true;
            this.visible = false;
            this.emit("closed");
        });
        focus = vi.fn(() => this.emit("focus"));
        getBounds = vi.fn(() => ({
            x: this.position[0],
            y: this.position[1],
            width: this.options.width ?? 0,
            height: this.options.height ?? 0,
        }));
        getPosition = vi.fn(() => this.position);
        isFocused = vi.fn(() => false);
        isDestroyed = vi.fn(() => this.destroyed);
        isVisible = vi.fn(() => this.visible);
        hide = vi.fn(() => {
            this.visible = false;
        });
        loadFile = vi.fn(async () => {});
        loadURL = vi.fn(async () => {});
        setAlwaysOnTop = vi.fn();
        setHasShadow = vi.fn();
        setBounds = vi.fn((bounds: Electron.Rectangle) => {
            this.position = [bounds.x, bounds.y];
            this.options.width = bounds.width;
            this.options.height = bounds.height;
        });
        setPosition = vi.fn((x: number, y: number) => {
            this.position = [x, y];
        });
        title = "";
        setTitle = vi.fn((title: string) => {
            this.title = title;
        });
        getTitle = vi.fn(() => this.title);
        setVisibleOnAllWorkspaces = vi.fn();
        show = vi.fn(() => {
            this.visible = true;
            this.emit("show");
        });
        showInactive = vi.fn(() => {
            this.visible = true;
            this.emit("show");
        });

        constructor(options: Electron.BrowserWindowConstructorOptions) {
            super();
            this.options = options;
            this.position = [options.x ?? 0, options.y ?? 0];
            const webContents = new FakeEmitter() as FakeBrowserWindow["webContents"];
            webContents.id = FakeBrowserWindow.nextId++;
            webContents.isDestroyed = vi.fn(() => false);
            webContents.send = vi.fn();
            this.webContents = webContents;
            windows.push(this);
        }
    }

    const ownerWindow = Object.assign(new FakeEmitter(), {
        focus: vi.fn(),
        workspaceId: "workspace-1",
        switchWorkspace: vi.fn().mockResolvedValue(undefined),
        getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1440, height: 900 })),
        hide: vi.fn(),
        isDestroyed: vi.fn(() => false),
        show: vi.fn(() => ownerWindow.emit("show")),
    });
    const ownerTab = {
        savedInitOpts: { clientId: "client-1", tabId: "tab-1", windowId: "window-1" },
        webContents: { isDestroyed: vi.fn(() => false), send: vi.fn() },
    };
    return {
        FakeBrowserWindow,
        ownerTab,
        ownerWindow,
        windows,
        startCoucouHud: vi.fn(),
        writeCoucouState: vi.fn(),
        fromId: vi.fn(),
        getNowPlaying: vi.fn().mockResolvedValue(undefined),
        controlNowPlaying: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock("@/app/store/services", () => ({
    WorkspaceService: {
        ListWorkspaces: vi.fn().mockResolvedValue([]),
        GetWorkspace: vi.fn(),
        CreateWorkspace: vi.fn(),
    },
}));

vi.mock("./coucou-hud", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./coucou-hud")>()),
    startCoucouHud: mocks.startCoucouHud,
    writeCoucouState: mocks.writeCoucouState,
    sendCoucouActivity: vi.fn(),
}));

vi.mock("electron", () => ({
    nativeTheme: {
        shouldUseDarkColors: true,
        shouldUseHighContrastColors: false,
        prefersReducedTransparency: false,
        on: vi.fn(),
        off: vi.fn(),
    },
    systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: false }) },
    BrowserWindow: mocks.FakeBrowserWindow,
    webContents: { fromId: mocks.fromId },
    screen: {
        getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
        getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
    },
}));

vi.mock("./emain-platform", () => ({
    getElectronAppBasePath: () => "/app",
    isDevVite: true,
    unamePlatform: "darwin",
}));

vi.mock("./emain-tabview", () => ({
    getWaveTabViewByWebContentsId: () => mocks.ownerTab,
}));

vi.mock("./emain-wsh", () => ({ ElectronWshClient: { wshRpcCall: vi.fn().mockResolvedValue([]) } }));
vi.mock("./now-playing", () => ({ getNowPlaying: mocks.getNowPlaying, controlNowPlaying: mocks.controlNowPlaying }));

vi.mock("./emain-window", () => ({
    getWaveWindowByWebContentsId: () => mocks.ownerWindow,
}));

import {
    arrangeNativeHudIslands,
    captureNativeHudBlock,
    closeNativeHudSurface,
    focusNativeHudIsland,
    forwardHermesContext,
    forwardHermesSelection,
    getNativeHudIslandPresentation,
    listNativeHudIslands,
    nativeDesktopHudActive,
    nativeHudTaskContext,
    nativeHudWidgetRoute,
    openNativeHudIsland,
    openNativeHudIslandForTab,
    parseNotchPetTarget,
    publishNativeNotchActivity,
    resizeCurrentNativeHudIsland,
    selectNativeHudWidget,
    setNativeHudIslandBounds,
    setNativeHudMode,
    syncNativeNotch,
    toggleNativeHudIslandExpanded,
} from "./emain-hud";

describe("native KronOS HUD windows", () => {
    beforeEach(() => {
        setNativeHudMode(42, false);
        mocks.FakeBrowserWindow.nextId = 1;
        mocks.windows.length = 0;
        vi.clearAllMocks();
        mocks.startCoucouHud.mockReset();
        mocks.getNowPlaying.mockResolvedValue(undefined);
        mocks.controlNowPlaying.mockResolvedValue(undefined);
    });
    test("keeps direct renderer commands on their owning tab while HUD commands follow the active tab", () => {
        const owner = mocks.ownerWindow as typeof mocks.ownerWindow & { activeTabView?: { waveTabId: string } };
        const previous = owner.activeTabView;
        owner.activeTabView = { waveTabId: "different-active-tab" };
        try {
            expect(nativeHudTaskContext(42)).toMatchObject({ tabId: "tab-1", workspaceId: "workspace-1" });
            setNativeHudMode(42, true, "existing-chat");
            const hud = mocks.windows[0];
            expect(nativeHudTaskContext(hud.webContents.id)).toMatchObject({
                tabId: "different-active-tab",
                workspaceId: "workspace-1",
            });
        } finally {
            if (previous) owner.activeTabView = previous;
            else delete owner.activeTabView;
            setNativeHudMode(42, false);
        }
    });

    test("routes notch playback commands to the displayed source and refreshes its state", async () => {
        const media = {
            id: "com.spotify.client",
            source: "Spotify",
            title: "Track",
            artist: "Artist",
            playing: true,
            canSkip: true,
        };
        mocks.getNowPlaying.mockResolvedValue(media);
        mocks.controlNowPlaying.mockResolvedValue({ ...media, playing: false });
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "existing-chat");
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const command = parseCoucouHudEvent(
            JSON.stringify({
                event: "action",
                action: "media-toggle",
                route: media.id,
                x: 0,
                y: 0,
                width: 1512,
                height: 982,
                inset: 32,
            })
        );
        expect(command).toBeDefined();
        onEvent(command);
        await vi.waitFor(() => expect(mocks.controlNowPlaying).toHaveBeenCalledWith(media.id, "toggle"));
        await vi.waitFor(() =>
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
                media: { ...media, playing: false },
            })
        );
    });
    test("retries suspended native loads with a bounded budget and cancels recovery on close", async () => {
        vi.useFakeTimers();
        try {
            setNativeHudMode(42, true, "existing-chat");
            const hud = mocks.windows[0];
            expect(hud.loadURL).toHaveBeenCalledOnce();
            for (let attempt = 0; attempt < 4; attempt++) {
                hud.webContents.emit("did-fail-load", {}, -331, "ERR_NETWORK_IO_SUSPENDED", "file:///index.html", true);
                await vi.advanceTimersByTimeAsync(4_000);
            }
            expect(hud.loadURL).toHaveBeenCalledTimes(4);
            hud.webContents.emit("did-finish-load");
            hud.webContents.emit("did-fail-load", {}, -331, "ERR_NETWORK_IO_SUSPENDED", "file:///index.html", true);
            setNativeHudMode(42, false);
            await vi.advanceTimersByTimeAsync(4_000);
            expect(hud.loadURL).toHaveBeenCalledTimes(4);
        } finally {
            setNativeHudMode(42, false);
            vi.useRealTimers();
        }
    });

    test("does not retry native subframes or canceled navigations", async () => {
        vi.useFakeTimers();
        try {
            setNativeHudMode(42, true);
            const hud = mocks.windows[0];
            hud.webContents.emit("did-fail-load", {}, -331, "ERR_NETWORK_IO_SUSPENDED", "file:///frame.html", false);
            hud.webContents.emit("did-fail-load", {}, -3, "ERR_ABORTED", "file:///index.html", true);
            await vi.advanceTimersByTimeAsync(4_000);
            expect(hud.loadURL).toHaveBeenCalledOnce();
        } finally {
            setNativeHudMode(42, false);
            vi.useRealTimers();
        }
    });

    test("publishes persisted workspaces and rejects unpublished switch targets", async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(WorkspaceService.ListWorkspaces).mockResolvedValueOnce([
                { workspaceid: "workspace-1", windowid: "window-1" },
            ]);
            vi.mocked(WorkspaceService.GetWorkspace).mockResolvedValueOnce({
                oid: "workspace-1",
                name: "Mobile",
            } as Workspace);
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true, "existing-chat");
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            onEvent({ ...geometry, event: "ready" });
            await vi.advanceTimersByTimeAsync(750);
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
                workspaces: [{ id: "workspace-1", name: "Mobile", selected: true }],
            });
            onEvent({ ...geometry, event: "action", action: "workspace-select:unknown" });
            expect(mocks.ownerWindow.switchWorkspace).not.toHaveBeenCalled();
            onEvent({ ...geometry, event: "action", action: "workspace-select:workspace-1" });
            expect(mocks.ownerWindow.switchWorkspace).toHaveBeenCalledWith("workspace-1");
        } finally {
            vi.useRealTimers();
        }
    });

    test("keeps the OS workspace visible when the HUD floats alongside it", () => {
        setNativeHudMode(42, true, "existing-chat", { keepWorkspaceVisible: true });
        expect(mocks.ownerWindow.hide).not.toHaveBeenCalled();
        mocks.ownerWindow.show();
        expect(mocks.ownerWindow.hide).not.toHaveBeenCalled();
        openNativeHudIsland(42, { blockId: "floating-terminal", view: "term" });
        expect(mocks.ownerWindow.hide).not.toHaveBeenCalled();
    });

    test("showing the main workspace exits exclusive HUD instead of hiding it again", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "existing-chat");
        const hud = mocks.windows[0];
        mocks.ownerWindow.hide.mockClear();
        mocks.ownerWindow.show();
        expect(mocks.ownerWindow.hide).not.toHaveBeenCalled();
        expect(hud.isDestroyed()).toBe(true);
        expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("native-hud-exit");
    });

    test("keeps exclusive notch mode when the companion exits unexpectedly", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "existing-chat");
        const [hud] = mocks.windows;
        const onExit = mocks.startCoucouHud.mock.calls[0][2];
        mocks.ownerWindow.show.mockClear();
        mocks.ownerTab.webContents.send.mockClear();
        onExit();
        expect(hud.isDestroyed()).toBe(false);
        expect(hud.isVisible()).toBe(true);
        expect(mocks.ownerWindow.show).not.toHaveBeenCalled();
        expect(mocks.ownerTab.webContents.send).not.toHaveBeenCalledWith("native-hud-exit");
        setNativeHudMode(42, false);
        expect(hud.isDestroyed()).toBe(true);
        expect(mocks.ownerWindow.show).toHaveBeenCalled();
    });

    test("restarts a failed companion in place without reopening the OS workspace", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "existing-chat");
        const [hud] = mocks.windows;
        mocks.startCoucouHud.mock.calls[0][2]();
        mocks.ownerWindow.show.mockClear();
        setNativeHudMode(hud.webContents.id, true, "existing-chat");
        expect(mocks.startCoucouHud).toHaveBeenCalledTimes(2);
        expect(mocks.windows).toHaveLength(1);
        expect(mocks.ownerWindow.show).not.toHaveBeenCalled();
        const onEvent = mocks.startCoucouHud.mock.calls[1][1];
        onEvent({ event: "ready", x: 0, y: 0, width: 1512, height: 982, inset: 32 });
        expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-availability", true);
    });

    test("offers recovery after a collapsed companion exits and ignores its late layout", () => {
        mocks.startCoucouHud.mockReturnValueOnce({ kill: vi.fn() });
        setNativeHudMode(42, true, "existing-chat");
        const hud = mocks.windows[0];
        const [, onEvent, onExit] = mocks.startCoucouHud.mock.calls[0];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "chat-close" });
        expect(hud.isVisible()).toBe(false);
        onExit();
        expect(hud.isVisible()).toBe(true);
        expect(hud.isDestroyed()).toBe(false);
        expect(hud.webContents.send).toHaveBeenLastCalledWith("native-notch-availability", false);
        hud.setBounds.mockClear();
        onEvent({ ...geometry, event: "chat-open" });
        expect(hud.setBounds).not.toHaveBeenCalled();
    });

    test("keeps recovery controls available when companion readiness times out", () => {
        vi.useFakeTimers();
        try {
            const companion = { kill: vi.fn() };
            mocks.startCoucouHud.mockReturnValue(companion);
            setNativeHudMode(42, true, "existing-chat");
            const [hud] = mocks.windows;
            mocks.ownerWindow.show.mockClear();
            vi.advanceTimersByTime(15001);
            expect(companion.kill).toHaveBeenCalledOnce();
            expect(hud.isDestroyed()).toBe(false);
            expect(hud.isVisible()).toBe(true);
            expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-availability", false);
            expect(mocks.ownerWindow.show).not.toHaveBeenCalled();
            setNativeHudMode(42, false);
        } finally {
            vi.useRealTimers();
        }
    });

    test("routes reviewed context to exactly one chat host from a floating island", () => {
        setNativeHudMode(42, true, "active-chat");
        openNativeHudIsland(42, { blockId: "browser-1", view: "web" });
        const [hud, island] = mocks.windows;
        forwardHermesContext(island.webContents.id, "Reviewed browser context");
        expect(hud.webContents.send).toHaveBeenCalledWith("hermes-context", "Reviewed browser context");
        expect(mocks.ownerTab.webContents.send).not.toHaveBeenCalledWith("hermes-context", expect.anything());
        setNativeHudMode(42, false);
        forwardHermesContext(42, "Reviewed desktop context");
        expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("hermes-context", "Reviewed desktop context");
    });

    test("routes captured image selection to exactly one owner chat and preserves the requested destination", () => {
        setNativeHudMode(42, true, "active-chat");
        openNativeHudIsland(42, { blockId: "browser-1", view: "web" });
        const [hud, island] = mocks.windows;
        const payload = {
            text: "Inspect selected element",
            target: "new" as const,
            images: [{ filename: "capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }],
        };
        forwardHermesSelection(island.webContents.id, payload);
        expect(hud.webContents.send).toHaveBeenCalledWith("hermes-selection", payload);
        expect(mocks.ownerTab.webContents.send).not.toHaveBeenCalledWith("hermes-selection", expect.anything());
        setNativeHudMode(42, false);
        forwardHermesSelection(42, { ...payload, target: "current" });
        expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("hermes-selection", {
            ...payload,
            target: "current",
        });
    });

    test("the HUD keyboard shortcut exits from an island without creating a second session", () => {
        setNativeHudMode(42, true, "active-chat");
        openNativeHudIsland(42, { blockId: "browser-1", view: "web" });
        const [, island] = mocks.windows;
        const event = { preventDefault: vi.fn() };
        island.webContents.emit("before-input-event", event, {
            type: "keyDown",
            meta: true,
            shift: true,
            code: "KeyU",
        });
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("native-hud-exit");
    });

    test("requires Hermes HUD first and stacks widget islands above it", () => {
        expect(openNativeHudIsland(42, { blockId: "early-widget" })).toBe(false);
        expect(setNativeHudMode(42, true)).toBe(true);
        expect(openNativeHudIsland(42, { blockId: "terminal-1", title: "Terminal", view: "term" })).toBe(true);

        const [hud, island] = mocks.windows;
        expect(hud.options.resizable).toBe(false);
        expect(hud.loadURL).toHaveBeenCalledWith(expect.stringContaining("tabId=tab-1"));
        expect(island.options.resizable).toBe(true);
        expect(hud.setAlwaysOnTop).toHaveBeenCalledWith(true, "floating", 0);
        expect(island.setAlwaysOnTop).toHaveBeenCalledWith(true, "floating", 1);
        expect(hud.showInactive).toHaveBeenCalled();
        expect(island.show).toHaveBeenCalled();
        expect(mocks.ownerWindow.hide).toHaveBeenCalled();

        const hidesBeforeUnexpectedShow = mocks.ownerWindow.hide.mock.calls.length;
        mocks.ownerWindow.show();
        expect(mocks.ownerWindow.hide).toHaveBeenCalledTimes(hidesBeforeUnexpectedShow);
        expect(hud.isDestroyed()).toBe(true);

        expect(setNativeHudMode(42, false)).toBe(true);
        expect(hud.close).toHaveBeenCalled();
        expect(island.close).toHaveBeenCalled();
        expect(mocks.ownerWindow.show).toHaveBeenCalled();
    });

    test("exposes tab-scoped island geometry for Hermes controls", () => {
        expect(setNativeHudMode(42, true)).toBe(true);
        expect(openNativeHudIslandForTab("tab-1", { blockId: "browser-1", title: "Browser", view: "web" })).toBe(true);
        expect(openNativeHudIslandForTab("another-tab", { blockId: "other" })).toBe(false);

        expect(listNativeHudIslands("tab-1")).toEqual([
            expect.objectContaining({ blockId: "browser-1", title: "Browser", view: "web", visible: true }),
        ]);
        expect(setNativeHudIslandBounds("tab-1", "browser-1", { x: 80, y: 90, width: 640, height: 480 })).toBe(true);
        expect(mocks.windows[1].setBounds).toHaveBeenCalledWith({ x: 80, y: 90, width: 640, height: 480 }, true);
        expect(focusNativeHudIsland("tab-1", "browser-1")).toBe(true);
        expect(mocks.windows[1].focus).toHaveBeenCalled();
        expect(arrangeNativeHudIslands("tab-1", "grid")).toBe(true);
    });
    test("keeps the notch chat hidden until opened and stops the companion on HUD exit", () => {
        const companion = { kill: vi.fn() };
        mocks.startCoucouHud.mockReturnValue(companion);
        expect(setNativeHudMode(42, true, "chat/with spaces")).toBe(true);
        const hud = mocks.windows[0];
        expect(hud.showInactive).not.toHaveBeenCalled();
        expect(hud.loadURL).toHaveBeenCalledWith(expect.stringContaining("sessionId=chat%2Fwith+spaces"));
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "ready" });
        expect(hud.isVisible()).toBe(false);
        expect(nativeDesktopHudActive("tab-1")).toBe(true);
        onEvent({ ...geometry, event: "chat-open" });
        expect(hud.getBounds()).toEqual({ x: 576, y: 52, width: 360, height: 720 });
        expect(hud.isVisible()).toBe(true);
        onEvent({ ...geometry, event: "chat-close" });
        expect(hud.isVisible()).toBe(false);
        expect(nativeDesktopHudActive("tab-1")).toBe(true);
        setNativeHudMode(42, false);
        expect(nativeDesktopHudActive("tab-1")).toBe(false);
        expect(companion.kill).toHaveBeenCalledOnce();
    });

    test("keeps the same chat across widget switches and ignores stale layout revisions", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true, "persistent-chat");
            const hud = mocks.windows[0];
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            const layout = {
                ...geometry,
                event: "chat-layout",
                chatIntent: true,
                layoutReady: true,
                layoutRevision: 1,
                contentX: 100,
                contentY: 60,
                contentWidth: 520,
                contentHeight: 680,
            };
            onEvent(layout);
            expect(hud.isVisible()).toBe(true);
            onEvent({ ...geometry, event: "chat-layout", chatIntent: true, layoutReady: false, layoutRevision: 2 });
            expect(hud.isVisible()).toBe(true);
            await vi.advanceTimersByTimeAsync(999);
            expect(hud.getBounds()).toEqual({ x: 100, y: 60, width: 520, height: 680 });
            onEvent({ ...layout, layoutRevision: 3, contentX: 150 });
            await vi.advanceTimersByTimeAsync(1);
            onEvent({ ...layout, layoutRevision: 2, chatIntent: false });
            expect(hud.isVisible()).toBe(true);
            expect(hud.getBounds().x).toBe(150);
            expect(hud.loadURL).toHaveBeenCalledTimes(1);
            onEvent({ ...layout, layoutRevision: 4, chatIntent: false });
            expect(hud.isVisible()).toBe(false);
            onEvent({ ...geometry, event: "ready" });
            expect(hud.isVisible()).toBe(false);
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
                chatLayoutProtocol: 2,
                chatExpanded: false,
                appearance: expect.objectContaining({ colorScheme: "dark" }),
            });
            setNativeHudMode(42, false);
        } finally {
            vi.useRealTimers();
        }
    });
    test("shows recovery chat after one second of missing measurements and restores the rail", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true, "persistent-chat");
            const hud = mocks.windows[0];
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const layout = {
                x: 0,
                y: 0,
                width: 1512,
                height: 982,
                inset: 32,
                event: "chat-layout",
                chatIntent: true,
                layoutReady: false,
                layoutRevision: 1,
            };
            onEvent(layout);
            await vi.advanceTimersByTimeAsync(999);
            expect(hud.isVisible()).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            expect(hud.isVisible()).toBe(true);
            expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-availability", false);
            onEvent({
                ...layout,
                layoutRevision: 2,
                layoutReady: true,
                contentX: 20,
                contentY: 60,
                contentWidth: 600,
                contentHeight: 680,
            });
            expect(hud.getBounds()).toEqual({ x: 20, y: 60, width: 600, height: 680 });
            expect(hud.webContents.send).toHaveBeenLastCalledWith("native-notch-availability", true);
            setNativeHudMode(42, false);
        } finally {
            vi.useRealTimers();
        }
    });

    test("routes header launchers and permits only local agent settings navigation", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "existing-chat");
        const hud = mocks.windows[0];
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "action", action: "web" });
        expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("native-hud-launch", "web");
        onEvent({ ...geometry, event: "action", action: "navigate", route: "https://example.com" });
        expect(hud.webContents.send).not.toHaveBeenCalled();
        onEvent({ ...geometry, event: "action", action: "navigate", route: "/settings?tab=plugins" });
        expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-navigate", "/settings?tab=plugins");
        for (const page of [
            "command-center",
            "messaging",
            "webhooks",
            "artifacts",
            "cron",
            "profiles",
            "agents",
            "starmap",
            "skills",
        ]) {
            onEvent({ ...geometry, event: "action", action: "navigate", route: `/${page}` });
            expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-navigate", `/${page}`);
        }
        setNativeHudMode(42, false);
    });
    test("docks a live terminal in the notch and detaches the same widget", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const hud = mocks.windows[0];
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = {
                x: 0,
                y: 0,
                width: 1512,
                height: 982,
                inset: 32,
                contentX: 450,
                contentY: 52,
                contentWidth: 612,
                contentHeight: 364,
            };
            onEvent({ ...geometry, event: "ready" });
            const layout = {
                ...geometry,
                event: "preview-layout",
                previewX: 564,
                previewY: 52,
                previewWidth: 486,
                previewHeight: 320,
                previewVisible: true,
            };
            onEvent(layout);
            mocks.fromId.mockReturnValue({ id: 42, isDestroyed: () => false });
            syncNativeNotch(42, {
                previews: [
                    {
                        id: "terminal",
                        title: "Terminal",
                        view: "term",
                        rect: { x: 0, y: 0, width: 640, height: 360 },
                        image: "YWJj",
                    },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            openNativeHudIsland(42, { blockId: "terminal", title: "Terminal", view: "term", select: false });
            onEvent({ ...geometry, event: "action", action: "terminal" });
            const island = mocks.windows[1];
            expect(island.getBounds()).toEqual({ x: 564, y: 52, width: 486, height: 320 });
            expect(hud.isVisible()).toBe(false);
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
                widgetDocked: true,
                expanded: true,
                chatExpanded: true,
            });
            onEvent({ ...geometry, event: "action", action: "dock-hidden" });
            expect(island.isVisible()).toBe(false);
            onEvent({ ...geometry, event: "action", action: "dock-visible" });
            expect(island.isVisible()).toBe(true);
            expect(island.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "screen-saver", 2);
            island.focus();
            expect(island.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "screen-saver", 2);
            onEvent({ ...layout, previewX: 580, previewWidth: 470 });
            expect(island.getBounds()).toEqual({ x: 580, y: 52, width: 470, height: 320 });
            onEvent({ ...geometry, event: "action", action: "preview-detach" });
            expect(mocks.windows).toHaveLength(2);
            expect(island.getBounds().width).toBe(1100);
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), { widgetDocked: false });
            expect(getNativeHudIslandPresentation(island.webContents.id)).toBe("detached");
            await vi.advanceTimersByTimeAsync(1500);
            expect(island.getBounds().width).toBe(1100);
            expect(toggleNativeHudIslandExpanded(island.webContents.id)).toBe("docked");
            expect(island.getBounds().height).toBe(320);
            expect(toggleNativeHudIslandExpanded(island.webContents.id)).toBe("detached");
            expect(island.getBounds()).toEqual({ x: 170, y: 70, width: 1100, height: 760 });
            onEvent({ ...geometry, event: "action", action: "preview-hide" });
            expect(island.isVisible()).toBe(false);
            await vi.advanceTimersByTimeAsync(1500);
            onEvent({ ...layout, previewX: 580, previewWidth: 470 });
            expect(island.isVisible()).toBe(false);
            expect(island.isDestroyed()).toBe(false);
            onEvent({ ...geometry, event: "action", action: "preview-select:terminal" });
            expect(island.isVisible()).toBe(true);
            expect(getNativeHudIslandPresentation(island.webContents.id)).toBe("docked");
            expect(toggleNativeHudIslandExpanded(42)).toBeUndefined();
            syncNativeNotch(42, {
                previews: [
                    { id: "terminal", title: "Terminal", view: "term", rect: { x: 0, y: 0, width: 640, height: 360 } },
                    { id: "files", title: "Files", view: "preview", rect: { x: 0, y: 0, width: 640, height: 360 } },
                ],
            });
            onEvent({ ...geometry, event: "action", action: "follow-agent" });
            publishNativeNotchActivity({
                source: "hermes",
                surface: "panel",
                action: "thinking",
                phase: "running",
                blockid: "files",
            });
            await vi.advanceTimersByTimeAsync(750);
            const files = mocks.windows[2];
            expect(files.isVisible()).toBe(true);
            expect(island.isVisible()).toBe(false);
            expect(getNativeHudIslandPresentation(files.webContents.id)).toBe("docked");
            onEvent({ ...geometry, event: "action", action: "preview-select:terminal" });
            expect(files.isVisible()).toBe(false);
            expect(island.isVisible()).toBe(true);
            publishNativeNotchActivity({
                source: "hermes",
                surface: "panel",
                action: "thinking",
                phase: "running",
                blockid: "files",
            });
            await vi.advanceTimersByTimeAsync(750);
            expect(island.isVisible()).toBe(true);
            expect(files.isVisible()).toBe(false);
            syncNativeNotch(42, { previews: [] });
            await vi.advanceTimersByTimeAsync(750);
            expect(island.isVisible()).toBe(false);
        } finally {
            setNativeHudMode(42, false);
            vi.useRealTimers();
        }
    });
    test("a stalled screenshot cannot block widget selection or inventory removal", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            onEvent({ event: "ready", x: 0, y: 0, width: 1512, height: 982, inset: 32 });
            mocks.fromId.mockReturnValue({
                id: 42,
                isDestroyed: () => false,
                capturePage: vi.fn(() => new Promise(() => {})),
            });
            syncNativeNotch(42, {
                previews: [
                    { id: "browser", title: "Browser", view: "web", rect: { x: 0, y: 0, width: 800, height: 600 } },
                    { id: "terminal", title: "Terminal", view: "term", rect: { x: 0, y: 0, width: 800, height: 600 } },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            mocks.writeCoucouState.mockClear();
            expect(selectNativeHudWidget(42, "terminal")).toBe(true);
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ title: "Terminal", selected: 1 })
            );
            const capture = expect(captureNativeHudBlock(42, "browser")).rejects.toThrow("Widget capture timed out");
            await vi.advanceTimersByTimeAsync(3000);
            await capture;
            syncNativeNotch(42, { previews: [] });
            await vi.advanceTimersByTimeAsync(750);
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ widgets: [], count: 0 })
            );
        } finally {
            setNativeHudMode(42, false);
            vi.useRealTimers();
        }
    });
    test("launchers reopen known previews and browser plus requests a new tab", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            onEvent({ ...geometry, event: "ready" });
            onEvent({
                ...geometry,
                event: "preview-layout",
                previewX: 400,
                previewY: 60,
                previewWidth: 800,
                previewHeight: 600,
                previewVisible: true,
            });
            mocks.fromId.mockReturnValue({ id: 42, isDestroyed: () => false });
            syncNativeNotch(42, {
                previews: [
                    { id: "browser", title: "Browser", view: "web", rect: { x: 0, y: 0, width: 800, height: 600 } },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            const island = mocks.windows[1];
            closeNativeHudSurface(island.webContents.id);
            onEvent({ ...geometry, event: "action", action: "web" });
            expect(mocks.windows).toHaveLength(2);
            expect(island.isVisible()).toBe(true);
            onEvent({ ...geometry, event: "action", action: "web-new" });
            expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("native-hud-new-browser");
        } finally {
            vi.useRealTimers();
        }
    });

    test("routes explorer clicks only to the docked file island and published paths", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            onEvent({ ...geometry, event: "ready" });
            onEvent({
                ...geometry,
                event: "preview-layout",
                previewX: 400,
                previewY: 60,
                previewWidth: 800,
                previewHeight: 600,
                previewVisible: true,
            });
            mocks.fromId.mockReturnValue({ id: 42, isDestroyed: () => false });
            syncNativeNotch(42, {
                previews: [
                    { id: "files", title: "Files", view: "preview", rect: { x: 0, y: 0, width: 800, height: 600 } },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            const island = mocks.windows[1];
            const explorer = {
                blockId: "files",
                root: "/project",
                selected: "",
                error: "",
                entries: [{ path: "/project/app.tsx", name: "app.tsx", directory: false, depth: 0, expanded: false }],
            };
            syncNativeNotch(island.webContents.id, { explorer });
            onEvent({ ...geometry, event: "action", action: "explorer-open", route: "/project/app.tsx" });
            expect(island.webContents.send).toHaveBeenCalledWith("native-notch-explorer", "/project/app.tsx");
            island.webContents.send.mockClear();
            onEvent({ ...geometry, event: "action", action: "explorer-open", route: "/unpublished" });
            expect(island.webContents.send).not.toHaveBeenCalled();
            syncNativeNotch(42, {
                explorer: { ...explorer, entries: [{ ...explorer.entries[0], path: "/unpublished" }] },
            });
            onEvent({ ...geometry, event: "action", action: "explorer-open", route: "/unpublished" });
            expect(island.webContents.send).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    test("validates pet app targets and bounds selected-window labels", () => {
        expect(parseNotchPetTarget("not json")).toBeUndefined();
        expect(parseNotchPetTarget(JSON.stringify({ application: "", window: "title" }))).toBeUndefined();
        const prompt = parseNotchPetTarget(JSON.stringify({ application: "TextEdit", window: "Draft" }));
        expect(prompt).toContain("kron_computer_use");
        expect(prompt).toContain('"application":"TextEdit"');
        expect(prompt).toContain("Ask what task the user wants performed");
    });
    test("only publishes chat captions from the owning HUD", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        syncNativeNotch(42, { caption: "ignored" });
        expect(mocks.writeCoucouState).not.toHaveBeenCalled();
        syncNativeNotch(mocks.windows[0].webContents.id, { caption: "x".repeat(500) });
        expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), { caption: "x".repeat(360) });
    });
    test("limits category publication to the owning HUD renderer", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        const categories = [
            {
                id: "voice",
                name: "Voice",
                detail: "Agent settings",
                kind: "setting",
                route: "/settings?tab=config:voice",
            },
        ];
        syncNativeNotch(42, { categories });
        expect(mocks.writeCoucouState).not.toHaveBeenCalled();
        syncNativeNotch(mocks.windows[0].webContents.id, {
            categories: [...categories, { ...categories[0], id: "bad", route: "https://example.com" }],
        });
        expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), { categories });
        setNativeHudMode(42, false);
    });
    test("shows a compact native voice card while keeping the conversation renderer alive", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "voice-session");
        const hud = mocks.windows[0];
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "chat-open" });
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "listening", level: 0.5 } });
        expect(hud.isVisible()).toBe(false);
        expect(hud.isDestroyed()).toBe(false);
        onEvent({ ...geometry, event: "chat-open" });
        expect(hud.isVisible()).toBe(false);
        expect(mocks.writeCoucouState).toHaveBeenLastCalledWith(expect.anything(), {
            voice: {
                active: true,
                status: "listening",
                transcript: "",
                response: "",
                error: null,
                level: 0.5,
                muted: false,
                speechLevel: 0,
                speechAvailable: false,
            },
        });
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "listening", level: NaN } });
        expect(mocks.writeCoucouState).toHaveBeenLastCalledWith(expect.anything(), {
            voice: {
                active: true,
                status: "listening",
                transcript: "",
                response: "",
                error: null,
                level: 0,
                muted: false,
                speechLevel: 0,
                speechAvailable: false,
            },
        });
    });

    test("expands active voice to its session chat and forwards controls to the existing loop", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true, "voice-session");
        const hud = mocks.windows[0];
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "ready" });
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "speaking", response: "Reply" } });
        onEvent({ ...geometry, event: "action", action: "voice-expand" });
        expect(hud.isVisible()).toBe(true);
        expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-navigate", "/");
        expect(hud.webContents.send).toHaveBeenCalledWith("native-hud-voice-control", "expand");
        for (const action of ["mute", "interrupt", "stop"]) {
            onEvent({ ...geometry, event: "action", action: `voice-${action}` });
            expect(hud.webContents.send).toHaveBeenCalledWith("native-hud-voice-control", action);
        }
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "speaking", response: "Next words" } });
        expect(hud.isVisible()).toBe(true);
    });

    test.each([true, false])("restores previous chat visibility after voice stops: %s", (chatWasOpen) => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        const hud = mocks.windows[0];
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: chatWasOpen ? "chat-open" : "ready" });
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "listening" } });
        onEvent({ ...geometry, event: "chat-open" });
        expect(hud.isVisible()).toBe(false);
        syncNativeNotch(hud.webContents.id, { voice: { active: false, status: "idle" } });
        expect(hud.isVisible()).toBe(chatWasOpen);
    });

    test("keeps selected Hermes settings open while voice transcription continues", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        const hud = mocks.windows[0];
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "ready" });
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "listening" } });
        onEvent({ ...geometry, event: "action", action: "navigate", route: "/settings?tab=config:voice" });
        expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-navigate", "/settings?tab=config:voice");
        expect(hud.isVisible()).toBe(true);
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "transcribing", level: 0.7 } });
        expect(hud.isVisible()).toBe(true);
        syncNativeNotch(hud.webContents.id, { voice: { active: false, status: "idle" } });
        expect(hud.isVisible()).toBe(true);
    });

    test("voice updates from a backgrounded island cannot reveal it or control another renderer's conversation", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        openNativeHudIsland(42, { blockId: "background-browser", view: "web" });
        const [hud, island] = mocks.windows;
        expect(closeNativeHudSurface(island.webContents.id)).toBe(true);
        expect(island.isVisible()).toBe(false);
        mocks.writeCoucouState.mockClear();
        syncNativeNotch(island.webContents.id, {
            voice: { active: true, status: "speaking", response: "Wrong owner" },
        });
        expect(mocks.writeCoucouState).not.toHaveBeenCalled();
        syncNativeNotch(hud.webContents.id, { voice: { active: true, status: "speaking", response: "Owner reply" } });
        expect(island.isVisible()).toBe(false);
        expect(island.isDestroyed()).toBe(false);
    });

    test("synchronizes a palette selection and replays it after companion recovery", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        const hud = mocks.windows[0];
        const onEvent = mocks.startCoucouHud.mock.calls[0][1];
        const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
        onEvent({ ...geometry, event: "action", action: "theme-select", route: "coucou-teal" });
        expect(hud.webContents.send).toHaveBeenCalledWith("native-notch-navigate", "/settings?coucouTheme=coucou-teal");
        syncNativeNotch(hud.webContents.id, { appearance: { theme: "coucou-teal", reducedMotion: true } });
        mocks.writeCoucouState.mockClear();
        onEvent({ ...geometry, event: "ready" });
        expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
            chatLayoutProtocol: 2,
            appearance: expect.objectContaining({ chrome: "coucou", theme: "coucou-teal", reducedMotion: true }),
        });
        hud.webContents.send.mockClear();
        onEvent({ ...geometry, event: "action", action: "theme-select", route: "unknown" });
        expect(hud.webContents.send).not.toHaveBeenCalled();
    });

    test("normalizes native appearance and voice metadata at the bridge boundary", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        const hud = mocks.windows[0];
        syncNativeNotch(hud.webContents.id, {
            appearance: { chrome: "arbitrary", reducedMotion: "yes" },
            voice: {
                active: true,
                status: "arbitrary",
                transcript: "t".repeat(3_000),
                response: "r".repeat(3_000),
                error: "e".repeat(400),
                level: 20,
                muted: "yes",
            },
        });
        expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
            appearance: expect.objectContaining({ chrome: "coucou", theme: "coucou", reducedMotion: false }),
        });
        expect(mocks.writeCoucouState).toHaveBeenLastCalledWith(expect.anything(), {
            voice: {
                active: true,
                status: "idle",
                transcript: "t".repeat(2_000),
                response: "r".repeat(2_000),
                error: "e".repeat(300),
                level: 1,
                muted: false,
                speechLevel: 0,
                speechAvailable: false,
            },
        });
    });

    test("updates native appearance before chat connects and removes the listener on exit", () => {
        mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
        setNativeHudMode(42, true);
        const hud = mocks.windows[0];
        const update = vi.mocked(nativeTheme.on).mock.calls.find(([event]) => event === "updated")[1] as () => void;
        try {
            Object.assign(nativeTheme, {
                shouldUseDarkColors: false,
                shouldUseHighContrastColors: true,
                prefersReducedTransparency: true,
            });
            update();
            expect(mocks.writeCoucouState).toHaveBeenLastCalledWith(expect.anything(), {
                appearance: expect.objectContaining({
                    colorScheme: "light",
                    contrast: "high",
                    reducedTransparency: true,
                    materials: expect.objectContaining({ content: "#f4f4f6", secondary: "#1d1d1f" }),
                }),
            });
            setNativeHudMode(42, false);
            expect(nativeTheme.off).toHaveBeenCalledWith("updated", update);
        } finally {
            Object.assign(nativeTheme, {
                shouldUseDarkColors: true,
                shouldUseHighContrastColors: false,
                prefersReducedTransparency: false,
            });
        }
    });
    test("refreshes stream and sandbox frames and never captures another renderer's browser guest", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            onEvent({ x: 0, y: 0, width: 1512, height: 982, inset: 32, event: "chat-open" });
            const image = { isEmpty: () => false, resize: () => ({ toJPEG: () => Buffer.from("frame") }) };
            const owner = { id: 42, isDestroyed: () => false, capturePage: vi.fn(async () => image) };
            const unrelatedGuest = { hostWebContents: { id: 99 }, isDestroyed: () => false, capturePage: vi.fn() };
            mocks.fromId.mockImplementation((id) => (id === 42 ? owner : unrelatedGuest));
            const rect = { x: 12, y: 20, width: 640, height: 360 };
            syncNativeNotch(42, { previews: [{ id: "browser", title: "Browser", view: "web", rect, guestId: 500 }] });
            await vi.advanceTimersByTimeAsync(750);
            expect(unrelatedGuest.capturePage).not.toHaveBeenCalled();
            await captureNativeHudBlock(42, "browser");
            expect(owner.capturePage).toHaveBeenCalledWith(rect, { stayHidden: true, stayAwake: true });
            for (const view of ["appstream", "sandbox", "term", "preview", "codeeditor", "aifilediff"]) {
                syncNativeNotch(42, { previews: [{ id: view, title: view, view, rect, image: "YWJj" }] });
                await vi.advanceTimersByTimeAsync(750);
                expect(await captureNativeHudBlock(42, view)).toBe("data:image/jpeg;base64,YWJj");
                expect(mocks.writeCoucouState).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({
                        title: view,
                        count: 1,
                        view,
                        widgets: [{ id: view, title: view, view }],
                    })
                );
            }
            setNativeHudMode(42, false);
            const captures = mocks.writeCoucouState.mock.calls.length;
            await vi.advanceTimersByTimeAsync(2000);
            expect(mocks.writeCoucouState).toHaveBeenCalledTimes(captures);
        } finally {
            setNativeHudMode(42, false);
            vi.useRealTimers();
        }
    });
    test("scopes resize to the sending island and clamps presets to the display", () => {
        setNativeHudMode(42, true);
        openNativeHudIsland(42, { blockId: "browser", view: "web" });
        const [hud, island] = mocks.windows;
        expect(resizeCurrentNativeHudIsland(42, 480, 360)).toBe(false);
        expect(resizeCurrentNativeHudIsland(hud.webContents.id, 480, 360)).toBe(false);
        expect(resizeCurrentNativeHudIsland(island.webContents.id, NaN, 360)).toBe(false);
        expect(resizeCurrentNativeHudIsland(island.webContents.id, 480, 360)).toBe(true);
        expect(island.getBounds()).toEqual(expect.objectContaining({ width: 480, height: 360 }));
        expect(resizeCurrentNativeHudIsland(island.webContents.id, 5000, 5000)).toBe(true);
        expect(island.getBounds()).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
        expect(nativeHudWidgetRoute("tab-1", "browser")).toBe("tab:tab-1:island:browser");
        expect(nativeHudWidgetRoute("tab-1", "editor")).toBe("tab:tab-1");
    });

    test("passive owner capture preserves focus and refuses unrendered widgets", async () => {
        setNativeHudMode(42, true);
        const image = { isEmpty: () => false, resize: () => ({ toJPEG: () => Buffer.from("editor") }) };
        const owner = { isDestroyed: () => false, capturePage: vi.fn(async () => image), focus: vi.fn() };
        mocks.fromId.mockReturnValue(owner);
        const rect = { x: 0, y: 0, width: 820, height: 560 };
        syncNativeNotch(42, { previews: [{ id: "editor", view: "codeeditor", title: "Editor", rect }] });
        await expect(captureNativeHudBlock(42, "editor")).resolves.toBe("data:image/jpeg;base64,ZWRpdG9y");
        expect(owner.capturePage).toHaveBeenCalledWith(rect, { stayHidden: true, stayAwake: true });
        expect(owner.focus).not.toHaveBeenCalled();
        expect(mocks.ownerWindow.show).not.toHaveBeenCalled();
        syncNativeNotch(42, {
            previews: [{ id: "editor", view: "codeeditor", title: "Editor", rect: { ...rect, width: 0 } }],
        });
        await expect(captureNativeHudBlock(42, "editor")).rejects.toThrow("not rendered");
    });
    test("keeps every OS widget in the inventory without opening native duplicates", () => {
        setNativeHudMode(42, true);
        const rows = Array.from({ length: 44 }, (_, index) => ({
            id: `widget-${index}`,
            title: `Widget ${index}`,
            view: "term",
            rect: { x: 0, y: 0, width: 0, height: 0 },
        }));
        syncNativeNotch(42, { previews: rows });
        expect(selectNativeHudWidget(42, "widget-43", true)).toBe(true);
        expect(mocks.windows).toHaveLength(1);
        expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("native-hud-select-widget", {
            blockId: "widget-43",
            expanded: true,
        });
        syncNativeNotch(42, { previews: rows.slice(0, 43) });
        expect(selectNativeHudWidget(42, "widget-43", true)).toBe(false);
    });
    test("terminal plus creates a fresh session and split panes hide and restore as one tab", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            onEvent({ ...geometry, event: "ready" });
            onEvent({
                ...geometry,
                event: "preview-layout",
                previewX: 400,
                previewY: 60,
                previewWidth: 800,
                previewHeight: 600,
                previewVisible: true,
            });
            mocks.fromId.mockReturnValue({ id: 42, isDestroyed: () => false });
            syncNativeNotch(42, {
                previews: [
                    { id: "term-a", title: "Shell", view: "term", rect: { x: 0, y: 0, width: 800, height: 600 } },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            onEvent({ ...geometry, event: "action", action: "terminal-new" });
            expect(mocks.ownerTab.webContents.send).toHaveBeenCalledWith("native-hud-launch", "terminal", true);
            onEvent({ ...geometry, event: "action", action: "terminal-split-right" });
            openNativeHudIsland(42, { blockId: "term-b", title: "Logs", view: "term" });
            const first = mocks.windows[1];
            const second = mocks.windows[2];
            expect(first.getBounds()).toEqual({ x: 400, y: 60, width: 398, height: 600 });
            expect(second.getBounds()).toEqual({ x: 802, y: 60, width: 398, height: 600 });
            closeNativeHudSurface(first.webContents.id);
            expect(first.isVisible()).toBe(false);
            expect(second.isVisible()).toBe(false);
            expect(selectNativeHudWidget(42, "term-a", true)).toBe(true);
            expect(first.isVisible()).toBe(true);
            expect(second.isVisible()).toBe(true);
            expect(toggleNativeHudIslandExpanded(second.webContents.id)).toBe("detached");
            expect(first.isVisible()).toBe(true);
            expect(second.isVisible()).toBe(true);
            expect(first.getBounds().x + first.getBounds().width + 4).toBe(second.getBounds().x);
        } finally {
            vi.useRealTimers();
        }
    });

    test("pet drops on owned islands select Kron tools without revealing chat", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            onEvent({ ...geometry, event: "ready" });
            onEvent({
                ...geometry,
                event: "preview-layout",
                previewX: 400,
                previewY: 60,
                previewWidth: 800,
                previewHeight: 600,
                previewVisible: true,
            });
            mocks.fromId.mockReturnValue({ id: 42, isDestroyed: () => false });
            syncNativeNotch(42, {
                previews: [
                    {
                        id: "browser-target",
                        title: "Browser",
                        view: "web",
                        rect: { x: 0, y: 0, width: 800, height: 600 },
                    },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            const [hud, island] = mocks.windows;
            onEvent({
                ...geometry,
                event: "action",
                action: "pet-attach",
                route: JSON.stringify({ application: "Electron", window: island.getTitle() }),
            });
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(expect.anything(), {
                controlTarget: "Browser",
                controlRoute: "Kron tools",
            });
            expect(hud.webContents.send).toHaveBeenCalledWith(
                "hermes-context",
                expect.stringContaining("@widget:browser-target")
            );
            expect(hud.isVisible()).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
    test("routes browser header actions to the selected owned browser across presentations", async () => {
        vi.useFakeTimers();
        try {
            mocks.startCoucouHud.mockReturnValue({ kill: vi.fn() });
            setNativeHudMode(42, true);
            const onEvent = mocks.startCoucouHud.mock.calls[0][1];
            const geometry = { x: 0, y: 0, width: 1512, height: 982, inset: 32 };
            onEvent({ ...geometry, event: "ready" });
            onEvent({
                ...geometry,
                event: "preview-layout",
                previewX: 400,
                previewY: 60,
                previewWidth: 800,
                previewHeight: 600,
                previewVisible: true,
            });
            mocks.fromId.mockReturnValue({ id: 42, isDestroyed: () => false });
            const rect = { x: 0, y: 0, width: 800, height: 600 };
            syncNativeNotch(42, {
                previews: [
                    { id: "browser", title: "Browser", view: "web", rect },
                    { id: "terminal", title: "Terminal", view: "term", rect },
                ],
            });
            await vi.advanceTimersByTimeAsync(750);
            const browser = mocks.windows[1];
            expect(browser.setHasShadow).toHaveBeenLastCalledWith(false);
            syncNativeNotch(browser.webContents.id, { browser: { url: "https://example.com" } });
            expect(mocks.writeCoucouState).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    browserURL: "https://example.com",
                })
            );
            mocks.writeCoucouState.mockClear();
            syncNativeNotch(42, { browser: { url: "https://wrong-sender.example" } });
            expect(mocks.writeCoucouState).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ browserURL: expect.anything() })
            );
            onEvent({ ...geometry, event: "action", action: "browser-navigate", route: " search words " });
            expect(browser.webContents.send).toHaveBeenCalledWith("native-notch-browser-action", {
                action: "browser-navigate",
                url: "search words",
            });
            browser.webContents.send.mockClear();
            onEvent({ ...geometry, event: "action", action: "browser-navigate", route: " " });
            expect(browser.webContents.send).not.toHaveBeenCalled();
            onEvent({ ...geometry, event: "action", action: "preview-detach" });
            expect(getNativeHudIslandPresentation(browser.webContents.id)).toBe("detached");
            expect(mocks.windows[0].isVisible()).toBe(false);
            onEvent({ ...geometry, event: "action", action: "browser-back" });
            expect(browser.webContents.send).toHaveBeenCalledWith("native-notch-browser-action", {
                action: "browser-back",
            });
            onEvent({ ...geometry, event: "action", action: "browser-select:browser" });
            expect(getNativeHudIslandPresentation(browser.webContents.id)).toBe("detached");
            onEvent({ ...geometry, event: "action", action: "web-new" });
            openNativeHudIsland(42, { blockId: "browser-new", title: "New browser", view: "web", select: false });
            const newBrowser = mocks.windows.at(-1);
            expect(getNativeHudIslandPresentation(newBrowser.webContents.id)).toBe("detached");
            onEvent({ ...geometry, event: "action", action: "browser-reload" });
            expect(newBrowser.webContents.send).toHaveBeenCalledWith("native-notch-browser-action", {
                action: "browser-reload",
            });
            onEvent({ ...geometry, event: "action", action: "browser-select:browser" });
            browser.webContents.send.mockClear();
            onEvent({ ...geometry, event: "action", action: "preview-select:terminal" });
            const terminal = mocks.windows[2];
            terminal.webContents.send.mockClear();
            onEvent({ ...geometry, event: "action", action: "browser-reload" });
            expect(terminal.webContents.send).not.toHaveBeenCalled();
            expect(browser.webContents.send).not.toHaveBeenCalledWith("native-notch-browser-action", expect.anything());
        } finally {
            vi.useRealTimers();
        }
    });
});
