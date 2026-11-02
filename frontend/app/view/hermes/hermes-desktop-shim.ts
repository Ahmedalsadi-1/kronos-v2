import { installSubagentSurfaceSource } from "./subagent-surface-source";
import { createComputerToolWake } from "./computer-tool-wake";
import { OpenMausBotHermesBackend, onBotConversationFocus, parseBotSessionId } from "./openmausbot-hermes-backend";
// Copyright (c) 2026 KronTerm. Licensed under the Apache License, Version 2.0 (the "License").
// This shim implements `window.hermesDesktop` inside the KronTerm renderer so the
// vendored Hermes UI (frontend/hermes) can run as a widget without the Electron
// main-process bridge it was built against. REST calls cross the preload IPC boundary
// so loopback authentication never depends on renderer CORS. WS uses the token query
// param. Everything else is an honest
// "not supported" stub so the renderer never mistakes the shim for the real bridge.

import { acpAgentLogo } from "@/app/aipanel/acp-agent-logos";
import { resolveBlockView } from "@/app/block/retired-chat-view";
import { launchSystemApp, makeInstalledAppDescriptor, makeViewAppDescriptor } from "@/app/store/app-registry";
import { atoms, createBlock, getApi, setActiveTab } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { makeTabRouteId } from "@/app/store/wshrouter";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { publishWorkspacePresentation } from "@/app/tab/workspace-presentation";
import {
    focusAgentWidget,
    listAgentWidgets,
    promoteAgentWidget,
    setAgentWidgetInspectMode,
    snapshotAgentWidget,
    subscribeAgentWidgetDesignSelection,
} from "@/app/view/agent-widget-bridge";
import { subscribeHermesQuickSubmit } from "@/app/view/hermes/hermes-quick-submit";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { hermesToolActivityToAgentActivity, subscribeAgentTakeover } from "@/app/view/hermes/hermes-tool-activity";
import { KronosCodeHermesBackend } from "@/app/view/hermes/kronoscode-hermes-backend";
import { openSystemCenter } from "@/app/workspace/command-center-events";
import { hudLocationForMeta } from "@/app/workspace/hud-surface-location";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import * as WOS from "@/store/wos";
import { $hudSelectedSurfaceId, $hudSurfaceIslandsExpanded } from "@hermes/app/hud/surface-islands-model";
import type {
    DesktopActiveProfile,
    DesktopAgentRoster,
    DesktopCloudAgentSignInResult,
    DesktopCloudDiscoverResult,
    DesktopCloudStatus,
    DesktopConnectionConfig,
    DesktopConnectionConfigInput,
    DesktopConnectionProbeResult,
    DesktopConnectionTestResult,
    DesktopConnectionsRegistry,
    DesktopOauthLoginResult,
    DesktopOauthLogoutResult,
    DesktopRegistryConnection,
    DesktopRegistryConnectionInput,
    DesktopSshHostsResult,
    HermesApiRequest,
    HermesConnection,
    HermesKronTermSurface,
    HermesNotification,
    HermesPreviewWatch,
    HermesReadDirResult,
    HermesTerminalExit,
    HermesTerminalSession,
    HermesWindowState,
} from "@hermes/global";
import { desktopFsProfile } from "@hermes/lib/desktop-fs";
import { gatewayGit } from "@hermes/lib/desktop-git";
import type { WakeIndicatorState } from "@hermes/lib/wake-indicator";
import type { GatewayWsUrlResult } from "@hermes/shared";
import type { PetOverlayBounds, PetOverlayControl, PetOverlayStatePayload } from "@hermes/store/pet-overlay";
import type { QuickEntryStatePush, QuickEntrySubmitPayload } from "@hermes/store/quick-entry";

const DEFAULT_BASE_URL = "http://127.0.0.1:9119";

const STORAGE_BASE_URL = "kronterm.hermes.shim.baseUrl";
const LEGACY_STORAGE_TOKEN = "kronterm.hermes.shim.token";
const ShimStateKey = Symbol.for("kronterm.hermes.desktopShimState");

function isNativeHudSurface(): boolean {
    return new URLSearchParams(window.location.search).get("nativeSurface") === "hud";
}

export interface HermesDesktopShimConfig {
    baseUrl?: string;
    token?: string;
}

interface HermesDesktopShimConfigState {
    baseUrl: string;
    token: string;
}

function readStoredShimConfig(): HermesDesktopShimConfigState {
    const state: HermesDesktopShimConfigState = { baseUrl: DEFAULT_BASE_URL, token: "" };

    try {
        const baseUrl = window.localStorage.getItem(STORAGE_BASE_URL);

        if (baseUrl) {
            state.baseUrl = baseUrl;
        }
    } catch {
        // localStorage unavailable (e.g. privacy mode) — keep defaults
    }

    return state;
}

const shimStateHost = globalThis as typeof globalThis & { [ShimStateKey]?: HermesDesktopShimConfigState };
const shimState = (shimStateHost[ShimStateKey] ??= readStoredShimConfig());

function requireSessionToken(): string {
    if (!shimState.token) {
        throw new Error("Kronos connection is not ready. Reopen the widget or retry the connection.");
    }
    return shimState.token;
}

/** Point the shim at a gateway (idempotent). Returns the applied config. */
export function configureHermesDesktopShim(config?: HermesDesktopShimConfig): HermesDesktopShimConfigState {
    if (config) {
        if (typeof config.baseUrl === "string" && config.baseUrl.trim()) {
            shimState.baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
        }

        if (typeof config.token === "string") {
            shimState.token = config.token.trim();
        }
    }

    try {
        window.localStorage.setItem(STORAGE_BASE_URL, shimState.baseUrl);
        window.localStorage.removeItem(LEGACY_STORAGE_TOKEN);
    } catch {
        // localStorage unavailable — in-memory config is enough for this session
    }

    return { baseUrl: shimState.baseUrl, token: shimState.token };
}

export function buildGatewayWsUrl(baseUrl: string, token: string, profile?: null | string): string {
    const parsed = new URL(baseUrl);
    const wsScheme = parsed.protocol === "https:" ? "wss" : "ws";
    const prefix = parsed.pathname.replace(/\/+$/, "");
    const query = new URLSearchParams({ token });
    if (profile?.trim()) {
        query.set("profile", profile.trim());
    }
    return `${wsScheme}://${parsed.host}${prefix}/api/ws?${query.toString()}`;
}

export function buildProfileScopedApiUrl(baseUrl: string, requestPath: string, profile?: null | string): string {
    const url = new URL(requestPath.startsWith("/") ? requestPath : `/${requestPath}`, `${baseUrl}/`);
    if (profile?.trim()) {
        url.searchParams.set("profile", profile.trim());
    }
    return url.toString();
}

/** Mirror of the Electron main process fetchJson contract. */
async function apiFetch<T>(request: HermesApiRequest): Promise<T> {
    const botResponse = botBackend.apiRequest(request);
    if (botResponse) return botResponse as Promise<T>;
    requireSessionToken();
    return getApi().hermesApi<T>(request);
}

async function getConnection(profile?: null | string): Promise<HermesConnection> {
    const token = requireSessionToken();
    const isNamedProfile = typeof profile === "string" && profile.trim() !== "" && profile.trim() !== "default";
    const wsUrl = buildGatewayWsUrl(shimState.baseUrl, token, profile);

    return {
        baseUrl: shimState.baseUrl,
        isFullscreen: false,
        mode: "local",
        authMode: "token",
        source: "local",
        token,
        wsUrl,
        logs: [],
        nativeOverlayWidth: 0,
        windowButtonPosition: null,
        ...(isNamedProfile ? { profile: profile.trim(), sharedPrimary: true } : {}),
    };
}

async function getConnectionFor(payload: {
    connectionId?: null | string;
    profile?: null | string;
}): Promise<HermesConnection> {
    const connectionId = payload.connectionId ?? "";

    if (!connectionId || connectionId === "local") {
        return getConnection(payload.profile);
    }

    throw new Error(`No connection with id "${connectionId}"`);
}

async function getGatewayWsUrl(profile?: null | string): Promise<GatewayWsUrlResult> {
    const token = requireSessionToken();

    return { ok: true, wsUrl: buildGatewayWsUrl(shimState.baseUrl, token, profile) };
}

async function getGatewayWsUrlFor(payload: {
    connectionId?: null | string;
    profile?: null | string;
}): Promise<GatewayWsUrlResult> {
    const connectionId = payload.connectionId ?? "";

    if (!connectionId || connectionId === "local") {
        return getGatewayWsUrl(payload.profile);
    }

    return { ok: false, error: `No connection with id "${connectionId}"` };
}

async function getAgentRoster(): Promise<DesktopAgentRoster> {
    return { agents: [], sources: [] };
}

const EMPTY_REGISTRY: DesktopConnectionsRegistry = {
    version: 1,
    primary: "local",
    secureTokenStorage: true,
    connections: [],
};

function deriveRegistryConnection(input: DesktopRegistryConnectionInput): DesktopRegistryConnection {
    return {
        id: input.id || "local",
        kind: input.kind,
        label: input.label,
        url: input.url,
        authMode: input.authMode ?? "token",
        org: input.org,
        host: input.host,
        user: input.user,
        port: input.port ?? undefined,
        keyPath: input.keyPath,
        remoteHermesPath: input.remoteHermesPath,
        remoteProfile: input.remoteProfile,
        tokenSet: Boolean(input.token),
        tokenPreview: input.token ? input.token.slice(0, 4) : null,
    };
}

function localConnectionConfig(profile?: null | string): DesktopConnectionConfig {
    return {
        envOverride: false,
        mode: "local",
        profile: profile ?? null,
        remoteAuthMode: "token",
        remoteOauthConnected: false,
        remoteTokenPreview: null,
        remoteTokenSet: false,
        secureTokenStorage: true,
        remoteTokenPlainText: false,
        remoteUrl: "",
        cloudOrg: "",
        sshHost: "",
        sshUser: "",
        sshPort: null,
        sshKeyPath: "",
        sshRemoteHermesPath: "",
        sshRemoteProfile: "",
    };
}

function useOwnerHudRoute(): boolean {
    return isNativeHudSurface() || kronTermHudController.getSnapshot().active;
}

function ownerTabRoute(): string {
    const tabId = globalStore.get(atoms.staticTabId);
    if (!tabId) throw new Error("No KronTerm workspace tab is connected.");
    return makeTabRouteId(tabId);
}

export function workspaceSnapshotSurfaces(snapshot: unknown): HermesKronTermSurface[] {
    const blocks = (snapshot as { blocks?: unknown[] })?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks.flatMap((value): HermesKronTermSurface[] => {
        const block = value as {
            blockid?: string;
            view?: string;
            title?: string;
            focused?: boolean;
            active?: boolean;
            meta?: Record<string, unknown>;
            location?: string;
        };
        if (typeof block?.blockid !== "string" || resolveBlockView(block.view) === "hermes") return [];
        return [
            {
                id: block.blockid,
                view: typeof block.view === "string" ? block.view : "widget",
                title: typeof block.title === "string" ? block.title : "Widget",
                ...(block.location || hudLocationForMeta(block.meta ?? {}, block.blockid)
                    ? { location: block.location || hudLocationForMeta(block.meta ?? {}, block.blockid) }
                    : {}),
                focused: Boolean(block.focused),
                active: Boolean(block.active),
                surfaceKind: "widget",
            },
        ];
    });
}

async function listKronTermSurfaces(): Promise<HermesKronTermSurface[]> {
    const widgets = listAgentWidgets();
    if (!useOwnerHudRoute()) return widgets;
    const snapshot = await RpcApi.WorkspaceSurfaceSnapshotCommand(TabRpcClient, { route: ownerTabRoute() });
    return workspaceSnapshotSurfaces(JSON.parse(snapshot)).map((surface) => {
        const local = widgets.find((widget) => widget.id === surface.id);
        return local ? { ...local, focused: surface.focused } : surface;
    });
}

async function openHudKronTermSurface(blockId: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const response = JSON.parse(
            await RpcApi.WorkspaceSurfaceControlCommand(
                TabRpcClient,
                { action: "hud.open", blockid: blockId },
                { route: ownerTabRoute() }
            )
        );
        return { ok: response.success === true, ...(response.error ? { error: String(response.error) } : {}) };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Could not open the workspace widget." };
    }
}

async function focusKronTermSurface(blockId: string): Promise<{ ok: boolean; error?: string }> {
    return useOwnerHudRoute() ? openHudKronTermSurface(blockId) : focusAgentWidget(blockId);
}

async function promoteKronTermSurface(blockId: string): Promise<{ ok: boolean; error?: string }> {
    return useOwnerHudRoute() ? openHudKronTermSurface(blockId) : promoteAgentWidget(blockId);
}

async function previewKronTermSurface(blockId: string): Promise<string> {
    if (!useOwnerHudRoute()) {
        if (!listAgentWidgets().some((surface) => surface.id === blockId)) throw new Error("widget-not-in-current-tab");
        return RpcApi.CaptureBlockScreenshotCommand(TabRpcClient, { blockid: blockId, passive: true }, { timeout: 5000 });
    }
    const surfaces = await listKronTermSurfaces();
    if (!surfaces.some((surface) => surface.id === blockId)) throw new Error("widget-not-in-current-tab");
    return RpcApi.CaptureBlockScreenshotCommand(
        TabRpcClient,
        { blockid: blockId, passive: true },
        { route: ownerTabRoute(), timeout: 5000 }
    );
}

// One per renderer: ACP events are delivered only to the webContents that started the session.
const botBackend = new OpenMausBotHermesBackend();
const kronosCodeBackend = new KronosCodeHermesBackend(() => {
    try {
        return getApi();
    } catch {
        return undefined;
    }
});

const wakeComputerForTool = createComputerToolWake(async (desktopId) => {
    const access = await getApi().sandboxComputerAccess();
    const result = await shim.krontermSurfaces.openMachines("desktop", false, access.desktopId || desktopId);
    if (!result.ok) throw new Error(result.error);
    window.dispatchEvent(new Event("kronterm:computer-wake"));
});

const shim: Window["hermesDesktop"] = {
    getConnection,
    getConnectionFor,
    getGatewayWsUrl,
    getGatewayWsUrlFor,
    getAgentRoster,
    krontermSurfaces: {
        computerManager: {
            list: async () => {
                const result = await getApi().manageComputerPlugins({ action: "list" });
                if (result.success === false) throw new Error(result.error.message);
                return result.data;
            },
            manage: async (command) => {
                const result = await getApi().manageComputerPlugins(command);
                if (result.success === false) throw new Error(result.error.message);
                return result.data;
            },
            desktops: async () => {
                const result = await getApi().listLinuxDesktops();
                if (result.success === false) throw new Error(result.error.message);
                return result.data;
            },
            action: async (action) => {
                const result = await getApi().performLinuxDesktopAction(action);
                if (result.success === false) throw new Error(result.error.message);
                return result.data;
            },
            access: (input) => getApi().sandboxComputerAccess(input),
        },
        list: listKronTermSurfaces,
        toggleChatLayout: () => getApi().syncNativeNotch({ chatLayout: "toggle" }),
        openMachines: async (kind = "desktop", settings = false, desktopId?: string) => {
            try {
                const surfaces = await listKronTermSurfaces();
                const running = surfaces
                    .filter((surface) => {
                        const block = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", surface.id)));
                        if (desktopId && block?.meta?.["machine:target"] !== desktopId) return false;
                        return (
                            (surface.view === "linux-vms" && (block?.meta?.["machine:kind"] ?? "desktop") === kind) ||
                            (kind === "desktop" && surface.view === "sandbox")
                        );
                    })
                    .map((surface) => surface.id);
                await launchSystemApp(makeViewAppDescriptor("linux-vms", running), {
                    focusBlock: async (blockId) => {
                        const result = await focusKronTermSurface(blockId);
                        if (settings)
                            window.dispatchEvent(new CustomEvent("kronterm:machine-settings", { detail: { blockId } }));
                        if (!result.ok) throw new Error(result.error || "Could not focus the machine launcher.");
                    },
                    createView: async () => {
                        if (useOwnerHudRoute()) {
                            const response = JSON.parse(
                                await RpcApi.WorkspaceSurfaceControlCommand(
                                    TabRpcClient,
                                    {
                                        action: "hud.launch",
                                        view: "machines",
                                        text: JSON.stringify({
                                            machineKind: kind,
                                            machineSettings: settings,
                                            machineTarget: desktopId,
                                        }),
                                    },
                                    { route: ownerTabRoute() }
                                )
                            );
                            if (!response.success)
                                throw new Error(response.error || "Could not open the machine launcher.");
                            return;
                        }
                        await createBlock({
                            meta: {
                                view: "linux-vms",
                                "machine:kind": kind,
                                "machine:settings": settings,
                                "machine:target": desktopId,
                            } as MetaType,
                        });
                    },
                    createAppStream: async () => {
                        throw new Error("Unsupported machine launcher target.");
                    },
                });
                return { ok: true };
            } catch (failure) {
                return {
                    ok: false,
                    error: failure instanceof Error ? failure.message : "Could not open the machine launcher.",
                };
            }
        },
        launchWorkspace: async (action) => {
            if (["widgets", "tabs", "canvas", "os"].includes(action)) {
                publishWorkspacePresentation(action as "widgets" | "tabs" | "canvas" | "os");
                await RpcApi.SetConfigCommand(TabRpcClient, { "app:layoutmode": action });
                return;
            }
            if (action === "activity" || action === "control") {
                openSystemCenter(action);
                return;
            }
            const views = {
                terminal: "term",
                browser: "web",
                files: "preview",
                connections: "waveconfig",
                scratchpad: "term",
            };
            await createBlock(
                {
                    meta: {
                        view: views[action],
                        ...(action === "files" ? { file: "~" } : {}),
                        ...(action === "terminal" || action === "scratchpad" ? { controller: "shell" } : {}),
                    },
                },
                false,
                action === "scratchpad"
            );
        },
        launchApp: async (id) => {
            const app = (await RpcApi.ListInstalledAppsCommand(TabRpcClient)).find(
                (item) => (item.bundleid || item.appid) === id
            );
            if (!app) throw new Error("The selected application is unavailable.");
            const streams = (await listKronTermSurfaces()).filter((surface) => {
                if (surface.view !== "appstream") return false;
                const block = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", surface.id)));
                return block?.meta?.["appstream:appid"] === id;
            });
            const descriptor = {
                ...makeInstalledAppDescriptor(app),
                runningBlockIds: streams.map((surface) => surface.id),
            };
            await launchSystemApp(descriptor, {
                focusBlock: async (blockId) => {
                    await focusKronTermSurface(blockId);
                },
                createView: async () => {},
                createAppStream: async (appId, appName) => {
                    await createBlock({
                        meta: { view: "appstream", "appstream:appid": appId, "appstream:appname": appName } as MetaType,
                    });
                },
            });
        },
        spaces: async () => {
            const workspace = globalStore.get(atoms.workspace);
            return (workspace?.tabids ?? []).map((id, index) => ({ id, name: `Space ${index + 1}` }));
        },
        openSpace: async (id) => {
            const workspace = globalStore.get(atoms.workspace);
            if (!(workspace?.tabids ?? []).includes(id)) throw new Error("Workspace space is unavailable.");
            setActiveTab(id);
        },
        searchResources: async (query) => getApi().searchSystemItems(query.slice(0, 200)),
        openResource: async (path) => {
            await createBlock({ meta: { view: "preview", file: path } });
        },
        apps: async () =>
            (await RpcApi.ListInstalledAppsCommand(TabRpcClient)).map((app) => ({
                id: app.bundleid || app.appid,
                name: app.name,
            })),
        targetApp: async (id) => {
            const app = (await RpcApi.ListInstalledAppsCommand(TabRpcClient)).find(
                (app) => (app.bundleid || app.appid) === id
            );
            if (!app) throw new Error("The selected app is unavailable");
            await shim.krontermSurfaces.launchApp(id);
        },
        focus: focusKronTermSurface,
        openSplit: focusKronTermSurface,
        promote: promoteKronTermSurface,
        preview: previewKronTermSurface,
        select: (blockId, expanded) => getApi().selectNativeHudWidget(blockId, expanded),
        onDisplay: (listener) =>
            getApi().onNativeHudSelectWidget?.(({ blockId, expanded }) => {
                $hudSelectedSurfaceId.set(blockId);
                $hudSurfaceIslandsExpanded.set(expanded);
                listener({ blockId, expanded });
            }),
        control: async (blockId, input) => {
            const surfaces = await listKronTermSurfaces();
            if (!surfaces.some((surface) => surface.id === blockId)) throw new Error("widget-not-in-current-tab");
            const opts = { route: await getApi().getHudWidgetRoute(blockId), timeout: 5000 };
            const state =
                input.action === "click" || input.action === "scroll"
                    ? await RpcApi.WidgetGetStateCommand(TabRpcClient, { blockid: blockId }, opts)
                    : undefined;
            const x = input.x == null ? undefined : input.x * state.width;
            const y = input.y == null ? undefined : input.y * state.height;
            const result =
                input.action === "click"
                    ? await RpcApi.WidgetMouseClickCommand(
                          TabRpcClient,
                          { blockid: blockId, x, y, button: "left", clickcount: 1 },
                          opts
                      )
                    : input.action === "scroll"
                      ? await RpcApi.WidgetMouseScrollCommand(
                            TabRpcClient,
                            { blockid: blockId, amount: input.amount, originx: x, originy: y },
                            opts
                        )
                      : input.action === "type"
                        ? await RpcApi.WidgetKeyboardTypeCommand(
                              TabRpcClient,
                              { blockid: blockId, text: input.text, delayms: 0 },
                              opts
                          )
                        : await RpcApi.WidgetKeyboardPressCommand(
                              TabRpcClient,
                              { blockid: blockId, keys: input.keys },
                              opts
                          );
            if (!result.success) throw new Error(result.message || "Widget input failed");
        },
        snapshot: async (blockId) => {
            if (!useOwnerHudRoute()) return snapshotAgentWidget(blockId);
            const surfaces = await listKronTermSurfaces();
            if (!surfaces.some((surface) => surface.id === blockId)) throw new Error("widget-not-in-current-tab");
            const opts = { route: await getApi().getHudWidgetRoute(blockId), timeout: 5000 };
            const [snapshot, state] = await Promise.all([
                RpcApi.WidgetSnapshotCommand(TabRpcClient, { blockid: blockId }, opts),
                RpcApi.WidgetGetStateCommand(TabRpcClient, { blockid: blockId }, opts),
            ]);
            return {
                blockId,
                width: state.width,
                height: state.height,
                timestamp: snapshot.timestamp,
                elements: snapshot.elements.map((element) => ({
                    ...element,
                    name: element.name ?? "",
                    role: element.role ?? "",
                })),
            };
        },
        inspect: async (blockId, enabled) => setAgentWidgetInspectMode(blockId, enabled),
        onSelection: subscribeAgentWidgetDesignSelection,
    },
    readWindowBelow: async () => ({
        frontmost: null,
        window: null,
        platform: getApi().getPlatform(),
        note: "Native window enumeration is unavailable in KronTerm. Use workspace_snapshot to inspect open widgets, browser_get_html for browser content, or widget_snapshot for an accessible widget snapshot.",
    }),
    krontermActivity: {
        report: (activity) => {
            wakeComputerForTool(activity);
            const event = hermesToolActivityToAgentActivity(activity);
            if (event == null) {
                return;
            }
            try {
                getApi().publishAgentSurfaceActivity(event as unknown as Record<string, unknown>);
            } catch (error) {
                console.warn("[hermes] activity publish failed", error);
            }
        },
        onTakeover: subscribeAgentTakeover,
    },
    agentBackends: {
        list: async () =>
            (await kronosCodeBackend.list()).map((engine) => ({ ...engine, logo: acpAgentLogo(engine.id) })),
        getSessionBackend: (sessionId) =>
            parseBotSessionId(sessionId) ? "openmausbot" : kronosCodeBackend.getSessionBackend(sessionId),
        getActive: () => kronosCodeBackend.getActive(),
        setActive: (id) => kronosCodeBackend.setActive(id),
        onActiveChange: (listener) => kronosCodeBackend.onActiveChange(listener),
        route: (method, params) => botBackend.route(method, params) ?? kronosCodeBackend.route(method, params),
        onEvent: (listener) => {
            const bot = botBackend.onEvent(listener);
            const acp = kronosCodeBackend.onEvent(listener);
            return () => {
                bot();
                acp();
            };
        },
    },
    revalidateConnection: async () => ({ ok: true, rebuilt: false }),
    touchBackend: async () => ({ ok: true }),
    claimAmbientCue: async () => true,
    openSessionWindow: async () => ({ ok: false, error: "not-supported" }),
    openSessionInTerminal: async () => ({ ok: false, error: "not-supported" }),
    openWindow: async () => ({ ok: false, error: "not-supported" }),

    hud: {
        open: async (request) => {
            hermesSurfaceController.requestOpenHud(request?.sessionId);
            return { ok: true };
        },
        close: async () => {
            if (isNativeHudSurface()) {
                getApi().requestNativeHudExit();
                return { ok: true };
            }
            try {
                await hermesSurfaceController.expandToWidget();
                return { ok: true };
            } catch {
                return { ok: false };
            }
        },
        dock: async () => {
            kronTermHudController.setActive(false);
            hermesSurfaceController.requestOpenPanel();
            return { ok: true };
        },
        expand: async () => {
            try {
                await hermesSurfaceController.expandToWidget();
                return { ok: true };
            } catch {
                return { ok: false };
            }
        },
        dismiss: async () => {
            if (isNativeHudSurface()) {
                getApi().requestNativeHudExit();
                return { ok: true };
            }
            hermesSurfaceController.dismiss();
            return { ok: true };
        },
        setIgnoreMouse: (ignore: boolean) => getApi().setWindowIgnoreMouse(ignore),
        moveBy: (delta) => {
            if (isNativeHudSurface()) {
                getApi().moveNativeHudBy(delta);
                return;
            }
            hermesSurfaceController.moveBy(delta);
        },
        setBounds: (bounds) => hermesSurfaceController.setGeometry(bounds),
        setVibrancy: async (_on: boolean) => ({ ok: true }),
        setSession: (sessionId) => hermesSurfaceController.setSession(sessionId),
        onGoto: (_callback) => () => undefined,
        onChanged: (callback) => {
            const publish = () => {
                const state = hermesSurfaceController.getSnapshot();
                callback({
                    open: state.presentation === "hud",
                    sessionId: state.sessionId,
                });
            };
            publish();
            return hermesSurfaceController.subscribe(publish);
        },
        onCursor: (_callback) => () => undefined,
    },

    wakeIndicator: {
        getState: async () => "hidden" as WakeIndicatorState,
        setState: () => undefined,
        onState: () => () => undefined,
    },

    petOverlay: {
        open: async () => ({ ok: false }),
        close: async () => ({ ok: true }),
        setBounds: (_bounds: PetOverlayBounds) => undefined,
        setIgnoreMouse: (_ignore: boolean) => undefined,
        setFocusable: (_focusable: boolean) => undefined,
        pushState: (_payload: PetOverlayStatePayload) => undefined,
        control: (_payload: PetOverlayControl) => undefined,
        onState: () => () => undefined,
        onControl: () => () => undefined,
    },

    quickEntry: {
        getSettings: async () => ({
            enabled: false,
            error: null,
            registered: false,
            shortcut: "CommandOrControl+Shift+Space",
        }),
        setSettings: async () => ({
            enabled: false,
            error: null,
            registered: false,
            shortcut: "CommandOrControl+Shift+Space",
        }),
        submit: (_payload: QuickEntrySubmitPayload) => undefined,
        dismiss: () => undefined,
        pushState: (_payload: QuickEntryStatePush) => undefined,
        onState: () => () => undefined,
        onSubmit: (callback) => subscribeHermesQuickSubmit(callback),
        onShown: () => () => undefined,
    },

    getBootProgress: async () => ({
        error: null,
        fakeMode: false,
        message: "",
        phase: "complete",
        progress: 100,
        running: false,
        timestamp: Date.now(),
    }),

    getConnectionConfig: (profile?: null | string) => Promise.resolve(localConnectionConfig(profile)),
    saveConnectionConfig: (payload: DesktopConnectionConfigInput) =>
        Promise.resolve(localConnectionConfig(payload.profile ?? null)),
    applyConnectionConfig: (payload: DesktopConnectionConfigInput) =>
        Promise.resolve(localConnectionConfig(payload.profile ?? null)),
    testConnectionConfig: async (payload: DesktopConnectionConfigInput) =>
        payload.mode === "local"
            ? { ok: true, reachable: true, version: null, baseUrl: shimState.baseUrl }
            : { ok: false, reachable: false, version: null, error: "not-supported", baseUrl: payload.remoteUrl },

    connections: {
        list: async () => ({ ...EMPTY_REGISTRY }),
        save: async (payload: DesktopRegistryConnectionInput) => ({
            ok: false,
            connection: deriveRegistryConnection(payload),
            registry: { ...EMPTY_REGISTRY },
        }),
        remove: async (id: string) => ({ ok: false, registry: { ...EMPTY_REGISTRY }, ...(id === "local" ? {} : {}) }),
        setPrimary: async (id: string) => ({ ok: id === "local", registry: { ...EMPTY_REGISTRY } }),
        test: async (id: string): Promise<DesktopConnectionTestResult> =>
            id === "local"
                ? { ok: true, reachable: true, version: null, baseUrl: shimState.baseUrl }
                : { ok: false, reachable: false, version: null, error: "not-supported", baseUrl: shimState.baseUrl },
    },

    sshConfigHosts: async () => ({ hosts: [] }) as DesktopSshHostsResult,
    sshResolveHost: async () => ({ hostname: null, identityFile: null, port: null, user: null }),
    probeConnectionConfig: async (remoteUrl: string): Promise<DesktopConnectionProbeResult> => ({
        baseUrl: remoteUrl,
        reachable: false,
        authMode: "unknown",
        providers: [],
        version: null,
        error: "not-supported",
    }),
    oauthLoginConnectionConfig: async (remoteUrl: string): Promise<DesktopOauthLoginResult> => ({
        ok: false,
        baseUrl: remoteUrl,
        connected: false,
    }),
    oauthLogoutConnectionConfig: async (): Promise<DesktopOauthLogoutResult> => ({ ok: false, connected: false }),

    cloud: {
        status: async (): Promise<DesktopCloudStatus> => ({ portalBaseUrl: "", signedIn: false }),
        login: async () => ({ ok: false, portalBaseUrl: "", signedIn: false }),
        logout: async () => ({ ok: false, portalBaseUrl: "", signedIn: false }),
        discover: async (): Promise<DesktopCloudDiscoverResult> => ({
            agents: [],
            org: null,
            needsOrgSelection: false,
        }),
        agentSignIn: async (dashboardUrl: string): Promise<DesktopCloudAgentSignInResult> => ({
            baseUrl: dashboardUrl,
            connected: false,
        }),
    },

    profile: {
        get: async (): Promise<DesktopActiveProfile> => {
            const profile = await apiFetch<{ active?: string; current?: string }>({ path: "/api/profiles/active" });
            return { profile: profile.active || profile.current || null };
        },
        set: async (name: string | null): Promise<DesktopActiveProfile> => {
            const target = name?.trim() || "default";
            const profile = await apiFetch<{ active?: string }>({
                path: "/api/profiles/active",
                method: "POST",
                body: { name: target },
            });
            return { profile: profile.active || target };
        },
    },

    api: apiFetch,

    notify: async (payload: HermesNotification): Promise<boolean> => {
        try {
            if (typeof Notification === "undefined") {
                return false;
            }

            if (Notification.permission === "denied") {
                return false;
            }

            if (Notification.permission === "default") {
                const granted = await Notification.requestPermission();

                if (granted !== "granted") {
                    return false;
                }
            }

            const title = payload.title || "Kronos";

            if (typeof payload.body === "string" && payload.body) {
                new Notification(title, { body: payload.body });
            } else {
                new Notification(title);
            }

            return true;
        } catch {
            return false;
        }
    },

    requestMicrophoneAccess: async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            stream.getTracks().forEach((track) => track.stop());

            return true;
        } catch {
            return false;
        }
    },

    selectPaths: async (options) => {
        const api = getApi();
        if (options?.directories) {
            if (!api?.selectDirectory) throw new Error("Folder selection is unavailable in this window");
            const path = await api.selectDirectory();
            return path ? [path] : [];
        }
        if (!api?.selectFiles) throw new Error("File selection is unavailable in this window");
        const paths = await api.selectFiles();
        return options?.multiple ? paths : paths.slice(0, 1);
    },
    writeClipboard: async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);

            return true;
        } catch {
            return false;
        }
    },
    readClipboard: async () => {
        try {
            return await navigator.clipboard.readText();
        } catch {
            return "";
        }
    },
    saveImageFromUrl: async () => false,
    saveImageBuffer: async () => "",
    saveClipboardImage: async () => "",
    getPathForFile: (file: File) => {
        const webUtils = (window as unknown as { webUtils?: { getPathForFile?: (f: File) => string } }).webUtils;

        return webUtils?.getPathForFile?.(file) ?? file.name;
    },
    normalizePreviewTarget: async () => null,
    watchPreviewFile: async (url: string): Promise<HermesPreviewWatch> => ({ id: crypto.randomUUID(), path: url }),
    stopPreviewFileWatch: async () => true,

    openExternal: async (url: string): Promise<void> => {
        window.open(url, "_blank", "noopener");
    },
    openPreviewInBrowser: async (url: string): Promise<void> => {
        getApi().openExternal(url);
    },
    fetchLinkTitle: async (url: string): Promise<string> => {
        try {
            const res = await fetch(url, { method: "GET" });
            const text = await res.text();
            const match = /<title[^>]*>([^<]+)<\/title>/i.exec(text);

            return match?.[1]?.trim() ?? "";
        } catch {
            return "";
        }
    },
    sanitizeWorkspaceCwd: async (cwd?: null | string) => ({ cwd: cwd ?? "", sanitized: false }),

    settings: {
        getDefaultProjectDir: async () => ({ defaultLabel: "Default", dir: null, resolvedCwd: "" }),
        pickDefaultProjectDir: async () => ({ canceled: true, dir: null }),
        setDefaultProjectDir: async (dir: null | string) => ({ dir }),
    },

    revealLogs: async () => ({ ok: false, path: "", error: "not-supported" }),
    getRecentLogs: async () => ({ path: "", lines: [] }),
    reportRendererError: (report: { label: string; boundary: string; message: string; componentStack: string }) => {
        console.warn(`[hermes-shim] renderer error boundary ${report.boundary}: ${report.message}`);
    },
    readDir: (path: string): Promise<HermesReadDirResult> =>
        apiFetch({
            path: `/api/fs/list?path=${encodeURIComponent(path)}`,
            profile: desktopFsProfile(),
        }),
    gitRoot: async (path: string) =>
        (
            await apiFetch<{ root: string }>({
                path: `/api/fs/git-root?path=${encodeURIComponent(path)}`,
                profile: desktopFsProfile(),
            })
        ).root,
    readFileText: (path: string) =>
        apiFetch({
            path: `/api/fs/read-text?path=${encodeURIComponent(path)}`,
            profile: desktopFsProfile(),
        }),
    readFileDataUrl: async (path: string) => {
        const result = await apiFetch<string | { dataUrl?: string }>({
            path: `/api/fs/read-data-url?path=${encodeURIComponent(path)}`,
            profile: desktopFsProfile(),
        });
        return typeof result === "string" ? result : result.dataUrl || "";
    },
    git: gatewayGit,

    terminal: {
        cwd: async () => null,
        dispose: async () => false,
        onData: () => () => undefined,
        onExit: () => () => undefined,
        resize: async () => false,
        start: async (): Promise<HermesTerminalSession> => {
            throw new Error("Terminal sessions are not supported by the Hermes shim");
        },
        write: async () => false,
    },

    onClosePreviewRequested: () => () => undefined,
    onOpenFolderRequested: () => () => undefined,
    onOpenUpdatesRequested: () => () => undefined,
    onDeepLink: () => () => undefined,
    signalDeepLinkReady: async () => ({ ok: true }),
    onWindowStateChanged: (_callback: (payload: HermesWindowState) => void) => () => undefined,
    onFocusSession: (listener) => onBotConversationFocus(listener),
    onNotificationAction: () => () => undefined,
    onPreviewFileChanged: () => () => undefined,
    onBackendExit: (_callback: (payload: HermesTerminalExit) => void) => () => undefined,
    onConnectionApplied: () => () => undefined,
    onPowerResume: () => () => undefined,
    getOnBattery: async () => false,
    onBatteryChanged: () => () => undefined,
    onBootProgress: () => () => undefined,

    getBootstrapState: async () => ({
        active: false,
        manifest: null,
        stages: {},
        error: null,
        log: [],
        startedAt: null,
        completedAt: null,
        setupChoice: null,
        unsupportedPlatform: null,
    }),
    continueBootstrapLocal: async () => ({ ok: false }),
    resetBootstrap: async () => ({ ok: false }),
    repairBootstrap: async () => ({ ok: false }),
    cancelBootstrap: async () => ({ ok: false, cancelled: false }),
    onBootstrapEvent: () => () => undefined,

    getVersion: async () => ({
        appVersion: "kronterm-hermes",
        electronVersion: "",
        nodeVersion: "",
        platform: typeof navigator !== "undefined" ? navigator.platform : "",
        hermesRoot: "",
    }),

    updates: {
        check: async () => ({ supported: false }),
        apply: async () => ({ ok: false, error: "not-supported" }),
        getBranch: async () => ({ branch: "stable" }),
        setBranch: async (branch: string) => ({ branch }),
        onProgress: () => () => undefined,
    },

    uninstall: {
        summary: async () => ({
            hermes_home: "",
            agent_installed: false,
            gui_installed: false,
            source_built_artifacts: [],
            packaged_app_paths: [],
            userdata_dir: "",
            userdata_exists: false,
            platform: typeof navigator !== "undefined" ? navigator.platform : "",
        }),
        run: async () => ({ ok: false, error: "not-supported" }),
    },

    themes: {
        fetchMarketplace: async () => {
            throw new Error("Theme marketplace is not supported by the Hermes shim");
        },
        searchMarketplace: async () => [],
    },

    findInPage: async () => ({ count: 0 }),
    stopFindInPage: async () => undefined,
    onFoundInPage: () => () => undefined,
    onOpenFindBarRequested: () => () => undefined,
};

/** Installs the Hermes desktop bridge shim (idempotent). */
export function installHermesDesktopShim(config?: HermesDesktopShimConfig): void {
    configureHermesDesktopShim(config);
    installSubagentSurfaceSource(previewKronTermSurface);

    if (!window.hermesDesktop) {
        window.hermesDesktop = shim;
    }
}

/** Replaces the Hermes desktop bridge shim regardless of prior install. */
export function replaceHermesDesktopShim(config?: HermesDesktopShimConfig): void {
    configureHermesDesktopShim(config);
    window.hermesDesktop = shim;
}
