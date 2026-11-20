// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const acpPreviewListeners = new Set<
    (event: { conversationId: string; type: string; msgId: string; data?: any; timestamp: number }) => void
>();

function emitAcpPreviewEvent(conversationId: string, type: string, data?: any) {
    const event = {
        conversationId,
        type,
        msgId: `${conversationId}-preview-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        data,
        timestamp: Date.now(),
    };
    acpPreviewListeners.forEach((listener) => listener(event));
}

const previewAcpAgents = [
    {
        backend: "kronoscode",
        name: "KronosCode",
        cliPath: "/Users/albsheralsadi/kronterm/kronoscoder/packages/kronoscode/bin/kronoscode",
        available: true,
        avatar: "K",
        description: "Local KronosCode ACP agent",
        authRequired: false,
        supportsStreaming: true,
        acpArgs: ["acp"],
        skillsDirs: [".kronoscode/skills"],
    },
    { backend: "opencode", name: "OpenCode", cliPath: "opencode", available: true, avatar: "O", acpArgs: ["acp"] },
    {
        backend: "codex",
        name: "Codex",
        cliPath: "npx @zed-industries/codex-acp@0.9.5",
        available: true,
        avatar: "C",
    },
    {
        backend: "gemini",
        name: "Gemini",
        cliPath: "gemini",
        available: true,
        avatar: "G",
        acpArgs: ["--experimental-acp"],
    },
    {
        backend: "claude",
        name: "Claude",
        cliPath: "claude",
        available: false,
        avatar: "A",
        acpArgs: ["--experimental-acp"],
    },
];

const previewAcpModels = [
    { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
    { id: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { id: "openai/gpt-5.2", label: "GPT-5.2" },
    { id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
    { id: "google/gemini-3-flash", label: "Gemini 3 Flash" },
];

const previewRuntimes = new Map<
    string,
    { conversationId: string; backend: string; workspace?: string; status: string; sessionId: string }
>();

const previewElectronApi: ElectronApi = {
    getDiagnosticReport: async () => ({ product: "KronOS", version: "preview", platform: "preview", architecture: "preview", electron: "preview", collectedAt: new Date().toISOString(), automaticUploads: false, entries: [] }),
    clearDiagnosticReport: async () => {},
    recordRendererFailure: () => {},
    openBotDesktop: async () => {
        throw new Error("Bot desktops require the managed runtime");
    },
    agentBotCommand: async () => ({ bots: [], messages: [], busy: false }),
    projectRoomCommand: async () => { throw new Error("Project rooms require the managed desktop runtime."); },
    openAgentWorkspace: async () => {
        throw new Error("Agent workspace requires the managed Electron runtime.");
    },
    openKronosSignIn: () => {},
    getKronosAccountStatus: async () => ({ configured: false, account: null }),
    signOutKronosAccount: async () => ({ configured: false, account: null }),
    onKronosAccountChanged: () => () => {},
    getAuthKey: () => "",
    getIsDev: () => false,
    getCursorPoint: () => ({ x: 0, y: 0 }) as Electron.Point,
    getPlatform: () => "darwin",
    getEnv: (_varName: string) => "",
    getUserName: () => "",
    getHostName: () => "",
    getDataDir: () => "",
    getConfigDir: () => "",
    getHomeDir: () => "",
    getWebviewPreload: () => "",
    getAboutModalDetails: () => ({}) as AboutModalDetails,
    getZoomFactor: () => 1.0,
    setHudWindowMode: (_active: boolean, _sessionId?: string, _options?: { keepWorkspaceVisible?: boolean }) => {},
    setWindowIgnoreMouse: (_ignore: boolean) => {},
    openNativeHudIsland: (_input: { blockId: string; title?: string; view?: string }) => Promise.resolve(false),
    setNativeHudIslandVisibility: (_blockId: string, _visible: boolean) => Promise.resolve(false),
    requestNativeHudLaunch: (_app: "web" | "files" | "terminal" | "widget" | "apps") => {},
    comfyUiRequest: async () => {
        throw new Error("Image Studio requires a local ComfyUI server and the desktop runtime.");
    },
    workflowCommand: async () => ({ runs: [], workflows: [] }),
    workflowContext: async () => ({ workspaceId: "preview-workspace", tabId: "preview-tab", blocks: [] }),
    workflowOpen: async () => true,
    onWorkflowChanged: () => () => {},
    syncNativeNotch: (_state: unknown) => {},
    getNowPlaying: async () => undefined,
    controlNowPlaying: async () => undefined,
    getProductivityState: async () => (await import("../../types/productivity")).emptyProductivityState(),
    updateProductivity: async () => (await import("../../types/productivity")).emptyProductivityState(),
    isProductivityAppAllowed: async () => true,
    onProductivityState: () => () => {},
    updateDesktopPetVoice: () => {},
    desktopGrab: async () => {
        throw new Error("Native desktop required");
    },
    cancelDesktopGrab: async () => {},
    onBrowserElementSelection: () => () => {},
    pickComputerTargetElement: async () => ({ success: true, data: null }),
    browserSessions: async () => { throw new Error("Browser sessions require the desktop app."); },
    browserAccount: async () => undefined,
    browserMigration: async () => ({ canceled: true }),
    importBrowserExtension: async () => null,
    browserSearchSuggestions: async () => [],
    browserSiteSettings: async () => ({ origin: null, permissions: {}, downloads: [] }),
    browserNavigationHistory: async () => null,
    browserGrab: async (input) => ({ opId: input.opId, kind: "error", reason: "Native browser required" }),
    browserCancelGrab: async () => {},
    browserAccessibilitySnapshot: async () => {
        throw new Error("Native browser required");
    },
    captureBrowserPage: async () => {
        throw new Error("Native browser required");
    },
    copyBrowserImage: async () => false,
    importBrowserCookies: async () => {
        throw new Error("Native browser required");
    },
    onNativeHudVoiceControl: () => () => {},
    onNativeNotchAvailability: (callback) => {
        callback(false);
        return () => {};
    },
    onNativeNotchNavigate: (_callback: (route: string) => void) => () => {},
    onNativeNotchExplorer: (_callback: (path: string) => void) => () => {},
    onNativeNotchBrowserAction: (_callback: (input: { action: string; url?: string }) => void) => () => {},
    onNativeNotchFocus: (_callback: (blockId: string) => void) => () => {},
    requestNativeHudExit: () => {},
    moveNativeHudBy: (_delta: { x: number; y: number }) => {},
    getHudWidgetRoute: async () => "",
    getNativeHudIslandPresentation: async () => "detached",
    toggleNativeHudIslandExpanded: async () => "detached",
    onNativeHudIslandPresentation: () => () => {},
    resizeCurrentNativeHudIsland: async () => false,
    selectNativeHudWidget: async () => false,
    captureNativeHudBlock: async () => "",
    onNativeHudSelectWidget: () => () => {},
    onNativeHudSummon: () => () => {},
    closeNativeHudSurface: () => {},
    onNativeHudLaunch: (_callback: (app: "web" | "files" | "terminal" | "widget" | "apps") => void) => () => {},
    onNativeHudAppTarget: (_callback) => () => {},
    onNativeHudExit: (_callback: () => void) => () => {},
    getSystemAppearance: () => ({
        colorScheme: "light",
        contrast: "normal",
        reducedTransparency: false,
        reducedMotion: false,
    }),
    onSystemAppearanceChange: (_callback: (appearance: SystemAppearanceSnapshot) => void) => () => {},
    showWorkspaceAppMenu: (_workspaceId: string) => {},
    showBuilderAppMenu: (_builderId: string) => {},
    showContextMenu: (_workspaceId: string, _menu: ElectronContextMenuItem[]) => {},
    onContextMenuClick: (_callback: (id: string | null) => void) => {},
    onNavigate: (_callback: (url: string) => void) => {},
    onIframeNavigate: (_callback: (url: string) => void) => {},
    downloadFile: (_path: string) => {},
    openExternal: (_url: string) => {},
    onFullScreenChange: (_callback: (isFullScreen: boolean) => void) => {},
    onZoomFactorChange: (_callback: (zoomFactor: number) => void) => {},
    onUpdaterStatusChange: (_callback: (status: UpdaterStatus) => void) => {},
    getUpdaterStatus: () => "up-to-date",
    getUpdaterChannel: () => "",
    installAppUpdate: () => {},
    onMenuItemAbout: (_callback: () => void) => {},
    updateWindowControlsOverlay: (_rect: Dimensions) => {},
    onReinjectKey: (_callback: (waveEvent: WaveKeyboardEvent) => void) => {},
    setWebviewFocus: (_focusedId: number) => {},
    registerGlobalWebviewKeys: (_keys: string[]) => {},
    onControlShiftStateUpdate: (_callback: (state: boolean) => void) => {},
    createWorkspace: () => {},
    switchWorkspace: (_workspaceId: string) => {},
    deleteWorkspace: (_workspaceId: string) => {},
    setActiveTab: (_tabId: string) => {},
    createTab: () => {},
    closeTab: (_workspaceId: string, _tabId: string, _confirmClose: boolean) => Promise.resolve(false),
    setWindowInitStatus: (_status: "ready" | "wave-ready") => {},
    onWaveInit: (_callback: (initOpts: WaveInitOpts) => void) => {},
    onBuilderInit: (_callback: (initOpts: BuilderInitOpts) => void) => {},
    sendLog: (_log: string) => {},
    onQuicklook: (_filePath: string) => {},
    openNativePath: (_filePath: string) => {},
    captureScreenshot: (_rect: Electron.Rectangle) => Promise.resolve(""),
    sendInputEvent: (
        _inputEvent: Electron.KeyboardInputEvent | Electron.MouseInputEvent | Electron.MouseWheelInputEvent
    ) => Promise.resolve(),
    insertText: (_text: string) => Promise.resolve(),
    readClipboard: () => Promise.resolve(""),
    writeClipboard: (_text: string) => Promise.resolve(),
    setKeyboardChordMode: () => {},
    clearWebviewStorage: (_webContentsId: number) => Promise.resolve(),
    setWaveAIOpen: (_isOpen: boolean) => {},
    closeBuilderWindow: () => {},
    incrementTermCommands: (_opts?: { isRemote?: boolean; isWsl?: boolean; isDurable?: boolean }) => {},
    nativePaste: () => {},
    openBuilder: (_appId?: string) => {},
    setBuilderWindowAppId: (_appId: string) => {},
    doRefresh: () => {},
    saveTextFile: (_fileName: string, _content: string) => Promise.resolve(false),
    selectDirectory: () => Promise.resolve("/Users/albsheralsadi/kronterm"),
    selectFiles: () =>
        Promise.resolve([
            "/Users/albsheralsadi/kronterm/frontend/app/aipanel/acp-chat-panel.tsx",
            "/Users/albsheralsadi/kronterm/frontend/app/aipanel/use-acp-session.ts",
        ]),
    getPathForFile: () => "",
    selectWallpaper: () => Promise.resolve(null),
    revealNativePath: (_filePath: string) => {},
    searchSystemItems: (_query: string) => Promise.resolve([]),
    getNativeAppIcons: (_appPaths: string[]) => Promise.resolve({}),
    getHostPermissionStatus: () =>
        Promise.resolve({
            screenCapture: "granted",
            accessibility: "granted",
            microphone: "not-determined",
        }),
    requestHostPermission: (_permission: "screen-capture" | "accessibility" | "microphone") =>
        Promise.resolve({
            screenCapture: "granted",
            accessibility: "granted",
            microphone: "granted",
        }),
    appStreamInput: async () => {},
    prepareNativeSurfaceCapture: (input: { appId: string; appName: string }) =>
        Promise.resolve({ sourceId: `preview:${input.appId}`, title: input.appName }),
    acpApplyGitIdentity: (_opts: { workspace: string; userName: string; userEmail: string }) =>
        Promise.resolve({ success: true }),
    setIsActive: async () => {},
    reportAgentCursor: (_point, _owner) => {},
    setDesktopPetActivity: (_notification) => {},
    onDesktopPetChat: (_callback) => () => {},
    onDesktopPetResume: (_callback) => () => {},
    onDesktopPetSurfaceActivity: (_callback) => () => {},
    publishAgentSurfaceActivity: (_activity) => {},
    sendHermesContext: async () => {
        throw new Error("Hermes is unavailable in component preview");
    },
    onHermesContext: () => () => {},
    sendHermesSelection: async () => {
        throw new Error("Hermes is unavailable in component preview");
    },
    onHermesSelection: () => () => {},
    requestAgentTakeover: () => {},
    onOSOverviewGesture: () => () => {},
    manageNativeTaskGroups: async () => ({ success: true as const, data: { workspaces: [] } }),
    manageComputerPlugins: async () => ({ success: true as const, data: { plugins: [], computers: [] } }),
    sandboxComputerAccess: async () => ({ enabled: false, desktopId: "" }),
    sandboxLogin: async () => ({}),
    listLinuxDesktops: async () => ({ success: true as const, data: [] }),
    listMacVms: async () => ({
        success: true as const,
        data: { available: false, problem: "macOS VMs are unavailable in preview.", machines: [] },
    }),
    startMacVm: async () => ({
        success: false as const,
        error: { code: "preview", message: "macOS VMs are unavailable in preview." },
    }),
    stopMacVm: async () => ({ success: true as const, data: undefined }),
    performLinuxDesktopAction: async () => ({
        success: false as const,
        error: { code: "unavailable", message: "Enable the local Linux desktop runtime." },
    }),
    assignLinuxDesktop: async () => ({
        success: false as const,
        error: { code: "unavailable", message: "Enable the local Linux desktop runtime." },
    }),
    takeOverLinuxDesktop: async () => ({
        success: false as const,
        error: { code: "unavailable", message: "Enable the local Linux desktop runtime." },
    }),
    resumeLinuxDesktop: async () => ({
        success: false as const,
        error: { code: "unavailable", message: "Enable the local Linux desktop runtime." },
    }),
    resolveIPhonePreviewTarget: async () => ({
        success: false as const,
        error: { code: "computer-target-unavailable", message: "The iPhone preview requires KronOS desktop." },
    }),
    listComputerTargets: async () => ({ success: true as const, data: [] }),
    startComputerTargetSession: async () => ({
        success: false as const,
        error: { code: "preview", message: "Open the Computers preview to use its explicitly mocked device" },
    }),
    readComputerTargetFrame: async () => ({
        success: false as const,
        error: { code: "preview", message: "Live devices require the desktop app" },
    }),
    stopComputerTargetSession: async () => ({ success: true as const, data: undefined }),
    performComputerTargetAction: async () => ({
        success: false as const,
        error: { code: "preview", message: "Simulator actions require the desktop app" },
    }),
    takeOverComputerTarget: async () => ({
        success: false as const,
        error: { code: "preview", message: "Simulator actions require the desktop app" },
    }),
    resumeComputerTarget: async () => ({
        success: false as const,
        error: { code: "preview", message: "Simulator actions require the desktop app" },
    }),
    onAgentTakeover: (_callback) => () => {},
    acpDetectAgents: () => Promise.resolve(previewAcpAgents),
    acpInitialize: (opts: {
        conversationId: string;
        backend: string;
        workspace?: string;
        cliPath?: string;
        customArgs?: string[];
        customEnv?: Record<string, string>;
        resumeSessionId?: string;
        resumeSessionConversationId?: string;
        mcpServers?: Array<
            | {
                  type?: "stdio";
                  name: string;
                  command: string;
                  args: string[];
                  env: Array<{ name: string; value: string }>;
              }
            | {
                  type: "http" | "sse";
                  name: string;
                  url: string;
                  headers?: Array<{ name: string; value: string }>;
              }
        >;
    }) => {
        previewRuntimes.set(opts.conversationId, {
            conversationId: opts.conversationId,
            backend: opts.backend,
            workspace: opts.workspace,
            status: "connected",
            sessionId: opts.resumeSessionId ?? `${opts.conversationId}-session`,
        });
        window.setTimeout(() => {
            emitAcpPreviewEvent(opts.conversationId, "status", { status: "connected" });
            emitAcpPreviewEvent(opts.conversationId, "config_option", {
                currentMode: "default",
                modes: {
                    currentModeId: "default",
                    availableModes: [
                        { id: "default", name: "Auto" },
                        { id: "plan", name: "Plan" },
                        { id: "build", name: "Build" },
                    ],
                },
                configOptions: [],
            });
            emitAcpPreviewEvent(opts.conversationId, "agent_info", {
                modelInfo: {
                    currentModelId: "anthropic/claude-sonnet-4-5",
                    currentModelLabel: "Claude Sonnet 4.5",
                    canSwitch: true,
                    availableModels: previewAcpModels,
                },
            });
        }, 150);
        return Promise.resolve({ success: true });
    },
    acpSendMessage: (opts: { conversationId: string; content: string }) => {
        const runtime = previewRuntimes.get(opts.conversationId);
        if (runtime) {
            runtime.status = "running";
        }
        window.setTimeout(() => {
            emitAcpPreviewEvent(opts.conversationId, "status", { status: "running" });
            emitAcpPreviewEvent(opts.conversationId, "agent_message_chunk", {
                text: `Preview response from ACP for: ${opts.content}`,
            });
            emitAcpPreviewEvent(opts.conversationId, "tool_call", {
                title: "Preview tool call",
                status: "completed",
                rawInput: { command: "kronoscode acp", workspace: "preview" },
            });
            emitAcpPreviewEvent(opts.conversationId, "finish", {});
            if (runtime) {
                runtime.status = "finished";
            }
        }, 250);
        return Promise.resolve({ success: true });
    },
    acpConfirmTool: (_opts: { conversationId: string; msgId: string; callId: string; optionId: string }) =>
        Promise.resolve({ success: false, error: "ACP is not available in preview" }),
    acpCancel: (_opts: { conversationId: string }) => Promise.resolve({ success: true }),
    acpStop: (_opts: { conversationId: string }) => {
        previewRuntimes.delete(_opts.conversationId);
        return Promise.resolve({ success: true });
    },
    acpGetStatus: (_opts: { conversationId: string }) => {
        const runtime = previewRuntimes.get(_opts.conversationId);
        return Promise.resolve(
            runtime
                ? {
                      found: true,
                      ...runtime,
                      modelInfo: {
                          currentModelId: "anthropic/claude-sonnet-4-5",
                          currentModelLabel: "Claude Sonnet 4.5",
                          canSwitch: true,
                          availableModels: previewAcpModels,
                      },
                      modes: {
                          currentModeId: "default",
                          availableModes: [
                              { id: "default", name: "Auto" },
                              { id: "plan", name: "Plan" },
                              { id: "build", name: "Build" },
                          ],
                      },
                      currentMode: "default",
                      configOptions: [],
                      capabilities: { loadSession: true, mcpCapabilities: { stdio: true } },
                  }
                : { found: false, status: "idle" }
        );
    },
    acpListRuntimes: () => Promise.resolve(Array.from(previewRuntimes.values())),
    acpGetMode: (_opts: { conversationId: string }) =>
        Promise.resolve({ success: true, data: { mode: "default", initialized: true } }),
    acpSetMode: (_opts: { conversationId: string; mode: string }) =>
        Promise.resolve({ success: true, data: { mode: _opts.mode, initialized: true } }),
    acpGetConfigOptions: (_opts: { conversationId: string }) =>
        Promise.resolve({ success: true, data: { configOptions: [] } }),
    acpSetConfigOption: (_opts: { conversationId: string; configId: string; value: string }) =>
        Promise.resolve({ success: true, data: { configOptions: [] } }),
    acpGetModelInfo: (_opts: { conversationId: string }) =>
        Promise.resolve({
            success: true,
            data: {
                modelInfo: {
                    currentModelId: "anthropic/claude-sonnet-4-5",
                    currentModelLabel: "Claude Sonnet 4.5",
                    canSwitch: true,
                    availableModels: previewAcpModels,
                },
            },
        }),
    acpSetModel: (_opts: { conversationId: string; modelId: string }) =>
        Promise.resolve({
            success: true,
            data: {
                modelInfo: {
                    currentModelId: _opts.modelId,
                    currentModelLabel: previewAcpModels.find((model) => model.id === _opts.modelId)?.label,
                    canSwitch: true,
                    availableModels: previewAcpModels,
                },
            },
        }),
    lspStart: (_language: string) => Promise.reject(new Error("LSP is not available in preview")),
    lspSend: (_sessionId: string, _content: string) => {},
    lspStop: (_sessionId: string) => {},
    onLspMessage: (_callback: (msg: { sessionId: string; content: string }) => void) => () => {},
    hermesGetConnection: (_context?: HermesSurfaceContext) =>
        Promise.reject(new Error("Hermes is only available in the Electron app")),
    getKronTermAccountStatus: () => Promise.resolve({ configured: true, encryptionAvailable: true }),
    hermesApi: () => Promise.reject(new Error("Hermes is only available in the Electron app")),
    swarmRecovery: async () => [],
    onHermesConnection: () => () => {},
    onHermesRuntimeFailure: () => () => {},
    kronoscodeGetConnection: () =>
        Promise.resolve({
            mode: "managed" as const,
            baseUrl: "http://127.0.0.1:4096",
            backendVersion: "preview",
            protocolVersion: "1.0",
            serverInstanceId: "preview",
            capabilities: { gateway: true, replay: true, asyncPrompt: true },
            managed: true,
        }),
    kronoscodeRevalidateConnection: () => previewElectronApi.kronoscodeGetConnection(),
    kronoscodeTouchBackend: () => Promise.resolve(true),
    kronoscodeGetGatewayWsUrl: () => Promise.resolve("ws://127.0.0.1:4096/global/gateway?ticket=preview"),
    kronoscodeApi: () => Promise.resolve({ status: 200, headers: {}, body: {} }),
    kronoscodeApplyConnection: () => previewElectronApi.kronoscodeGetConnection(),
    kronoscodeGetBootProgress: () =>
        Promise.resolve({ phase: "ready" as const, message: "Preview KronosCode is ready.", progress: 100 }),
    onKronosCodeBootProgress: () => () => {},
    onKronosCodeExit: () => () => {},
    onKronosCodePowerResume: () => () => {},
    onKronosCodeConnectionApplied: () => () => {},
    audioTranscribeFile: async () => {
        throw new Error("File transcription requires the desktop audio engine and a cached speech model.");
    },
    audioStart: () => Promise.resolve(false),
    runPenAgent: () => Promise.reject(new Error("The Pen agent experiment requires the desktop app.")),
    cancelPenAgent: () => {},
    onPenAgentDelta: () => () => {},
    audioPenTinyVoca: () => Promise.reject(new Error("Tiny Voca requires the KronOS desktop app.")),
    audioShutdown: () => {},
    audioStartListening: () => {},
    audioStopListening: () => {},
    audioSpeak: (_text: string) => {},
    audioSetWakeWord: (_enabled: boolean) => {},
    onAudioStatusChange: (_callback: (status: string) => void) => () => {},
    onAudioTranscript: (_callback: (text: string) => void) => () => {},
    onAudioError: (_callback: (message: string) => void) => () => {},

    onAcpEvent: (
        callback: (event: {
            conversationId: string;
            type: string;
            msgId: string;
            data?: any;
            timestamp: number;
        }) => void
    ) => {
        acpPreviewListeners.add(callback);
        return () => {
            acpPreviewListeners.delete(callback);
        };
    },
};

function installPreviewElectronApi() {
    if ((window as any).__krontermLiveDevices === true) {
        const call = async (method: string, args: Record<string, unknown> = {}) => {
            try {
                const response = await fetch("/__kronterm_devices", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-kronterm-device-preview": (window as any).__krontermDevicePreviewToken,
                    },
                    body: JSON.stringify({ method, ...args }),
                });
                return await response.json();
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: "preview-disconnected",
                        message: error instanceof Error ? error.message : "Live preview disconnected",
                    },
                };
            }
        };
        Object.assign(previewElectronApi, {
            manageComputerPlugins: async () => ({ success: true as const, data: { plugins: [], computers: [] } }),
            sandboxComputerAccess: async () => ({ enabled: false, desktopId: "" }),
            listLinuxDesktops: () => call("linux-list"),
            performLinuxDesktopAction: (action) => call("linux-action", { action }),
            assignLinuxDesktop: (desktopId, agentId, expectedGeneration) =>
                call("linux-assign", { desktopId, agentId, expectedGeneration }),
            takeOverLinuxDesktop: (desktopId) => call("linux-takeover", { desktopId }),
            resumeLinuxDesktop: (desktopId, expectedGeneration) =>
                call("linux-resume", { desktopId, expectedGeneration }),
            listComputerTargets: () => call("list"),
            performComputerTargetAction: (action: unknown) => call("action", { action }),
            takeOverComputerTarget: (targetId: string) => call("takeover", { targetId }),
            resumeComputerTarget: (targetId: string, expectedGeneration: number) =>
                call("resume", { targetId, expectedGeneration }),
            startComputerTargetSession: (targetId: string, expectedGeneration: number) =>
                call("connect", { targetId, expectedGeneration }),
            readComputerTargetFrame: (sessionId: string) => call("frame", { sessionId }),
            stopComputerTargetSession: (sessionId: string) => call("disconnect", { sessionId }),
        });
    }
    (window as any).api = previewElectronApi;
}

export { installPreviewElectronApi, previewElectronApi };
