// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer, Rectangle, WebviewTag } from "electron";
import type { HermesSelection } from "../frontend/types/hermes-selection";

let nativeNotchAvailable = false;
ipcRenderer.on("native-notch-availability", (_event, available: unknown) => {
    nativeNotchAvailable = available === true;
});

// update type in custom.d.ts (ElectronApi type)
contextBridge.exposeInMainWorld("api", {
    onOSOverviewGesture: (callback: (direction: "up" | "down") => void) => {
        const listener = (_event, direction: unknown) => {
            if (direction === "up" || direction === "down") callback(direction);
        };
        ipcRenderer.on("os-overview-gesture", listener);
        return () => ipcRenderer.removeListener("os-overview-gesture", listener);
    },
    getAuthKey: () => ipcRenderer.sendSync("get-auth-key"),
    getIsDev: () => ipcRenderer.sendSync("get-is-dev"),
    getPlatform: () => ipcRenderer.sendSync("get-platform"),
    getCursorPoint: () => ipcRenderer.sendSync("get-cursor-point"),
    getUserName: () => ipcRenderer.sendSync("get-user-name"),
    getHostName: () => ipcRenderer.sendSync("get-host-name"),
    getDataDir: () => ipcRenderer.sendSync("get-data-dir"),
    getConfigDir: () => ipcRenderer.sendSync("get-config-dir"),
    getHomeDir: () => ipcRenderer.sendSync("get-home-dir"),
    getAboutModalDetails: () => ipcRenderer.sendSync("get-about-modal-details"),
    getWebviewPreload: () => ipcRenderer.sendSync("get-webview-preload"),
    getZoomFactor: () => ipcRenderer.sendSync("get-zoom-factor"),
    setHudWindowMode: (active: boolean, sessionId?: string, options?: { keepWorkspaceVisible?: boolean }) =>
        ipcRenderer.send("set-hud-window-mode", active, sessionId, options),
    setWindowIgnoreMouse: (ignore: boolean) => ipcRenderer.send("set-window-ignore-mouse", ignore),
    openNativeHudIsland: (input: { blockId: string; title?: string; view?: string; select?: boolean }) =>
        ipcRenderer.invoke("open-native-hud-island", input),
    setNativeHudIslandVisibility: (blockId: string, visible: boolean) =>
        ipcRenderer.invoke("set-native-hud-island-visibility", blockId, visible),
    requestNativeHudLaunch: (app: "web" | "files" | "terminal" | "widget" | "apps") =>
        ipcRenderer.send("request-native-hud-launch", app),
    getHudWidgetRoute: (blockId: string) => ipcRenderer.invoke("get-hud-widget-route", blockId),
    getNativeHudIslandPresentation: () => ipcRenderer.invoke("get-native-hud-island-presentation"),
    toggleNativeHudIslandExpanded: () => ipcRenderer.invoke("toggle-native-hud-island-expanded"),
    onNativeHudIslandPresentation: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on("native-hud-island-presentation", listener);
        return () => ipcRenderer.removeListener("native-hud-island-presentation", listener);
    },
    resizeCurrentNativeHudIsland: (width: number, height: number) =>
        ipcRenderer.invoke("resize-current-hud-island", width, height),
    selectNativeHudWidget: (blockId: string, expanded = true) =>
        ipcRenderer.invoke("select-native-hud-widget", blockId, expanded),
    captureNativeHudBlock: (blockId: string) => ipcRenderer.invoke("capture-native-hud-block", blockId),
    onNativeHudSelectWidget: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on("native-hud-select-widget", listener);
        return () => ipcRenderer.removeListener("native-hud-select-widget", listener);
    },
    onNativeHudSummon: (callback) => {
        const listener = () => callback();
        ipcRenderer.on("native-hud-summon", listener);
        return () => ipcRenderer.removeListener("native-hud-summon", listener);
    },
    comfyUiRequest: (request) => ipcRenderer.invoke("comfyui-command", request),
    workflowCommand: (command) => ipcRenderer.invoke("workflow-command", command),
    workflowContext: () => ipcRenderer.invoke("workflow-context"),
    workflowOpen: (runId) => ipcRenderer.invoke("workflow-open", runId),
    onWorkflowChanged: (callback) => {
        const handler = (_event: unknown, snapshot) => callback(snapshot);
        ipcRenderer.on("workflow-changed", handler);
        return () => ipcRenderer.removeListener("workflow-changed", handler);
    },
    syncNativeNotch: (state: unknown) => ipcRenderer.send("sync-native-notch", state),
    getNowPlaying: () => ipcRenderer.invoke("now-playing-get"),
    controlNowPlaying: (id, command) => ipcRenderer.invoke("now-playing-control", id, command),
    getProductivityState: () => ipcRenderer.invoke("productivity-get"),
    updateDesktopPetVoice: (voice) => ipcRenderer.send("desktop-pet-voice", voice),
    updateProductivity: (action) => ipcRenderer.invoke("productivity-update", action),
    isProductivityAppAllowed: (input) => ipcRenderer.invoke("productivity-check-app", input),
    onProductivityState: (callback) => {
        const handler = (_event: unknown, state) => callback(state);
        ipcRenderer.on("productivity-state", handler);
        return () => ipcRenderer.removeListener("productivity-state", handler);
    },
    browserNavigationHistory: (guestId, snapshot) =>
        ipcRenderer.invoke("browser-navigation-history", guestId, snapshot),
    browserGrab: (input) => ipcRenderer.invoke("browser-grab", input),
    desktopGrab: () => ipcRenderer.invoke("desktop-grab"),
    cancelDesktopGrab: () => ipcRenderer.invoke("cancel-desktop-grab"),
    browserCancelGrab: (guestId) => ipcRenderer.invoke("browser-cancel-grab", guestId),
    browserAccessibilitySnapshot: (guestId) => ipcRenderer.invoke("browser-accessibility-snapshot", guestId),
    captureBrowserPage: (input) => ipcRenderer.invoke("capture-browser-page", input),
    copyBrowserImage: (dataUrl) => ipcRenderer.invoke("copy-browser-image", dataUrl),
    importBrowserCookies: (input) => ipcRenderer.invoke("import-browser-cookies", input),
    onNativeHudVoiceControl: (callback) => {
        const handler = (_event: Electron.IpcRendererEvent, action: "mute" | "stop" | "interrupt" | "expand") =>
            callback(action);
        ipcRenderer.on("native-hud-voice-control", handler);
        return () => ipcRenderer.removeListener("native-hud-voice-control", handler);
    },
    onNativeNotchAvailability: (callback: (available: boolean) => void) => {
        const handler = (_event: unknown, available: unknown) => callback(available === true);
        ipcRenderer.on("native-notch-availability", handler);
        callback(nativeNotchAvailable);
        return () => ipcRenderer.removeListener("native-notch-availability", handler);
    },
    onNativeNotchNavigate: (callback: (route: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, route: string) => callback(route);
        ipcRenderer.on("native-notch-navigate", handler);
        return () => ipcRenderer.removeListener("native-notch-navigate", handler);
    },
    onNativeNotchExplorer: (callback: (path: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path);
        ipcRenderer.on("native-notch-explorer", handler);
        return () => ipcRenderer.removeListener("native-notch-explorer", handler);
    },
    onNativeNotchBrowserAction: (callback: (input: { action: string; url?: string }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, input: { action: string; url?: string }) => callback(input);
        ipcRenderer.on("native-notch-browser-action", handler);
        return () => ipcRenderer.removeListener("native-notch-browser-action", handler);
    },
    onNativeNotchFocus: (callback: (blockId: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, blockId: string) => callback(blockId);
        ipcRenderer.on("native-notch-focus", handler);
        return () => ipcRenderer.removeListener("native-notch-focus", handler);
    },
    requestNativeHudExit: () => ipcRenderer.send("request-native-hud-exit"),
    moveNativeHudBy: (delta: { x: number; y: number }) => ipcRenderer.send("move-native-hud-by", delta),
    closeNativeHudSurface: () => ipcRenderer.send("close-native-hud-surface"),
    onNativeHudLaunch: (
        callback: (app: "web" | "files" | "terminal" | "widget" | "apps", forceNew?: boolean) => void
    ) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            app: "web" | "files" | "terminal" | "widget" | "apps",
            forceNew?: boolean
        ) => callback(app, forceNew);
        const newBrowser = () => callback("web", true);
        ipcRenderer.on("native-hud-launch", handler);
        ipcRenderer.on("native-hud-new-browser", newBrowser);
        return () => {
            ipcRenderer.removeListener("native-hud-launch", handler);
            ipcRenderer.removeListener("native-hud-new-browser", newBrowser);
        };
    },
    onNativeHudAppTarget: (callback: (application: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, application: string) => callback(application);
        ipcRenderer.on("native-hud-app-target", handler);
        return () => ipcRenderer.removeListener("native-hud-app-target", handler);
    },
    onNativeHudExit: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on("native-hud-exit", handler);
        return () => ipcRenderer.removeListener("native-hud-exit", handler);
    },
    getSystemAppearance: () => ipcRenderer.sendSync("get-system-appearance"),
    onSystemAppearanceChange: (callback: (appearance: SystemAppearanceSnapshot) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, appearance: SystemAppearanceSnapshot) =>
            callback(appearance);
        ipcRenderer.on("system-appearance-change", handler);
        return () => ipcRenderer.removeListener("system-appearance-change", handler);
    },
    openNewWindow: () => ipcRenderer.send("open-new-window"),
    showWorkspaceAppMenu: (workspaceId) => ipcRenderer.send("workspace-appmenu-show", workspaceId),
    showContextMenu: (workspaceId, menu) => ipcRenderer.send("contextmenu-show", workspaceId, menu),
    onContextMenuClick: (callback: (id: string | null) => void) =>
        ipcRenderer.on("contextmenu-click", (_event, id: string | null) => callback(id)),
    downloadFile: (filePath) => ipcRenderer.send("download", { filePath }),
    openExternal: (url) => {
        if (url && typeof url === "string") {
            ipcRenderer.send("open-external", url);
        } else {
            console.error("Invalid URL passed to openExternal:", url);
        }
    },
    getEnv: (varName) => ipcRenderer.sendSync("get-env", varName),
    onFullScreenChange: (callback) =>
        ipcRenderer.on("fullscreen-change", (_event, isFullScreen) => callback(isFullScreen)),
    onZoomFactorChange: (callback) =>
        ipcRenderer.on("zoom-factor-change", (_event, zoomFactor) => callback(zoomFactor)),
    onUpdaterStatusChange: (callback) => ipcRenderer.on("app-update-status", (_event, status) => callback(status)),
    getUpdaterStatus: () => ipcRenderer.sendSync("get-app-update-status"),
    getUpdaterChannel: () => ipcRenderer.sendSync("get-updater-channel"),
    installAppUpdate: () => ipcRenderer.send("install-app-update"),
    onMenuItemAbout: (callback) => ipcRenderer.on("menu-item-about", callback),
    updateWindowControlsOverlay: (rect) => ipcRenderer.send("update-window-controls-overlay", rect),
    onReinjectKey: (callback) => ipcRenderer.on("reinject-key", (_event, waveEvent) => callback(waveEvent)),
    setWebviewFocus: (focused: number) => ipcRenderer.send("webview-focus", focused),
    registerGlobalWebviewKeys: (keys) => ipcRenderer.send("register-global-webview-keys", keys),
    onControlShiftStateUpdate: (callback) =>
        ipcRenderer.on("control-shift-state-update", (_event, state) => callback(state)),
    createWorkspace: () => ipcRenderer.send("create-workspace"),
    switchWorkspace: (workspaceId) => ipcRenderer.send("switch-workspace", workspaceId),
    deleteWorkspace: (workspaceId) => ipcRenderer.send("delete-workspace", workspaceId),
    setActiveTab: (tabId) => ipcRenderer.send("set-active-tab", tabId),
    createTab: () => ipcRenderer.send("create-tab"),
    closeTab: (workspaceId, tabId, confirmClose) => ipcRenderer.invoke("close-tab", workspaceId, tabId, confirmClose),
    setWindowInitStatus: (status) => ipcRenderer.send("set-window-init-status", status),
    onWaveInit: (callback) => ipcRenderer.on("wave-init", (_event, initOpts) => callback(initOpts)),
    sendLog: (log) => ipcRenderer.send("fe-log", log),
    onQuicklook: (filePath: string) => ipcRenderer.send("quicklook", filePath),
    openNativePath: (filePath: string) => ipcRenderer.send("open-native-path", filePath),
    revealNativePath: (filePath: string) => ipcRenderer.send("reveal-native-path", filePath),
    captureScreenshot: (rect: Rectangle, passive = false) => ipcRenderer.invoke("capture-screenshot", rect, passive),
    sendInputEvent: (
        inputEvent: Electron.KeyboardInputEvent | Electron.MouseInputEvent | Electron.MouseWheelInputEvent
    ) => ipcRenderer.invoke("agent-send-input-event", inputEvent),
    insertText: (text: string) => ipcRenderer.invoke("agent-insert-text", text),
    readClipboard: () => ipcRenderer.invoke("agent-read-clipboard"),
    writeClipboard: (text: string) => ipcRenderer.invoke("agent-write-clipboard", text),
    setKeyboardChordMode: () => ipcRenderer.send("set-keyboard-chord-mode"),
    clearWebviewStorage: (webContentsId: number) => ipcRenderer.invoke("clear-webview-storage", webContentsId),
    setWaveAIOpen: (isOpen: boolean) => ipcRenderer.send("set-waveai-open", isOpen),
    incrementTermCommands: (opts?: { isRemote?: boolean; isWsl?: boolean; isDurable?: boolean }) =>
        ipcRenderer.send("increment-term-commands", opts),
    nativePaste: () => ipcRenderer.send("native-paste"),
    doRefresh: () => ipcRenderer.send("do-refresh"),
    saveTextFile: (fileName: string, content: string) => ipcRenderer.invoke("save-text-file", fileName, content),
    selectDirectory: () => ipcRenderer.invoke("select-directory"),
    selectFiles: () => ipcRenderer.invoke("select-files"),
    selectWallpaper: () => ipcRenderer.invoke("select-wallpaper"),
    searchSystemItems: (query: string) => ipcRenderer.invoke("search-system-items", query),
    getNativeAppIcons: (appPaths: string[]) => ipcRenderer.invoke("get-native-app-icons", appPaths),
    getHostPermissionStatus: () => ipcRenderer.invoke("get-host-permission-status"),
    requestHostPermission: (permission: "screen-capture" | "accessibility" | "microphone") =>
        ipcRenderer.invoke("request-host-permission", permission),
    prepareNativeSurfaceCapture: (input: { appId: string; appName: string }) =>
        ipcRenderer.invoke("prepare-native-surface-capture", input),
    acpApplyGitIdentity: (opts) => ipcRenderer.invoke("acp-apply-git-identity", opts),
    setIsActive: () => ipcRenderer.invoke("set-is-active"),
    reportAgentCursor: (point, owner) => ipcRenderer.send("report-agent-cursor", point, owner),
    setDesktopPetActivity: (notification) => ipcRenderer.send("desktop-pet-activity", notification),
    onDesktopPetChat: (callback: (text: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
        ipcRenderer.on("desktop-pet-chat", handler);
        return () => ipcRenderer.removeListener("desktop-pet-chat", handler);
    },
    onDesktopPetResume: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on("desktop-pet-resume", handler);
        return () => ipcRenderer.removeListener("desktop-pet-resume", handler);
    },
    publishAgentSurfaceActivity: (activity: Record<string, unknown>) =>
        ipcRenderer.send("publish-agent-surface-activity", activity),
    sendHermesContext: (text: string) => ipcRenderer.invoke("send-hermes-context", text),
    sendHermesSelection: (selection: HermesSelection) => ipcRenderer.invoke("send-hermes-selection", selection),
    onHermesSelection: (callback: (selection: HermesSelection) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, selection: HermesSelection) => callback(selection);
        ipcRenderer.on("hermes-selection", handler);
        return () => ipcRenderer.removeListener("hermes-selection", handler);
    },
    onHermesContext: (callback: (text: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
        ipcRenderer.on("hermes-context", handler);
        return () => ipcRenderer.removeListener("hermes-context", handler);
    },
    requestAgentTakeover: (sessionId?: string) => ipcRenderer.send("request-agent-takeover", sessionId),
    manageNativeTaskGroups: (input) => ipcRenderer.invoke("native-task-groups:manage", input),
    listLinuxDesktops: () => ipcRenderer.invoke("linux-desktops:list"),
    performLinuxDesktopAction: (action) => ipcRenderer.invoke("linux-desktops:action", action),
    assignLinuxDesktop: (desktopId, agentId, expectedGeneration) =>
        ipcRenderer.invoke("linux-desktops:assign", { desktopId, agentId, expectedGeneration }),
    takeOverLinuxDesktop: (desktopId) => ipcRenderer.invoke("linux-desktops:takeover", desktopId),
    resumeLinuxDesktop: (desktopId, expectedGeneration) =>
        ipcRenderer.invoke("linux-desktops:resume", { desktopId, expectedGeneration }),
    listComputerTargets: () => ipcRenderer.invoke("computer-targets:list"),
    startComputerTargetSession: (targetId: string, expectedGeneration: number) =>
        ipcRenderer.invoke("computer-targets:connect", { targetId, expectedGeneration }),
    readComputerTargetFrame: (sessionId: string) => ipcRenderer.invoke("computer-targets:frame", sessionId),
    stopComputerTargetSession: (sessionId: string) => ipcRenderer.invoke("computer-targets:disconnect", sessionId),
    performComputerTargetAction: (action) => ipcRenderer.invoke("computer-targets:action", action),
    takeOverComputerTarget: (targetId: string) => ipcRenderer.invoke("computer-targets:takeover", targetId),
    resumeComputerTarget: (targetId: string, expectedGeneration: number) =>
        ipcRenderer.invoke("computer-targets:resume", { targetId, expectedGeneration }),
    onAgentTakeover: (callback: (sessionId?: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, sessionId?: string) => callback(sessionId);
        ipcRenderer.on("agent-takeover", handler);
        return () => ipcRenderer.removeListener("agent-takeover", handler);
    },
    onDesktopPetSurfaceActivity: (callback: (activity: Record<string, unknown>) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, activity: Record<string, unknown>) => callback(activity);
        ipcRenderer.on("desktop-pet-surface-activity", handler);
        return () => ipcRenderer.removeListener("desktop-pet-surface-activity", handler);
    },
    acpDetectAgents: () => ipcRenderer.invoke("acp-detect-agents"),
    acpInitialize: (opts) => ipcRenderer.invoke("acp-initialize", opts),
    acpSendMessage: (opts) => ipcRenderer.invoke("acp-send-message", opts),
    acpConfirmTool: (opts) => ipcRenderer.invoke("acp-confirm-tool", opts),
    acpStop: (opts) => ipcRenderer.invoke("acp-stop", opts),
    acpCancel: (opts) => ipcRenderer.invoke("acp-cancel", opts),
    acpGetStatus: (opts) => ipcRenderer.invoke("acp-get-status", opts),
    acpListRuntimes: () => ipcRenderer.invoke("acp-list-runtimes"),
    acpGetMode: (opts) => ipcRenderer.invoke("acp-get-mode", opts),
    acpSetMode: (opts) => ipcRenderer.invoke("acp-set-mode", opts),
    acpGetConfigOptions: (opts) => ipcRenderer.invoke("acp-get-config-options", opts),
    acpSetConfigOption: (opts) => ipcRenderer.invoke("acp-set-config-option", opts),
    acpGetModelInfo: (opts) => ipcRenderer.invoke("acp-get-model-info", opts),
    acpSetModel: (opts) => ipcRenderer.invoke("acp-set-model", opts),
    onAcpEvent: (callback: (event: any) => void) => {
        const handler = (_event: any, event: any) => callback(event);
        ipcRenderer.on("acp-event", handler);
        return () => ipcRenderer.removeListener("acp-event", handler);
    },

    // ── LSP (Language Server Protocol) IPC ───────────────────────────
    lspStart: (language: string) =>
        ipcRenderer.invoke("lsp-start", language).then((r: any) => {
            if (!r.success) throw new Error(r.error ?? "Failed to start language server");
            return r.sessionId as string;
        }),
    lspSend: (sessionId: string, content: string) => ipcRenderer.send("lsp-send", sessionId, content),
    lspStop: (sessionId: string) => ipcRenderer.send("lsp-stop", sessionId),
    onLspMessage: (callback: (msg: { sessionId: string; content: string }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, msg: { sessionId: string; content: string }) =>
            callback(msg);
        ipcRenderer.on("lsp-message", handler);
        return () => ipcRenderer.removeListener("lsp-message", handler);
    },

    hermesGetConnection: (context?: { tabId?: string; blockId?: string }) =>
        ipcRenderer.invoke("hermes-get-connection", context),
    hermesApi: (input) => ipcRenderer.invoke("hermes-api", input),
    onHermesConnection: (callback) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: HermesConnectionDescriptor) => callback(payload);
        ipcRenderer.on("hermes-connection", handler);
        return () => ipcRenderer.removeListener("hermes-connection", handler);
    },
    onHermesRuntimeFailure: (callback) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: { message: string }) => callback(payload);
        ipcRenderer.on("hermes-runtime-failure", handler);
        return () => ipcRenderer.removeListener("hermes-runtime-failure", handler);
    },
    kronoscodeGetConnection: () => ipcRenderer.invoke("kronoscode-get-connection"),
    kronoscodeRevalidateConnection: () => ipcRenderer.invoke("kronoscode-revalidate-connection"),
    kronoscodeTouchBackend: () => ipcRenderer.invoke("kronoscode-touch-backend"),
    kronoscodeGetGatewayWsUrl: (input?: { directory?: string; surfaceId?: string }) =>
        ipcRenderer.invoke("kronoscode-get-gateway-ws-url", input),
    kronoscodeApi: (input) => ipcRenderer.invoke("kronoscode-api", input),
    kronoscodeApplyConnection: (input) => ipcRenderer.invoke("kronoscode-apply-connection", input),
    kronoscodeGetBootProgress: () => ipcRenderer.invoke("kronoscode-get-boot-progress"),
    onKronosCodeBootProgress: (callback) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: KronosCodeBootProgress) => callback(payload);
        ipcRenderer.on("kronoscode-boot-progress", handler);
        return () => ipcRenderer.removeListener("kronoscode-boot-progress", handler);
    },
    onKronosCodeExit: (callback) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: { code: number | null; signal: string | null }) =>
            callback(payload);
        ipcRenderer.on("kronoscode-exit", handler);
        return () => ipcRenderer.removeListener("kronoscode-exit", handler);
    },
    onKronosCodePowerResume: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("kronoscode-power-resume", handler);
        return () => ipcRenderer.removeListener("kronoscode-power-resume", handler);
    },
    onKronosCodeConnectionApplied: (callback) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: KronosCodeConnectionDescriptor) =>
            callback(payload);
        ipcRenderer.on("kronoscode-connection-applied", handler);
        return () => ipcRenderer.removeListener("kronoscode-connection-applied", handler);
    },

    // ── Audio / Voice Engine IPC ─────────────────────────────────────
    audioTranscribeFile: (file: string) => ipcRenderer.invoke("audio-transcribe-file", file),
    audioStart: () => ipcRenderer.invoke("audio-start"),
    audioShutdown: () => ipcRenderer.send("audio-shutdown"),
    audioStartListening: () => ipcRenderer.send("audio-start-listening"),
    audioStopListening: () => ipcRenderer.send("audio-stop-listening"),
    audioSpeak: (text: string) => ipcRenderer.send("audio-speak", text),
    audioSetWakeWord: (enabled: boolean) => ipcRenderer.send("audio-set-wake-word", enabled),
    onAudioStatusChange: (callback: (status: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
        ipcRenderer.on("audio-status-change", handler);
        return () => ipcRenderer.removeListener("audio-status-change", handler);
    },
    onAudioTranscript: (callback: (text: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
        ipcRenderer.on("audio-transcript", handler);
        return () => ipcRenderer.removeListener("audio-transcript", handler);
    },
    onAudioError: (callback: (message: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
        ipcRenderer.on("audio-error", handler);
        return () => ipcRenderer.removeListener("audio-error", handler);
    },
});

// Custom event for "new-window"
ipcRenderer.on("webview-new-window", (e, webContentsId, details) => {
    const event = new CustomEvent("new-window", { detail: details });
    document.getElementById("webview").dispatchEvent(event);
});

ipcRenderer.on("webcontentsid-from-blockid", (e, blockId, responseCh) => {
    const webviewElem: WebviewTag = document.querySelector("div[data-blockid='" + blockId + "'] webview");
    const wcId = webviewElem?.dataset?.webcontentsid;
    ipcRenderer.send(responseCh, wcId);
});
