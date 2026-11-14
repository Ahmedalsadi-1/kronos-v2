import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AgentChat } from "./components/agent-chat";
import { FocusedSurface } from "./components/focused-surface";
import { HostSheet, type ConnectHostInput } from "./components/host-sheet";
import { LocalAgent } from "./components/local-agent";
import { LocalLinuxPanel } from "./components/local-linux-panel";
import { LocalTools } from "./components/local-tools";
import { MobileWorkspace } from "./components/mobile-workspace";
import type { SurfaceWidget } from "./components/surface-browser";
import { ToastStack } from "./components/toast-stack";
import { resultHaptic, selectionHaptic, tapHaptic } from "./lib/haptics";
import { loadHosts, makeHostProfile, saveHosts } from "./lib/host-store";
import type { RoutedAgentObjective, RuntimeTarget } from "./lib/kron-local-workspace";
import { KronosHostClient, normalizeHostUrl } from "./lib/kronos-client";
import { localLinux } from "./lib/local-linux";
import { shouldStartLocalLinux } from "./lib/local-linux-protocol";
import { gatewayReconnectDelay, transitionMobileLifecycle } from "./lib/mobile-lifecycle";
import {
    endNativeWorkspace,
    listenWorkspaceNotifications,
    parseWorkspaceDeepLink,
    requestWorkspaceNotifications,
    updateNativeWorkspace,
    type NativeWorkspaceSurface,
} from "./lib/native-workspace";
import { parsePairingLink } from "./lib/pairing-link";
import { phoneWidgetSurfaces } from "./lib/phone-widget-surfaces";
import { buildSurfaces, findPreferredSurface, makePreviewDataUrl } from "./lib/surface-model";
import type {
    BrowserRuntimeState,
    ClosedSurface,
    HostProfile,
    HostRuntimeState,
    HostSnapshot,
    KronosSession,
    PhoneContext,
    Surface,
    SurfaceControlMode,
    TerminalStreamEvent,
    ToastMessage,
} from "./types";

const UrlPattern = /^(?:https?:\/\/|localhost(?::\d+)?(?:\/|$)|(?:[\w-]+\.)+[a-z]{2,}(?:[/:?#]|$))/i;
const ControlLeaseDuration = 2 * 60 * 1_000;

const errorMessage = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

const phoneLogicalSize = (context: PhoneContext): { width: number; height: number } => {
    const frames = [...(context.tree ?? "").matchAll(/\{\{[-\d.]+,\s*[-\d.]+\},\s*\{([\d.]+),\s*([\d.]+)\}\}/g)]
        .map((match) => ({ width: Number(match[1]), height: Number(match[2]) }))
        .filter((frame) => frame.width > 0 && frame.height > 0);
    return (
        frames.sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? {
            width: context.metadata?.width ?? 393,
            height: context.metadata?.height ?? 852,
        }
    );
};

const emptyRuntime = (profile: HostProfile): HostRuntimeState => ({
    profile,
    connection: "idle",
    detail: "Not checked yet",
});

export const App = () => {
    const [profiles, setProfiles] = useState<HostProfile[]>([]);
    const authorizedHosts = useRef(new Set<string>());
    const [pairingUrl, setPairingUrl] = useState("");
    const [hostStates, setHostStates] = useState<Record<string, HostRuntimeState>>({});
    const [snapshots, setSnapshots] = useState<Record<string, HostSnapshot>>({});
    const [runtimeSurfaces, setRuntimeSurfaces] = useState<Surface[]>([]);
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [hiddenSurfaceIds, setHiddenSurfaceIds] = useState<Set<string>>(new Set());
    const [closedSurfaces, setClosedSurfaces] = useState<ClosedSurface[]>([]);
    const [selectedHostId, setSelectedHostId] = useState("all");
    const [hostsLoaded, setHostsLoaded] = useState(false);
    const [hostsOpen, setHostsOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(true);
    const [localToolsOpen, setLocalToolsOpen] = useState(false);
    const [localLinuxOpen, setLocalLinuxOpen] = useState(false);
    const [localLinuxTab, setLocalLinuxTab] = useState("terminal");
    const [localBrowserPageId, setLocalBrowserPageId] = useState<string>();
    const [lastUsedSurfaceId, setLastUsedSurfaceId] = useState<string>();
    const [localResumeRequest, setLocalResumeRequest] = useState<{ id: string; text: string }>();
    const phoneSurfaces = useSyncExternalStore(phoneWidgetSurfaces.subscribe, phoneWidgetSurfaces.getSnapshot);
    const linuxState = useSyncExternalStore(localLinux.subscribe, localLinux.getSnapshot);
    const [focusedSurface, setFocusedSurface] = useState<Surface>();
    const [controlMode, setControlMode] = useState<SurfaceControlMode>("watch");
    const [leaseEndsAt, setLeaseEndsAt] = useState<number>();
    const [refreshing, setRefreshing] = useState(false);
    const [surfaceLoading, setSurfaceLoading] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [chatHostId, setChatHostId] = useState<string>();
    const [chatSession, setChatSession] = useState<KronosSession>();
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [lifecycleActive, setLifecycleActive] = useState(() => document.visibilityState !== "hidden");
    const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
    const [pendingNativeLink, setPendingNativeLink] = useState<ReturnType<typeof parseWorkspaceDeepLink>>(null);
    const nativeStatusRef = useRef(new Map<string, string>());
    const nativeTaskRef = useRef<string | undefined>(undefined);
    const snapshotsRef = useRef(snapshots);
    snapshotsRef.current = snapshots;
    const clientsRef = useRef(new Map<string, KronosHostClient>());
    const eventRefreshTimersRef = useRef(new Map<string, number>());
    const lifecycleActiveRef = useRef(lifecycleActive);
    const refreshAllPromiseRef = useRef<Promise<void> | null>(null);
    const phoneContextsRef = useRef<Record<string, PhoneContext>>({});
    const phoneTapPointsRef = useRef<Record<string, [number, number]>>({});

    const pushToast = useCallback((tone: ToastMessage["tone"], title: string, detail?: string) => {
        const id = crypto.randomUUID();
        setToasts((current) => [...current.slice(-2), { id, tone, title, detail }]);
        window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5_000);
    }, []);

    const clientFor = useCallback((profile: HostProfile): KronosHostClient => {
        const existing = clientsRef.current.get(profile.id);
        if (
            existing &&
            existing.host.baseUrl === normalizeHostUrl(profile.baseUrl) &&
            existing.host.token === profile.token
        ) {
            return existing;
        }
        existing?.close();
        const client = new KronosHostClient(profile);
        clientsRef.current.set(profile.id, client);
        return client;
    }, []);

    const clearEventRefreshTimers = useCallback(() => {
        for (const timer of eventRefreshTimersRef.current.values()) {
            window.clearTimeout(timer);
        }
        eventRefreshTimersRef.current.clear();
    }, []);

    const applyLifecycleState = useCallback(
        (active: boolean) => {
            const transition = transitionMobileLifecycle(lifecycleActiveRef.current, active);
            lifecycleActiveRef.current = transition.active;
            if (transition.action === "none") {
                return;
            }
            if (transition.action === "pause") {
                clearEventRefreshTimers();
                for (const client of clientsRef.current.values()) {
                    client.close();
                }
            }
            setLifecycleActive(transition.active);
        },
        [clearEventRefreshTimers]
    );

    const refreshHost = useCallback(
        async (
            profile: HostProfile,
            initialHealth?: Awaited<ReturnType<KronosHostClient["health"]>>
        ): Promise<HostSnapshot | null> => {
            if (!authorizedHosts.current.has(profile.id)) return null;
            const client = clientFor(profile);
            setHostStates((current) =>
                current[profile.id]?.lastCheckedAt
                    ? current
                    : {
                          ...current,
                          [profile.id]: { profile, connection: "connecting", detail: "Checking host compatibility…" },
                      }
            );
            try {
                const health = initialHealth ?? (await client.health());
                const agentUnavailable = health.connected === false || health.ready === false;
                const [sessionList, statuses, sandboxes, phoneControl] = await Promise.all([
                    agentUnavailable ? null : client.listSessions().catch(() => null),
                    client.getSessionStatuses().catch(() => snapshotsRef.current[profile.id]?.statuses ?? {}),
                    client.listSandboxes().catch(() => snapshotsRef.current[profile.id]?.sandboxes ?? []),
                    health.phoneControl?.available
                        ? Promise.resolve(health.phoneControl)
                        : client.getPhoneStatus().catch(() => health.phoneControl),
                ]);
                const sessions = sessionList ?? snapshotsRef.current[profile.id]?.sessions ?? [];
                const browserStates = (
                    await Promise.all(
                        sessions
                            .slice(0, 16)
                            .map((session) =>
                                client
                                    .getBrowserState(session.id)
                                    .catch(
                                        () =>
                                            snapshotsRef.current[profile.id]?.browserStates.find(
                                                (state) => state.sessionID === session.id
                                            ) ?? null
                                    )
                            )
                    )
                ).filter((state): state is BrowserRuntimeState => Boolean(state?.enabled));
                const degraded = sessionList == null;
                const capabilities = Array.isArray(health.capabilities) ? health.capabilities : profile.capabilities;
                const runtime: HostRuntimeState = {
                    profile: {
                        ...profile,
                        capabilities: degraded
                            ? capabilities.filter((capability) => capability !== "kronoscode")
                            : capabilities,
                        lastConnectedAt: Date.now(),
                    },
                    connection: degraded ? "degraded" : "online",
                    detail: agentUnavailable
                        ? health.detail || "The iPhone session API is unavailable."
                        : degraded
                          ? "iPhone chat could not reach a compatible session API."
                          : health.engine || health.service || "Ready",
                    version: typeof health.version === "string" ? health.version : undefined,
                    lastCheckedAt: Date.now(),
                };
                const snapshot: HostSnapshot = {
                    host: runtime,
                    sessions,
                    statuses,
                    browserStates,
                    sandboxes,
                    phoneControl,
                    surfaces: buildSurfaces(profile, sessions, statuses, browserStates, sandboxes, phoneControl),
                };
                if (!authorizedHosts.current.has(profile.id)) return null;
                setHostStates((current) => ({ ...current, [profile.id]: runtime }));
                setSnapshots((current) => ({ ...current, [profile.id]: snapshot }));
                return snapshot;
            } catch (reason) {
                setHostStates((current) => ({
                    ...current,
                    [profile.id]: {
                        profile,
                        connection: "offline",
                        detail: errorMessage(reason),
                        lastCheckedAt: Date.now(),
                    },
                }));
                return null;
            }
        },
        [clientFor]
    );

    const refreshAll = useCallback((): Promise<void> => {
        if (!profiles.length || !lifecycleActiveRef.current) {
            return Promise.resolve();
        }
        if (refreshAllPromiseRef.current) {
            return refreshAllPromiseRef.current;
        }
        setRefreshing(true);
        const refreshPromise = Promise.all(
            profiles.filter((profile) => authorizedHosts.current.has(profile.id)).map((profile) => refreshHost(profile))
        ).then(() => undefined);
        refreshAllPromiseRef.current = refreshPromise;
        return refreshPromise.finally(() => {
            if (refreshAllPromiseRef.current === refreshPromise) {
                refreshAllPromiseRef.current = null;
                setRefreshing(false);
            }
        });
    }, [profiles, refreshHost]);

    useEffect(() => {
        void (async () => {
            if (Capacitor.isNativePlatform()) {
                await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
                await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
            }
            const hosts = await loadHosts();
            setProfiles(hosts);
            setHostStates(Object.fromEntries(hosts.map((host) => [host.id, emptyRuntime(host)])));
            setChatHostId(undefined);
            setHostsLoaded(true);
        })();
        return () => {
            clearEventRefreshTimers();
            for (const client of clientsRef.current.values()) {
                client.close();
            }
        };
    }, [clearEventRefreshTimers]);

    useEffect(() => {
        let disposed = false;
        let removeNativeListener: (() => Promise<void>) | undefined;
        const handleVisibility = () => applyLifecycleState(document.visibilityState !== "hidden");
        const handlePageShow = () => applyLifecycleState(true);
        const handlePageHide = () => applyLifecycleState(false);

        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("pageshow", handlePageShow);
        window.addEventListener("pagehide", handlePageHide);
        if (Capacitor.isNativePlatform()) {
            void CapacitorApp.addListener("appStateChange", ({ isActive }) => applyLifecycleState(isActive))
                .then((listener) => {
                    if (disposed) {
                        void listener.remove();
                        return;
                    }
                    removeNativeListener = () => listener.remove();
                })
                .catch(() => undefined);
        }

        return () => {
            disposed = true;
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("pageshow", handlePageShow);
            window.removeEventListener("pagehide", handlePageHide);
            void removeNativeListener?.();
        };
    }, [applyLifecycleState]);

    useEffect(() => {
        const handleOnline = () => setNetworkOnline(true);
        const handleOffline = () => {
            setNetworkOnline(false);
            clearEventRefreshTimers();
            for (const client of clientsRef.current.values()) {
                client.close();
            }
            setHostStates((current) =>
                Object.fromEntries(
                    Object.entries(current).map(([id, runtime]) => [
                        id,
                        { ...runtime, connection: "offline", detail: "Waiting for a network connection" },
                    ])
                )
            );
        };
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [clearEventRefreshTimers]);

    useEffect(() => {
        if (!profiles.length || !lifecycleActive || !networkOnline) {
            return;
        }
        void refreshAll();
        const timer = window.setInterval(() => void refreshAll(), 20_000);
        return () => window.clearInterval(timer);
    }, [lifecycleActive, networkOnline, profiles.length, refreshAll]);

    useEffect(() => {
        if (!lifecycleActive || !networkOnline) {
            return;
        }
        const unsubscribers = profiles
            .filter((profile) => authorizedHosts.current.has(profile.id))
            .map((profile) => {
                const client = clientFor(profile);
                let disposed = false;
                let reconnectAttempt = 0;
                let reconnectTimer: number | undefined;
                const connect = async () => {
                    if (disposed || !lifecycleActiveRef.current || !navigator.onLine) {
                        return;
                    }
                    if (snapshotsRef.current[profile.id]?.host.connection !== "online") {
                        scheduleReconnect();
                        return;
                    }
                    try {
                        await client.connectGateway();
                        reconnectAttempt = 0;
                    } catch {
                        scheduleReconnect();
                    }
                };
                const scheduleReconnect = () => {
                    if (disposed || !lifecycleActiveRef.current || !navigator.onLine) {
                        return;
                    }
                    if (reconnectTimer) {
                        window.clearTimeout(reconnectTimer);
                    }
                    reconnectTimer = window.setTimeout(() => {
                        reconnectTimer = undefined;
                        void connect();
                    }, gatewayReconnectDelay(reconnectAttempt++));
                };
                const unsubscribeEvent = client.onEvent(() => {
                    const previous = eventRefreshTimersRef.current.get(profile.id);
                    if (previous) {
                        window.clearTimeout(previous);
                    }
                    const timer = window.setTimeout(() => {
                        eventRefreshTimersRef.current.delete(profile.id);
                        if (lifecycleActiveRef.current) {
                            void refreshHost(profile);
                        }
                    }, 350);
                    eventRefreshTimersRef.current.set(profile.id, timer);
                });
                const unsubscribeState = client.onGatewayState((state) => {
                    if (state === "open") {
                        reconnectAttempt = 0;
                        if (reconnectTimer) {
                            window.clearTimeout(reconnectTimer);
                            reconnectTimer = undefined;
                        }
                        return;
                    }
                    if (state === "closed" || state === "error") {
                        scheduleReconnect();
                    }
                });
                void connect();
                return () => {
                    disposed = true;
                    if (reconnectTimer) {
                        window.clearTimeout(reconnectTimer);
                    }
                    unsubscribeEvent();
                    unsubscribeState();
                };
            });
        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
            clearEventRefreshTimers();
        };
    }, [clearEventRefreshTimers, clientFor, lifecycleActive, networkOnline, profiles, refreshHost]);

    useEffect(() => {
        if (controlMode !== "takeover" || !leaseEndsAt) {
            return;
        }
        const delay = Math.max(0, leaseEndsAt - Date.now());
        const timer = window.setTimeout(() => {
            const host = profiles.find((profile) => profile.id === focusedSurface?.hostId);
            if (focusedSurface?.phoneControl && host) {
                void clientFor(host)
                    .releasePhoneControlLease()
                    .catch(() => undefined);
            }
            setControlMode("watch");
            setLeaseEndsAt(undefined);
            pushToast("neutral", "Direct control released", "The surface returned to read-only observation.");
        }, delay);
        return () => window.clearTimeout(timer);
    }, [clientFor, controlMode, focusedSurface, leaseEndsAt, profiles, pushToast]);

    const hostRuntimes = useMemo(
        () => profiles.map((profile) => hostStates[profile.id] ?? emptyRuntime(profile)),
        [hostStates, profiles]
    );

    useEffect(() => {
        if (
            !shouldStartLocalLinux(
                hostsLoaded,
                lifecycleActive,
                hostRuntimes
                    .filter((host) => authorizedHosts.current.has(host.profile.id))
                    .map((host) => host.connection),
                networkOnline
            ) ||
            linuxState.phase !== "idle"
        )
            return;
        setChatOpen(true);
        void localLinux.start().catch(() => undefined);
    }, [hostsLoaded, lifecycleActive, hostRuntimes, linuxState.phase, networkOnline]);

    useEffect(() => {
        void localLinux.setActive(lifecycleActive).catch(() => undefined);
    }, [lifecycleActive]);

    const localLinuxSurface = useMemo<Surface | undefined>(
        () =>
            linuxState.phase === "idle"
                ? undefined
                : {
                      id: "local-linux",
                      localLinux: true,
                      kind: "terminal",
                      hostId: "local-linux",
                      hostLabel: "This iPhone",
                      hostColor: "#7143e8",
                      title: "Local Linux",
                      subtitle: "On this device · Network off",
                      status:
                          linuxState.phase === "failed"
                              ? "failed"
                              : linuxState.phase === "paused"
                                ? "suspended"
                                : linuxState.ready
                                  ? "live"
                                  : "working",
                      attention: linuxState.phase === "failed" ? "failed" : "none",
                      updatedAt: linuxState.savedAt ?? 0,
                      capabilities: ["focus"],
                      previewText: linuxState.output
                          .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
                          .split("\n")
                          .slice(-9)
                          .join("\n"),
                  },
        [linuxState.phase, linuxState.ready, linuxState.savedAt, linuxState.output]
    );

    const surfaces = useMemo(
        () =>
            [
                ...profiles.flatMap((profile) => snapshots[profile.id]?.surfaces ?? []),
                ...runtimeSurfaces,
                ...(localLinuxSurface ? [localLinuxSurface] : []),
                ...phoneSurfaces,
            ].flatMap((surface) =>
                hiddenSurfaceIds.has(surface.id)
                    ? []
                    : [{ ...surface, previewUrl: previews[surface.id] ?? surface.previewUrl }]
            ),
        [hiddenSurfaceIds, previews, profiles, runtimeSurfaces, snapshots, localLinuxSurface, phoneSurfaces]
    );

    const currentChatHost = profiles.find(
        (profile) => profile.id === chatHostId && authorizedHosts.current.has(profile.id)
    );
    const chatConnection = hostStates[chatHostId ?? ""];

    useEffect(() => {
        if (chatSession?.id || !chatHostId) return;
        const session = snapshots[chatHostId]?.sessions[0];
        if (session) setChatSession(session);
    }, [chatHostId, chatSession?.id, snapshots]);

    useEffect(() => {
        if (Capacitor.getPlatform() !== "ios") return;
        let disposed = false;
        const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
            if (parsePairingLink(url)) {
                setPairingUrl(url);
                setLocalLinuxOpen(false);
                setLocalToolsOpen(false);
                setHostsOpen(true);
                return;
            }
            const link = parseWorkspaceDeepLink(url);
            if (link) setPendingNativeLink(link);
        });
        const notifications = listenWorkspaceNotifications((url) => {
            if (!disposed) setPendingNativeLink(parseWorkspaceDeepLink(url));
        });
        void CapacitorApp.getLaunchUrl().then((value) => {
            if (!disposed && value?.url && parsePairingLink(value.url)) {
                setPairingUrl(value.url);
                setLocalLinuxOpen(false);
                setLocalToolsOpen(false);
                setHostsOpen(true);
                return;
            }
            if (!disposed && value?.url) setPendingNativeLink(parseWorkspaceDeepLink(value.url));
        });
        return () => {
            disposed = true;
            void listener.then((handle) => handle.remove());
            void notifications.then((remove) => remove()).catch(() => undefined);
        };
    }, []);

    const nativeSnapshot = useMemo(() => {
        if (localLinuxSurface && !hostRuntimes.some((host) => host.connection === "online"))
            return {
                taskID: "local-linux",
                title: "Local Linux",
                step:
                    linuxState.phase === "starting"
                        ? "Booting Linux on this device"
                        : linuxState.phase === "paused"
                          ? "Linux paused on this device"
                          : linuxState.phase === "failed"
                            ? "Linux needs attention"
                            : "Linux running on this device",
                status: linuxState.phase === "failed" ? "failed" : linuxState.phase === "paused" ? "idle" : "running",
                surface: "sandbox",
            } as const;
        const sessionSurfaces = surfaces.filter((surface) => surface.kind === "run");
        const tracked = sessionSurfaces.find(
            (surface) => `${surface.hostId}:${surface.sessionId}` === nativeTaskRef.current
        );
        const run =
            tracked ??
            sessionSurfaces.find((surface) => surface.status === "working" || surface.status === "waiting") ??
            sessionSurfaces.find((surface) => surface.sessionId === chatSession?.id && surface.hostId === chatHostId);
        if (!run) return null;
        const key = `${run.hostId}:${run.sessionId}`;
        const status =
            run.status === "working"
                ? "running"
                : run.status === "waiting"
                  ? "waiting"
                  : run.status === "failed"
                    ? "failed"
                    : ["running", "waiting", "completed"].includes(nativeStatusRef.current.get(key) ?? "")
                      ? "completed"
                      : "idle";
        const context =
            focusedSurface?.hostId === run.hostId
                ? focusedSurface
                : surfaces.find(
                      (surface) =>
                          surface.kind !== "run" && surface.sessionId === run.sessionId && surface.hostId === run.hostId
                  );
        const surface: NativeWorkspaceSurface = context?.phoneControl
            ? "emulator"
            : context?.sandboxId
              ? "sandbox"
              : context?.kind === "file"
                ? "files"
                : context?.kind === "browser"
                  ? "browser"
                  : context?.kind === "terminal"
                    ? "terminal"
                    : "workspace";
        return {
            taskID: key,
            title: run.title,
            step:
                status === "running"
                    ? "Agent is working"
                    : status === "waiting"
                      ? "Needs your attention"
                      : status === "completed"
                        ? "Ready to review"
                        : status === "failed"
                          ? "Task needs attention"
                          : "Open your workspace",
            status,
            surface,
        } as const;
    }, [surfaces, focusedSurface, chatHostId, chatSession?.id, localLinuxSurface, hostRuntimes, linuxState.phase]);

    const nativeSnapshotKey = JSON.stringify(nativeSnapshot);
    const nativeHostsResolved = profiles.every((host) => snapshots[host.id] != null);
    useEffect(() => {
        if (Capacitor.getPlatform() !== "ios" || !hostsLoaded) return;
        const snapshot = JSON.parse(nativeSnapshotKey) as typeof nativeSnapshot;
        if (!snapshot) {
            if (nativeHostsResolved) void endNativeWorkspace().catch(() => undefined);
            return;
        }
        nativeStatusRef.current.set(snapshot.taskID, snapshot.status === "completed" ? "completed" : snapshot.status);
        nativeTaskRef.current = ["running", "waiting"].includes(snapshot.status) ? snapshot.taskID : undefined;
        void updateNativeWorkspace(snapshot).catch(() => undefined);
    }, [nativeSnapshotKey, hostsLoaded, nativeHostsResolved]);

    const chooseHost = useCallback(
        (capability?: string): HostProfile => {
            const eligible = hostRuntimes
                .map(({ profile }) => profile)
                .filter(
                    (profile) =>
                        authorizedHosts.current.has(profile.id) &&
                        (!capability || profile.capabilities.includes(capability))
                );
            const host = eligible.find((profile) => profile.id === selectedHostId) ?? eligible[0];
            if (!host) {
                throw new Error(capability ? `Add a host with ${capability} capability` : "Add a host first");
            }
            return host;
        },
        [hostRuntimes, selectedHostId]
    );

    const ensureSession = useCallback(
        async (host: HostProfile, title = "KronTerm iPhone"): Promise<KronosSession> => {
            const runtime = hostStates[host.id];
            if (runtime?.connection !== "online") {
                throw new Error(runtime?.detail || "The iPhone session API is unavailable.");
            }
            if (chatHostId === host.id && chatSession?.id) {
                return chatSession;
            }
            const existing = snapshots[host.id]?.sessions[0];
            const session = existing ?? (await clientFor(host).createSession(title));
            setChatHostId(host.id);
            setChatSession(session);
            return session;
        },
        [chatHostId, chatSession, clientFor, hostStates, snapshots]
    );

    const loadPreview = useCallback(
        async (surface: Surface) => {
            const host = profiles.find((profile) => profile.id === surface.hostId);
            if (!host) {
                return;
            }
            setSurfaceLoading(true);
            try {
                const client = clientFor(host);
                let preview = "";
                if (surface.phoneControl) {
                    const context = await client.getPhoneContext();
                    phoneContextsRef.current[surface.id] = context;
                    if (context.screenshot_base64) {
                        preview = makePreviewDataUrl("image/png", context.screenshot_base64);
                    }
                } else if (surface.kind === "browser" && surface.sessionId) {
                    if (surface.pageIndex != null) {
                        await client.runBrowserAction(surface.sessionId, "selectPage", { pageIdx: surface.pageIndex });
                    }
                    const frame = await client.getBrowserFrame(surface.sessionId);
                    preview = makePreviewDataUrl(frame.mime, frame.base64);
                } else if (surface.sandboxId) {
                    const screenshot = await client.getSandboxScreenshot(surface.sandboxId);
                    preview = makePreviewDataUrl("image/png", screenshot.image);
                }
                if (preview) {
                    setPreviews((current) => ({ ...current, [surface.id]: preview }));
                }
            } catch (reason) {
                pushToast("error", "Live view unavailable", errorMessage(reason));
            } finally {
                setSurfaceLoading(false);
            }
        },
        [clientFor, profiles, pushToast]
    );

    const openSurface = useCallback(
        (surface: Surface) => {
            setLastUsedSurfaceId(surface.id);
            phoneWidgetSurfaces.markUsed(surface.id);
            if (surface.localLinux) {
                setLocalLinuxTab(surface.localWidget ?? "terminal");
                setLocalBrowserPageId(surface.pageId);
                setLocalLinuxOpen(true);
                setChatOpen(false);
                return;
            }
            void selectionHaptic();
            if (surface.kind === "run" && surface.sessionId) {
                const host = profiles.find((profile) => profile.id === surface.hostId);
                const session = snapshots[surface.hostId]?.sessions.find((item) => item.id === surface.sessionId);
                if (host && session) {
                    setChatHostId(host.id);
                    setChatSession(session);
                    setChatOpen(true);
                }
                return;
            }
            setChatOpen(false);
            setFocusedSurface(surface);
            setControlMode("watch");
            setLeaseEndsAt(undefined);
            void loadPreview(surface);
        },
        [loadPreview, profiles, snapshots]
    );

    useEffect(() => {
        if (!lifecycleActive || !networkOnline || focusedSurface || hostsOpen) return;
        let disposed = false;
        const candidates = Object.values(snapshots)
            .flatMap((snapshot) => {
                if (hostStates[snapshot.host.profile.id]?.connection !== "online") return [];
                return snapshot.surfaces.filter((surface) => {
                    if (hiddenSurfaceIds.has(surface.id)) return false;
                    if (
                        chatOpen &&
                        (surface.hostId !== chatHostId || (surface.sessionId && surface.sessionId !== chatSession?.id))
                    )
                        return false;
                    if (surface.sandboxId && surface.kind === "app") return true;
                    return (
                        surface.kind === "browser" &&
                        snapshot.browserStates.some(
                            (state) => state.sessionID === surface.sessionId && state.activePageID === surface.pageId
                        )
                    );
                });
            })
            .slice(0, 4);
        void Promise.allSettled(
            candidates.map(async (surface) => {
                const host = profiles.find((profile) => profile.id === surface.hostId);
                if (!host) return;
                const client = clientFor(host);
                let preview: string;
                if (surface.sandboxId) {
                    const frame = await client.getSandboxScreenshot(surface.sandboxId);
                    preview = makePreviewDataUrl("image/png", frame.image);
                } else {
                    const frame = await client.getBrowserFrame(surface.sessionId!);
                    if (frame.pageID && frame.pageID !== surface.pageId) return;
                    preview = makePreviewDataUrl(frame.mime, frame.base64);
                }
                if (!disposed && preview) setPreviews((current) => ({ ...current, [surface.id]: preview }));
            })
        );
        return () => {
            disposed = true;
        };
    }, [
        snapshots,
        profiles,
        lifecycleActive,
        networkOnline,
        focusedSurface,
        hostsOpen,
        hiddenSurfaceIds,
        chatOpen,
        chatHostId,
        chatSession?.id,
        clientFor,
    ]);

    useEffect(() => {
        if (!pendingNativeLink || !hostsLoaded) return;
        if (pendingNativeLink.taskID === "local-linux") {
            setLocalLinuxOpen(true);
            setChatOpen(false);
            void localLinux.start().catch(() => undefined);
            setPendingNativeLink(null);
            return;
        }
        const run = surfaces.find(
            (surface) => surface.kind === "run" && `${surface.hostId}:${surface.sessionId}` === pendingNativeLink.taskID
        );
        if (pendingNativeLink.taskID && !run) {
            if (hostRuntimes.some((host) => host.connection === "connecting" || host.connection === "idle")) return;
            setChatOpen(false);
            setLocalToolsOpen(false);
            setPendingNativeLink(null);
            pushToast("neutral", "Task unavailable", "Reconnect its paired host from Workspace.");
            return;
        }
        const candidates = surfaces.filter(
            (surface) =>
                !run || (surface.hostId === run.hostId && (!surface.sessionId || surface.sessionId === run.sessionId))
        );
        const target = candidates.find((surface) =>
            pendingNativeLink.surface === "sandbox"
                ? Boolean(surface.sandboxId) && surface.kind === "app"
                : pendingNativeLink.surface === "emulator"
                  ? Boolean(surface.phoneControl)
                  : pendingNativeLink.surface === "chat"
                    ? surface.kind === "run"
                    : surface.kind === (pendingNativeLink.surface === "files" ? "file" : pendingNativeLink.surface)
        );
        if (target) openSurface(target);
        else {
            setLocalToolsOpen(false);
            setChatOpen(false);
        }
        setPendingNativeLink(null);
    }, [pendingNativeLink, hostsLoaded, surfaces, hostRuntimes, openSurface, pushToast]);

    const closeSurface = useCallback(
        async (surface: Surface) => {
            const host = profiles.find((profile) => profile.id === surface.hostId);
            if (surface.kind === "terminal" && surface.terminalSessionId && host) {
                await clientFor(host)
                    .destroyTerminal(surface.terminalSessionId)
                    .catch(() => undefined);
                setRuntimeSurfaces((current) => current.filter((item) => item.id !== surface.id));
                return;
            }
            const closed: ClosedSurface = { surface, closedAt: Date.now() };
            setClosedSurfaces((current) =>
                [closed, ...current.filter((item) => item.surface.id !== surface.id)].slice(0, 12)
            );
            if (surface.kind === "browser" && surface.sessionId && host) {
                try {
                    await clientFor(host).runBrowserAction(surface.sessionId, "closePage", {
                        pageIdx: surface.pageIndex,
                    });
                    await refreshHost(host);
                } catch (reason) {
                    pushToast("error", "Could not close browser surface", errorMessage(reason));
                }
                return;
            }
            setHiddenSurfaceIds((current) => new Set(current).add(surface.id));
        },
        [clientFor, profiles, pushToast, refreshHost]
    );

    const restoreSurface = useCallback(
        async (closed: ClosedSurface) => {
            const { surface } = closed;
            const host = profiles.find((profile) => profile.id === surface.hostId);
            try {
                if (surface.kind === "browser" && surface.url && surface.sessionId && host) {
                    await clientFor(host).runBrowserAction(surface.sessionId, "newPage", { url: surface.url });
                    await refreshHost(host);
                } else {
                    setHiddenSurfaceIds((current) => {
                        const next = new Set(current);
                        next.delete(surface.id);
                        return next;
                    });
                }
                setClosedSurfaces((current) => current.filter((item) => item.closedAt !== closed.closedAt));
                void resultHaptic(true);
            } catch (reason) {
                pushToast("error", "Could not restore surface", errorMessage(reason));
            }
        },
        [clientFor, profiles, pushToast, refreshHost]
    );

    const connectHost = useCallback(
        async (input: ConnectHostInput) => {
            setConnecting(true);
            try {
                const baseUrl = normalizeHostUrl(input.baseUrl);
                let token = input.token;
                let label = input.label;
                let capabilities: string[] | undefined;
                if (input.kind === "computer") {
                    const pairing = await KronosHostClient.pair(baseUrl, input.code ?? "");
                    token = pairing.token;
                    label = label.trim() || pairing.hostName;
                    capabilities = pairing.capabilities;
                }
                const profile = makeHostProfile(
                    { label, baseUrl, kind: input.kind, token, capabilities },
                    profiles.length
                );
                const health = await clientFor(profile).health();
                const next = [...profiles, profile];
                await saveHosts(next);
                authorizedHosts.current.add(profile.id);
                setProfiles(next);
                setHostStates((current) => ({ ...current, [profile.id]: emptyRuntime(profile) }));
                setSelectedHostId(profile.id);
                const snapshot = await refreshHost(profile, health);
                setChatHostId(profile.id);
                setChatSession(snapshot?.sessions[0]);
                setChatOpen(true);
                setHostsOpen(false);
                if (snapshot?.host.connection === "online") {
                    pushToast("success", `${profile.label} connected`, "iPhone chat is available.");
                    void resultHaptic(true);
                } else {
                    pushToast("neutral", `${profile.label} saved`, snapshot?.host.detail || "The host is unavailable.");
                }
            } finally {
                setConnecting(false);
            }
        },
        [clientFor, profiles, pushToast, refreshHost]
    );

    const removeHost = useCallback(
        async (hostId: string) => {
            const profile = profiles.find((host) => host.id === hostId);
            if (!profile || profile.kind === "managed") {
                return;
            }
            const next = profiles.filter((host) => host.id !== hostId);
            await saveHosts(next);
            clientsRef.current.get(hostId)?.close();
            clientsRef.current.delete(hostId);
            setProfiles(next);
            setRuntimeSurfaces((current) => current.filter((surface) => surface.hostId !== hostId));
            setSnapshots((current) => {
                const copy = { ...current };
                delete copy[hostId];
                return copy;
            });
            if (selectedHostId === hostId) {
                setSelectedHostId("all");
            }
            pushToast("neutral", `${profile.label} removed`, "The host can be paired again at any time.");
        },
        [profiles, pushToast, selectedHostId]
    );

    const createSandbox = useCallback(
        async (
            preferredKind: "app" | "terminal" = "app",
            preferredHost?: HostProfile
        ): Promise<Surface | undefined> => {
            try {
                const host = preferredHost ?? chooseHost("sandbox");
                pushToast("neutral", "Provisioning Kron Sandbox", `Creating an isolated desktop on ${host.label}.`);
                const sandbox = await clientFor(host).createSandbox();
                const snapshot = await refreshHost(host);
                const matchingSurfaces = snapshot?.surfaces.filter((surface) => surface.sandboxId === sandbox.id) ?? [];
                const surface = findPreferredSurface(matchingSurfaces, preferredKind, host.id);
                if (!surface) {
                    if (preferredKind === "terminal") {
                        throw new Error("This sandbox did not expose a terminal connection");
                    }
                    pushToast("neutral", "Sandbox requested", "Refresh Workspace to check for the desktop.");
                    return;
                }
                if (surface.status === "working") {
                    pushToast("neutral", "Sandbox starting", "Check its progress in Workspace.");
                    return;
                }
                if (surface.status !== "live") {
                    throw new Error(sandbox.lastError || "The host returned a sandbox that is unavailable.");
                }
                openSurface(surface);
                pushToast("success", "Sandbox ready", "It is isolated from your iPhone and personal computer.");
                void resultHaptic(true);
                return surface;
            } catch (reason) {
                pushToast("error", "Could not create a sandbox", errorMessage(reason));
                if (!profiles.some((profile) => profile.capabilities.includes("sandbox"))) {
                    setHostsOpen(true);
                }
                void resultHaptic(false);
                return undefined;
            }
        },
        [chooseHost, clientFor, openSurface, profiles, pushToast, refreshHost]
    );

    const openKronosForSurface = useCallback(async () => {
        if (!focusedSurface) {
            return;
        }
        const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
        if (!host) {
            return;
        }
        if (focusedSurface.sessionId) {
            const session = snapshots[host.id]?.sessions.find((item) => item.id === focusedSurface.sessionId);
            if (session) {
                setChatHostId(host.id);
                setChatSession(session);
            } else {
                await ensureSession(host, `Control ${focusedSurface.title}`);
            }
        } else {
            await ensureSession(host, `Control ${focusedSurface.title}`);
        }
        setChatOpen(true);
    }, [ensureSession, focusedSurface, profiles, snapshots]);

    const chooseAgentHost = useCallback(
        (target: RuntimeTarget): HostProfile => {
            const eligible = hostRuntimes
                .map(({ profile }) => profile)
                .filter(
                    (profile) => authorizedHosts.current.has(profile.id) && profile.capabilities.includes("kronoscode")
                );
            if (target === "sandbox") {
                const sandbox = eligible.find((profile) => profile.capabilities.includes("sandbox"));
                if (sandbox) {
                    return sandbox;
                }
            }
            if (target === "remote-device") {
                const computer = eligible.find((profile) => profile.kind === "computer");
                if (computer) {
                    return computer;
                }
            }
            const selected = eligible.find((profile) => profile.id === selectedHostId);
            const host = selected ?? eligible.find((profile) => profile.id === chatHostId) ?? eligible[0];
            if (!host) {
                throw new Error("Connect Kron Sandbox or a KronosCode runtime to start this objective");
            }
            return host;
        },
        [chatHostId, hostRuntimes, selectedHostId]
    );

    const sendAgentObjective = useCallback(
        async (objective: RoutedAgentObjective): Promise<boolean> => {
            try {
                const host = chooseAgentHost(objective.route.target);
                const session = await ensureSession(host, `${objective.route.label} objective`);
                const selectedFile = objective.workspace.selectedFile;
                const workspaceContext = [
                    `<kronterm-runtime target="${objective.route.target}">`,
                    `Workspace: ${objective.workspace.name} (${objective.workspace.branch})`,
                    `Files: ${objective.workspace.files.join(", ")}`,
                    selectedFile ? `Selected file: ${selectedFile.path}\n\n${selectedFile.content}` : "",
                    "</kronterm-runtime>",
                ]
                    .filter(Boolean)
                    .join("\n");
                await clientFor(host).sendMessage(
                    session.id,
                    `${objective.text}\n\n${workspaceContext}`,
                    session.directory
                );
                await new Promise((resolve) => window.setTimeout(resolve, 350));
                await refreshHost(host);
                void tapHaptic();
                return true;
            } catch (reason) {
                pushToast("error", "Kronos could not start that objective", errorMessage(reason));
                if (!profiles.some((profile) => profile.capabilities.includes("kronoscode"))) {
                    setHostsOpen(true);
                }
                void resultHaptic(false);
                return false;
            }
        },
        [chooseAgentHost, clientFor, ensureSession, profiles, pushToast, refreshHost]
    );

    const submitOmnibox = useCallback(
        async (value: string) => {
            try {
                if (!UrlPattern.test(value.trim())) {
                    await sendAgentObjective({
                        text: value,
                        route: {
                            target: "sandbox",
                            label: "Kron Sandbox",
                            reason: "Browser-originated objectives use the connected KronosCode runtime.",
                        },
                        workspace: {
                            id: "browser",
                            name: "Browser",
                            branch: "main",
                            files: [],
                        },
                    });
                    return;
                }
                const host = chooseHost("browser");
                const session = await ensureSession(host, "Browse with Kronos");
                const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
                await clientFor(host).runBrowserAction(session.id, "newPage", { url });
                const snapshot = await refreshHost(host);
                const surface = snapshot?.surfaces.find((item) => item.kind === "browser" && item.url === url);
                const fallback = findPreferredSurface(snapshot?.surfaces ?? [], "browser", host.id);
                setChatOpen(false);
                if (surface) {
                    openSurface(surface);
                } else if (fallback) {
                    openSurface(fallback);
                } else {
                    throw new Error("The host opened the page but did not return a controllable browser surface");
                }
            } catch (reason) {
                pushToast("error", "Could not open that workspace", errorMessage(reason));
                if (!profiles.length) {
                    setHostsOpen(true);
                }
            }
        },
        [chooseHost, clientFor, ensureSession, openSurface, profiles.length, pushToast, refreshHost, sendAgentObjective]
    );

    const openWidget = useCallback(
        async (widget: SurfaceWidget): Promise<void> => {
            if (
                ["sandbox", "terminal", "kronoscode"].includes(widget) &&
                !hostRuntimes.some((host) => host.connection === "online")
            ) {
                setLocalLinuxOpen(true);
                setChatOpen(false);
                await localLinux.start();
                return;
            }
            if (widget === "browser") {
                await submitOmnibox("https://www.google.com");
                return;
            }
            if (widget === "sandbox") {
                await createSandbox();
                return;
            }

            const terminalWidget = widget === "terminal" || widget === "kronoscode";
            const capability = widget === "file" ? "files" : widget === "app" ? "apps" : "terminal";
            try {
                const host = chooseHost(capability);
                const existing =
                    widget === "kronoscode"
                        ? undefined
                        : findPreferredSurface(surfaces, terminalWidget ? "terminal" : widget, host.id);
                if (existing) {
                    openSurface(existing);
                    return;
                }
                if (terminalWidget) {
                    const session = snapshots[host.id]?.sessions[0] ?? (await ensureSession(host, "Project shell"));
                    const directory = session.directory?.trim();
                    if (!directory) {
                        throw new Error(`${host.label} did not provide a project directory for the shell`);
                    }
                    const terminal = await clientFor(host).createTerminal(directory);
                    const surface: Surface = {
                        id: `${host.id}:terminal:project:${terminal.sessionId}`,
                        kind: "terminal",
                        hostId: host.id,
                        hostLabel: host.label,
                        hostColor: host.color,
                        title: widget === "kronoscode" ? "KronosCode TUI" : "Project shell",
                        subtitle: directory,
                        status: "live",
                        attention: "none",
                        updatedAt: Date.now(),
                        terminalSessionId: terminal.sessionId,
                        initialCommand: widget === "kronoscode" ? "kronoscode" : undefined,
                        capabilities: ["focus", "input", "signal", "stop"],
                    };
                    setRuntimeSurfaces((current) => [surface, ...current]);
                    openSurface(surface);
                    return;
                }
                if (host.capabilities.includes("sandbox")) {
                    await createSandbox("app", host);
                    return;
                }
                throw new Error(`${host.label} has no live ${capability} surface to open`);
            } catch (reason) {
                pushToast("error", `Could not open ${capability}`, errorMessage(reason));
                if (!profiles.some((profile) => profile.capabilities.includes(capability))) {
                    setHostsOpen(true);
                }
            }
        },
        [
            hostRuntimes,
            chooseHost,
            clientFor,
            createSandbox,
            ensureSession,
            openSurface,
            profiles,
            pushToast,
            snapshots,
            submitOmnibox,
            surfaces,
        ]
    );

    const openAgentChat = useCallback(() => {
        setChatOpen(true);
        void selectionHaptic();
        try {
            const host = currentChatHost ?? chooseHost("kronoscode");
            setChatHostId(host.id);
        } catch {
            setHostsOpen(true);
        }
    }, [chooseHost, currentChatHost]);

    const runBrowserAction = useCallback(
        async (action: string, payload: Record<string, unknown> = {}) => {
            if (!focusedSurface?.sessionId) {
                return;
            }
            const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
            if (!host) {
                return;
            }
            setSurfaceLoading(true);
            try {
                await clientFor(host).runBrowserAction(focusedSurface.sessionId, action, payload);
                const snapshot = await refreshHost(host);
                const updated =
                    snapshot?.surfaces.find((surface) => surface.id === focusedSurface.id) ?? focusedSurface;
                setFocusedSurface(updated);
                await loadPreview(updated);
            } catch (reason) {
                pushToast("error", "Browser action failed", errorMessage(reason));
            } finally {
                setSurfaceLoading(false);
            }
        },
        [clientFor, focusedSurface, loadPreview, profiles, pushToast, refreshHost]
    );

    const loadBrowserControls = useCallback(async () => {
        if (!focusedSurface?.sessionId) {
            throw new Error("This browser surface is not connected to a session");
        }
        const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
        if (!host) {
            throw new Error("This browser host is no longer available");
        }
        return clientFor(host).getBrowserSnapshot(focusedSurface.sessionId);
    }, [clientFor, focusedSurface, profiles]);

    const runSandboxAction = useCallback(
        async (action: Record<string, unknown>) => {
            if (!focusedSurface || controlMode !== "takeover") {
                return;
            }
            const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
            if (!host) {
                return;
            }
            if (!focusedSurface.phoneControl) {
                setLeaseEndsAt(Date.now() + ControlLeaseDuration);
            }
            setSurfaceLoading(true);
            try {
                const client = clientFor(host);
                if (focusedSurface.phoneControl) {
                    const context = phoneContextsRef.current[focusedSurface.id] ?? (await client.getPhoneContext());
                    const naturalWidth = context.metadata?.width ?? phoneLogicalSize(context).width;
                    const naturalHeight = context.metadata?.height ?? phoneLogicalSize(context).height;
                    const logicalSize = phoneLogicalSize(context);
                    const rawCoordinate = Array.isArray(action.coordinate) ? action.coordinate : [];
                    const x = Math.round(
                        (Number(rawCoordinate[0] ?? naturalWidth / 2) / naturalWidth) * logicalSize.width
                    );
                    const y = Math.round(
                        (Number(rawCoordinate[1] ?? naturalHeight / 2) / naturalHeight) * logicalSize.height
                    );
                    let response;
                    if (action.action === "left_click") {
                        phoneTapPointsRef.current[focusedSurface.id] = [x, y];
                        response = await client.runPhoneAction("tap", { x, y });
                    } else if (action.action === "type") {
                        const [focusX, focusY] = phoneTapPointsRef.current[focusedSurface.id] ?? [x, y];
                        response = await client.runPhoneAction("enter_text", {
                            coordinate: `{{${focusX - 1}, ${focusY - 1}}, {2, 2}}`,
                            text: String(action.text ?? ""),
                        });
                    } else if (action.action === "swipe") {
                        response = await client.runPhoneAction("swipe", {
                            x,
                            y,
                            direction: String(action.direction ?? "up"),
                        });
                    } else {
                        throw new Error(`Unsupported iPhone action: ${String(action.action)}`);
                    }
                    if (response.verification) {
                        phoneContextsRef.current[focusedSurface.id] = response.verification;
                        if (response.verification.screenshot_base64) {
                            setPreviews((current) => ({
                                ...current,
                                [focusedSurface.id]: makePreviewDataUrl(
                                    "image/png",
                                    response.verification?.screenshot_base64 ?? ""
                                ),
                            }));
                        }
                    }
                } else if (focusedSurface.sandboxId) {
                    await client.runSandboxAction(focusedSurface.sandboxId, action);
                } else {
                    return;
                }
                await loadPreview(focusedSurface);
                void tapHaptic();
            } catch (reason) {
                pushToast(
                    "error",
                    focusedSurface.phoneControl ? "iPhone action failed" : "Sandbox action failed",
                    errorMessage(reason)
                );
            } finally {
                setSurfaceLoading(false);
            }
        },
        [clientFor, controlMode, focusedSurface, loadPreview, profiles, pushToast]
    );

    const subscribeFocusedTerminal = useCallback(
        (onEvent: (event: TerminalStreamEvent) => void): (() => void) => {
            if (!focusedSurface?.terminalSessionId) {
                return () => undefined;
            }
            const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
            if (!host) {
                return () => undefined;
            }
            return clientFor(host).subscribeTerminal(focusedSurface.terminalSessionId, onEvent);
        },
        [clientFor, focusedSurface, profiles]
    );

    const sendFocusedTerminalInput = useCallback(
        async (data: string): Promise<void> => {
            if (!focusedSurface?.terminalSessionId) {
                return;
            }
            const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
            if (!host) {
                return;
            }
            await clientFor(host).sendTerminalInput(focusedSurface.terminalSessionId, data);
        },
        [clientFor, focusedSurface, profiles]
    );

    const resizeFocusedTerminal = useCallback(
        async (cols: number, rows: number): Promise<void> => {
            if (!focusedSurface?.terminalSessionId) {
                return;
            }
            const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
            if (!host) {
                return;
            }
            await clientFor(host).resizeTerminal(focusedSurface.terminalSessionId, cols, rows);
        },
        [clientFor, focusedSurface, profiles]
    );

    const refreshFocusedSurface = useCallback(async () => {
        if (!focusedSurface) {
            return;
        }
        const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
        if (host) {
            await refreshHost(host);
        }
        await loadPreview(focusedSurface);
    }, [focusedSurface, loadPreview, profiles, refreshHost]);

    const stopFocusedSurface = useCallback(async () => {
        if (!focusedSurface) {
            return;
        }
        const host = profiles.find((profile) => profile.id === focusedSurface.hostId);
        if (!host) {
            return;
        }
        try {
            if (focusedSurface.sandboxId) {
                await clientFor(host).destroySandbox(focusedSurface.sandboxId);
            } else if (focusedSurface.terminalSessionId) {
                await clientFor(host).destroyTerminal(focusedSurface.terminalSessionId);
                setRuntimeSurfaces((current) => current.filter((surface) => surface.id !== focusedSurface.id));
            } else if (focusedSurface.sessionId && focusedSurface.kind === "run") {
                await clientFor(host).abortSession(focusedSurface.sessionId);
            } else if (focusedSurface.sessionId && focusedSurface.kind === "browser") {
                await clientFor(host).runBrowserAction(focusedSurface.sessionId, "stop");
            }
            await refreshHost(host);
            setFocusedSurface(undefined);
            pushToast("neutral", `${focusedSurface.title} stopped`);
        } catch (reason) {
            pushToast("error", "Could not stop this surface", errorMessage(reason));
        }
    }, [clientFor, focusedSurface, profiles, pushToast, refreshHost]);

    const changeControlMode = useCallback(
        (mode: SurfaceControlMode) => {
            void (async () => {
                const host = profiles.find((profile) => profile.id === focusedSurface?.hostId);
                try {
                    const sessionId = focusedSurface?.sessionId;
                    if (
                        mode === "takeover" &&
                        host &&
                        sessionId &&
                        ["busy", "retry"].includes(snapshots[host.id]?.statuses[sessionId]?.type)
                    ) {
                        const directory = snapshots[host.id]?.sessions.find(
                            (session) => session.id === sessionId
                        )?.directory;
                        const stopped = await clientFor(host).abortSession(sessionId, directory);
                        if (!stopped) throw new Error("The host did not confirm agent interruption");
                    }
                    if (focusedSurface?.phoneControl && host) {
                        if (mode === "takeover") {
                            const lease = await clientFor(host).startPhoneControlLease(ControlLeaseDuration);
                            setLeaseEndsAt(lease.expiresAt ?? Date.now() + ControlLeaseDuration);
                        } else {
                            await clientFor(host).releasePhoneControlLease();
                            setLeaseEndsAt(undefined);
                        }
                    } else {
                        setLeaseEndsAt(mode === "takeover" ? Date.now() + ControlLeaseDuration : undefined);
                    }
                    setControlMode(mode);
                    void selectionHaptic();
                } catch (reason) {
                    pushToast("error", "Could not change iPhone control", errorMessage(reason));
                }
            })();
        },
        [clientFor, focusedSurface, profiles, pushToast, snapshots]
    );

    const closeFocusedSurface = useCallback(() => {
        const host = profiles.find((profile) => profile.id === focusedSurface?.hostId);
        if (focusedSurface?.phoneControl && host && controlMode === "takeover") {
            void clientFor(host)
                .releasePhoneControlLease()
                .catch(() => undefined);
        }
        setControlMode("watch");
        setLeaseEndsAt(undefined);
        setFocusedSurface(undefined);
    }, [clientFor, controlMode, focusedSurface, profiles]);

    return (
        <div className="kronterm-app">
            {!chatOpen && !localToolsOpen ? (
                <MobileWorkspace
                    blocked={hostsOpen || !!focusedSurface || localLinuxOpen}
                    surfaces={surfaces}
                    hosts={hostRuntimes}
                    closedSurfaces={closedSurfaces}
                    refreshing={refreshing}
                    onOpenSurface={openSurface}
                    onOpenChat={openAgentChat}
                    onOpenHosts={() => setHostsOpen(true)}
                    onRefresh={refreshAll}
                    onOpenWidget={openWidget}
                    onLocalTools={() => setLocalToolsOpen(true)}
                    onRestoreSurface={(closed) => void restoreSurface(closed)}
                    onNotifications={
                        Capacitor.getPlatform() === "ios"
                            ? async () => {
                                  const granted = await requestWorkspaceNotifications();
                                  pushToast(
                                      "neutral",
                                      granted ? "Task alerts enabled" : "Notifications are off",
                                      granted
                                          ? "Result and attention alerts are enabled for this device."
                                          : "You can enable notifications in iPhone Settings."
                                  );
                              }
                            : undefined
                    }
                />
            ) : null}
            {!chatOpen && localToolsOpen ? (
                <LocalTools
                    blocked={hostsOpen || !!focusedSurface || localLinuxOpen}
                    onBack={() => setLocalToolsOpen(false)}
                    onRemoteShell={() => openWidget("kronoscode")}
                />
            ) : null}

            <FocusedSurface
                surface={focusedSurface}
                previewUrl={focusedSurface ? previews[focusedSurface.id] : undefined}
                loading={surfaceLoading}
                controlMode={controlMode}
                leaseEndsAt={leaseEndsAt}
                onBack={closeFocusedSurface}
                onRefresh={refreshFocusedSurface}
                onBrowserSnapshot={loadBrowserControls}
                onBrowserAction={runBrowserAction}
                onSandboxAction={runSandboxAction}
                onTerminalSubscribe={subscribeFocusedTerminal}
                onTerminalInput={sendFocusedTerminalInput}
                onTerminalResize={resizeFocusedTerminal}
                onControlMode={changeControlMode}
                onAskKronos={() => void openKronosForSurface()}
                onResumeKronos={async (note) => {
                    const surface = focusedSurface;
                    const host = profiles.find((profile) => profile.id === surface?.hostId);
                    if (!surface || !host) throw new Error("The widget host is unavailable");
                    const session = await ensureSession(host, `Continue ${surface.title}`);
                    await clientFor(host).sendMessage(
                        session.id,
                        `I finished taking control of ${surface.title}. ${note.trim() || "Continue the task from the current state."}`,
                        session.directory
                    );
                    setFocusedSurface(undefined);
                    setControlMode("watch");
                    setLeaseEndsAt(undefined);
                    setChatOpen(true);
                }}
                onStop={stopFocusedSurface}
            />
            {
                <LocalLinuxPanel
                    open={localLinuxOpen}
                    foreground={lifecycleActive}
                    initialTab={localLinuxTab}
                    initialBrowserPageId={localBrowserPageId}
                    onAgent={() => {
                        setLocalLinuxOpen(false);
                        setChatOpen(true);
                    }}
                    onResumeAgent={(note) => {
                        setChatHostId(undefined);
                        setLocalLinuxOpen(false);
                        setChatOpen(true);
                        setLocalResumeRequest({
                            id: crypto.randomUUID(),
                            text: `I finished taking control of the local widget. ${note.trim() || "Continue from the current state."}`,
                        });
                    }}
                    onBack={() => {
                        setLocalLinuxOpen(false);
                        setChatOpen(true);
                        setLocalToolsOpen(false);
                    }}
                />
            }

            {hostsOpen && !focusedSurface ? (
                <button
                    className="sheet-backdrop"
                    type="button"
                    aria-label="Close sheet"
                    onClick={() => setHostsOpen(false)}
                />
            ) : null}

            <HostSheet
                pairingUrl={pairingUrl}
                onUse={(id) => {
                    const host = profiles.find((profile) => profile.id === id);
                    if (!host) return;
                    authorizedHosts.current.add(id);
                    if (id !== chatHostId) setChatSession(undefined);
                    setChatHostId(id);
                    setSelectedHostId(id);
                    setProfiles((current) => [...current]);
                    void refreshHost(host);
                    setHostsOpen(false);
                    setLocalLinuxOpen(false);
                    setChatOpen(true);
                }}
                onUseLocal={() => {
                    authorizedHosts.current.clear();
                    for (const client of clientsRef.current.values()) client.close();
                    setSnapshots({});
                    setRuntimeSurfaces([]);
                    setChatHostId(undefined);
                    setChatSession(undefined);
                    setHostStates(Object.fromEntries(profiles.map((profile) => [profile.id, emptyRuntime(profile)])));
                    setProfiles((current) => [...current]);
                    setHostsOpen(false);
                    setLocalLinuxOpen(true);
                    setChatOpen(false);
                    void localLinux
                        .start()
                        .catch((reason) => pushToast("error", "Local Linux unavailable", errorMessage(reason)));
                }}
                open={hostsOpen}
                hosts={hostRuntimes}
                connecting={connecting}
                onClose={() => setHostsOpen(false)}
                onConnect={connectHost}
                onRemove={removeHost}
                onRefresh={refreshAll}
            />

            <AgentChat
                open={!!currentChatHost && chatOpen && !hostsOpen && !focusedSurface && !localLinuxOpen}
                lastUsedSurfaceId={phoneWidgetSurfaces.getLastUsedId() ?? lastUsedSurfaceId}
                hostsLoaded={hostsLoaded}
                host={currentChatHost}
                session={chatSession}
                client={currentChatHost ? clientFor(currentChatHost) : null}
                onEnsureSession={() => ensureSession(currentChatHost ?? chooseHost("kronoscode"))}
                onOpenHosts={() => setHostsOpen(true)}
                onOpenWorkspace={() => {
                    setLocalToolsOpen(false);
                    setChatOpen(false);
                }}
                surfaces={surfaces.filter(
                    (surface) =>
                        surface.localLinux ||
                        (surface.hostId === chatHostId && (!surface.sessionId || surface.sessionId === chatSession?.id))
                )}
                onOpenSurface={openSurface}
                connectionError={
                    chatConnection?.connection === "online"
                        ? undefined
                        : (chatConnection?.detail ?? "Checking host compatibility…")
                }
            />

            <LocalAgent
                open={!currentChatHost && chatOpen && !hostsOpen && !focusedSurface && !localLinuxOpen}
                surfaces={surfaces}
                resumeRequest={localResumeRequest}
                lastUsedSurfaceId={phoneWidgetSurfaces.getLastUsedId() ?? lastUsedSurfaceId}
                onOpenSurface={openSurface}
                onHosts={() => setHostsOpen(true)}
                onWorkspace={() => {
                    setLocalToolsOpen(false);
                    setChatOpen(false);
                }}
                onLaunchWidget={(widget) => {
                    phoneWidgetSurfaces.markUsed(
                        widget === "browser"
                            ? "phone-browser-initial"
                            : widget === "desktop"
                              ? "phone-desktop"
                              : "local-linux"
                    );
                    setLocalLinuxTab(widget);
                    setLocalLinuxOpen(true);
                    setChatOpen(false);
                }}
            />

            <ToastStack
                toasts={toasts}
                onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
            />
        </div>
    );
};
