// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { makeSurfaceClipPath } from "@/app/block/persistent-block-geometry";
import { useSystemAppearance } from "@/app/components/system-ui";
import { BrowserChatSelectionEvent, type BrowserChatSelectionRequest } from "@/app/view/webview/browser-chat-selection";
import { SystemCenterOpenEvent } from "@/app/workspace/command-center-events";
import { usePenPaletteCommands, type PenCanvasCommand } from "@/app/workspace/kronterm-pen-palette";
import { getApi } from "@/store/global";
import { PenVoiceEvent, type PenVoiceRequest } from "@hermes/app/contrib/pen-composer-voice";
import type { PenDialogRequest } from "@hermes/app/contrib/pen-dialogs";
import { PenHistoryToolEvent } from "@hermes/app/contrib/pen-history-tools";
import { resolveSlashSessionId } from "@hermes/app/session/hooks/use-prompt-actions/utils";
import { runN8nWorkspaceCommand, type N8nRuntimeState } from "@hermes/app/workflows/n8n-workspace-client";
import { $workflowSidebarMode } from "@hermes/app/workflows/workflow-context";
import { $sandboxComputerAccess } from "@hermes/computer/access-store";
import { searchSessions } from "@hermes/hermes";
import type { ChatMessage } from "@hermes/lib/chat-messages";
import { parseSlashCommand, sessionTitle, SLASH_COMMAND_RE } from "@hermes/lib/chat-runtime";
import { desktopFsProfile, readDesktopDir, readDesktopFileText } from "@hermes/lib/desktop-fs";
import { $krontermInspectorOpen } from "@hermes/lib/kronterm-sidebar";
import { sessionMatchesSearch } from "@hermes/lib/session-search";
import { normalizeSessionSource } from "@hermes/lib/session-source";
import { subscribeSubagentSurface, type SubagentSurfaceSnapshot } from "@hermes/lib/subagent-surface";
import { latestSessionTodos, type TodoItem } from "@hermes/lib/todos";
import { primeVoicePlayback } from "@hermes/lib/voice-playback";
import { openCommandPalettePopup } from "@hermes/store/command-palette";
import { $cronJobs } from "@hermes/store/cron";
import { setSidebarOpen } from "@hermes/store/layout";
import { $activeGatewayProfile, $profiles, selectProfile } from "@hermes/store/profile";
import { cancelCanvasChat, submitCanvasChat } from "@hermes/store/quick-entry";
import {
    $activeSessionId,
    $connection,
    $currentCwd,
    $currentModel,
    $currentProvider,
    $currentReasoningEffort,
    $messagingSessions,
    $sessions,
} from "@hermes/store/session";
import { $sessionStates, sessionTileDelegate } from "@hermes/store/session-states";
import { $subagentsBySession } from "@hermes/store/subagents";
import { $todosBySession } from "@hermes/store/todos";
import { Download, LoaderCircle, RotateCcw } from "lucide-react";
import { atom } from "nanostores";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureBrowserTab } from "./browser-tab-preview";
import { KronOSV2AgentFollowPauseEvent } from "./os-kronos-v2-agent-pointer-event";
import { describePenWorker, OSPenActivityPreview, type PenActivityRun } from "./os-pen-activity-preview";
import { preparePenAgentPrompt, readPenRunSettings } from "./os-pen-agent-prompt";
import { penComposerAttachments } from "./os-pen-attachments";
import { makePenCameraSync, type PenCamera, type PenViewport } from "./os-pen-camera";
import type { PenChatDockTab, PenMobileSelection } from "./os-pen-chat-dock-model";
import { makePenFrameClient, registerPenEditor } from "./os-pen-editor-bridge";
import "./os-pen-editor.css";
import { penDownload } from "./os-pen-export";
import { makePenSurfaceOccluders, penSurfaceCornerRadius } from "./os-pen-surface-occlusion";
import { penToolOutput } from "./os-pen-tool-output";
import { penVoiceSynthesizer } from "./os-pen-voice";
import { capturePenWidgetPreview } from "./os-pen-widget-preview";
import { makePenWidgetSync, type PenLiveWidget, type PenWidgetSnapshot } from "./os-pen-widgets";
import { updatePenTask, type PenTaskAction, type PenTaskGroup } from "./pen-task-history";
import { getWorkspaceSurfaceModeProvider } from "./workspace-surface-runtime";

const EmptyWidgets: PenLiveWidget[] = [];
const ChatImageViewer = lazy(() =>
    import("@/app/view/preview/preview-streaming").then(({ StreamingImagePreview }) => ({
        default: StreamingImagePreview,
    }))
);
const OSPenChatDock = lazy(() =>
    import("./os-pen-chat-dock").then(({ OSPenChatDock }) => ({ default: OSPenChatDock }))
);

export function OSPenEditor({
    tabId,
    kronosV2 = false,
    presenting = false,
    visible,
    camera,
    onCamera,
    onViewport,
    onCanvasInteraction,
    widgets = EmptyWidgets,
    onWidgets,
    onWidgetInteract,
    onWidgetsReady,
    context,
    onWorkspaceAction,
    onRenderLibrary,
    onOverlay,
    onPresentation,
    onToolsSlot,
    onSystemControlsSlot,
    onRenderControlsSlot,
    onIslandControlsSlot,
    onWidgetControlsSlot,
    chatDockTabs,
    chatDockFocus,
    onChatDockActive,
    onOpenActivityWidget,
    onFullChat,
}: {
    chatDockTabs?: PenChatDockTab[];
    chatDockFocus?: { id: string; background?: boolean };
    onChatDockActive?: (id: string | undefined) => void;
    onOpenActivityWidget?: (id: string) => boolean;
    onFullChat?: (active: boolean) => void;
    context?: Record<string, unknown>;
    onRenderLibrary?: (library: string) => void;
    onWorkspaceAction?: (workspaceId?: string) => void;
    onRenderControlsSlot?: (slot: HTMLElement | null) => void;
    onIslandControlsSlot?: (slot: HTMLElement | null) => void;
    onWidgetControlsSlot?: (slot: HTMLElement | null) => void;
    onSystemControlsSlot?: (slot: HTMLElement | null) => void;
    onToolsSlot?: (slot: HTMLElement | null) => void;
    onOverlay?: (open: boolean) => void;
    onPresentation?: (active: boolean, blockId?: string) => void;
    tabId: string;
    kronosV2?: boolean;
    presenting?: boolean;
    visible: boolean;
    camera?: PenCamera;
    onCamera?: (camera: PenCamera) => void;
    onViewport?: (viewport: PenViewport) => void;
    onCanvasInteraction?: () => void;
    widgets?: PenLiveWidget[];
    onWidgets?: (snapshot: PenWidgetSnapshot) => void;
    onWidgetInteract?: (blockId: string) => void;
    onWidgetsReady?: (ready: boolean) => void;
}) {
    const appearance = useSystemAppearance();
    const [activityRuns, setActivityRuns] = useState(new Map<string, PenActivityRun>());
    const workerSessions = useRef(new Map<string, string>()).current;
    const [taskGroups, setTaskGroups] = useState<PenTaskGroup[]>([]);
    const dockTabsRef = useRef(chatDockTabs);
    dockTabsRef.current = chatDockTabs;
    const mobileSelection = useRef<PenMobileSelection>(null);
    const setMobileSelection = useCallback((selection: PenMobileSelection | null) => {
        mobileSelection.current = selection;
    }, []);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const presentationChromeRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");
    const [nativeOverlay, setNativeOverlay] = useState(false);
    const [commands, setCommands] = useState<PenCanvasCommand[]>([]);
    const [attempt, setAttempt] = useState(0);
    const cancelPenVoice = useRef<() => void>(null);
    const clientRef = useRef<ReturnType<typeof makePenFrameClient>>(null);
    const cameraSyncRef = useRef<ReturnType<typeof makePenCameraSync>>(null);
    const widgetSyncRef = useRef<ReturnType<typeof makePenWidgetSync>>(null);
    const lastSurfaceChange = useRef(0);
    const current = useRef({
        camera,
        visible,
        onCamera,
        onViewport,
        onCanvasInteraction,
        widgets,
        onWidgets,
        onWidgetInteract,
        onWidgetsReady,
        onWorkspaceAction,
        onRenderLibrary,
        onOverlay,
        onPresentation,
        onToolsSlot,
        onSystemControlsSlot,
        onRenderControlsSlot,
        onIslandControlsSlot,
    });
    current.current = {
        camera,
        visible,
        onCamera,
        onViewport,
        onCanvasInteraction,
        widgets,
        onWidgets,
        onWidgetInteract,
        onWidgetsReady,
        onWorkspaceAction,
        onRenderLibrary,
        onOverlay,
        onPresentation,
        onToolsSlot,
        onSystemControlsSlot,
        onRenderControlsSlot,
        onIslandControlsSlot,
    };
    const [src] = useState(() => {
        const url = new URL("./pen/editor/index.html", document.baseURI);
        url.searchParams.set("workspace", kronosV2 ? `kronos-v2:${tabId}` : tabId);
        url.searchParams.set("theme", appearance.colorScheme);
        if (import.meta.env.DEV) {
            const launch = new URLSearchParams(location.search);
            for (const key of ["compareAgent", "compareStart", "compareProject"]) {
                if (launch.has(key)) url.searchParams.set(key, launch.get(key));
            }
        }
        return url.href;
    });

    useEffect(() => {
        const frame = frameRef.current?.contentWindow;
        if (!frame) return;
        setStatus("loading");
        setError("");
        setCommands([]);
        setNativeOverlay(false);
        current.current.onOverlay?.(false);
        current.current.onPresentation?.(false);
        const frameUrl = new URL(src);
        // Electron serializes file-frame message origins as "null", while URL.origin returns "file://".
        const origin = frameUrl.protocol === "file:" ? "null" : frameUrl.origin;
        const client = makePenFrameClient(frame, origin);
        const stageBrowserSelection = (event: Event) => {
            const detail = (event as CustomEvent<BrowserChatSelectionRequest>).detail;
            if (!kronosV2 || !current.current.visible || detail.stage) return;
            detail.stage = client.request("stage_chat_selection", detail.selection);
        };
        window.addEventListener(BrowserChatSelectionEvent, stageBrowserSelection);
        let islandControlsSlot: HTMLElement;
        clientRef.current = client;
        const sync =
            current.current.camera &&
            makePenCameraSync({
                camera: current.current.camera,
                apply: (next) => client.request("set_camera", next),
                onCamera: (next) => current.current.onCamera?.(next),
                onViewport: (next) => current.current.onViewport?.(next),
                onError: (failure) => {
                    setError(failure instanceof Error ? failure.message : "Could not connect the workspace camera.");
                    widgetSyncRef.current?.pause();
                    setStatus("error");
                },
            });
        cameraSyncRef.current = sync;
        current.current.onWidgetsReady?.(false);
        const widgetSync = makePenWidgetSync({
            widgets: current.current.widgets,
            apply: (next) => client.request("sync_widgets", { widgets: next }),
            onWidgets: (snapshot) => current.current.onWidgets?.(snapshot),
            onReady: (ready) => current.current.onWidgetsReady?.(ready),
            onError: (failure) => {
                setError(failure instanceof Error ? failure.message : "Could not connect live widgets to the canvas.");
                setStatus("error");
            },
        });
        widgetSyncRef.current = widgetSync;
        let unregister: (() => void) | undefined;
        let connected = false;
        let activeAgentRequest: (() => void) | undefined;
        let stopAgent: ((id: string) => void) | undefined;
        const timeout = setTimeout(() => {
            setStatus("error");
            setError("The canvas did not finish starting. Retry to reconnect your saved workspace.");
        }, 45000);
        const receiveSurface = (message: { type: string; active?: boolean; blockId?: string | null }) => {
            if (message.type === "camera" || message.type === "widgets") lastSurfaceChange.current = performance.now();
            if (message.type === "camera") sync?.receive(message);
            if (message.type === "presentation")
                current.current.onPresentation?.(message.active === true, message.blockId ?? undefined);
            if (message.type === "widgets") widgetSync.receive(message);
            if (
                message.type === "widget-interact" &&
                (message.blockId === null ||
                    current.current.widgets.some((widget) => widget.blockId === message.blockId && widget.visible))
            )
                current.current.onWidgetInteract?.(message.blockId);
        };
        const iframe = frameRef.current;
        const receiveSurfaceEvent = (event: Event) => {
            const message = (event as CustomEvent).detail;
            if (!message || !current.current.visible) return;
            event.preventDefault();
            receiveSurface(message);
        };
        let historyRequest = 0;
        let openableHistoryIds = new Map<string, string>();
        const openedHistory = new Map<string, string>();
        const readText = (message: ChatMessage) =>
            message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
        const publishHistory = async (requestId: number, query: string) => {
            historyRequest = requestId;
            const term = query;
            const sessions = $sessions.get();
            const archived = new Set(sessions.filter((session) => session.archived).map((session) => session.id));
            const titles = new Map(
                sessions.map((session) => [
                    session.id,
                    session.title?.trim() || session.preview?.trim() || "Untitled chat",
                ])
            );
            const rows = new Map<string, string>();
            for (const session of sessions) {
                if (session.archived || !session.message_count) continue;
                if (sessionMatchesSearch(session, term)) rows.set(session.id, titles.get(session.id));
            }
            let error: string;
            if (term) {
                try {
                    const { results } = await searchSessions(query);
                    for (const match of results) {
                        if (!rows.has(match.session_id) && !archived.has(match.session_id))
                            rows.set(
                                match.session_id,
                                titles.get(match.session_id) || match.snippet || "Untitled chat"
                            );
                    }
                } catch {
                    error = "Could not search earlier Kron Agent sessions.";
                }
            }
            if (historyRequest !== requestId || !current.current.visible) return;
            const visibleRows = [...rows].slice(0, 50).map(([id, title]) => ({ id, title }));
            openableHistoryIds = new Map(visibleRows.map(({ id, title }) => [id, title]));
            void client.request("hermes_history_results", { requestId, rows: visibleRows, error }).catch(() => {});
        };
        let botTitles = new Map<string, string>();
        const loadBots = async () => {
            try {
                const { listBotRoster } = await import("@hermes/plugins/bots/upstream/hermes-bot-mode.js");
                const rows = await listBotRoster();
                if (!current.current.visible) return;
                botTitles = new Map(rows.map(({ id, title }) => [id, title]));
                await client.request("set_bot_roster", { rows });
            } catch {
                void client.request("set_bot_roster", { error: "Could not load Hermes bots." }).catch(() => {});
            }
        };
        const openHistory = async (
            requestId: number,
            title: string,
            getId: () => Promise<string>,
            conversationId?: string
        ) => {
            const send = (payload: object) =>
                conversationId
                    ? client.request("resume_hermes_chat", { conversationId, ...payload })
                    : client.request("hermes_history_opened", { requestId, ...payload }).catch(() => {});
            try {
                const delegate = sessionTileDelegate();
                if (!delegate) throw new Error("Kron Agent is still connecting.");
                const sessionId = await getId();
                const runtimeId = await delegate.resumeTile(sessionId);
                const state = $sessionStates.get()[runtimeId];
                if (!state) throw new Error("Could not load the Hermes conversation.");
                const messages = state.messages.flatMap((message): object[] => {
                    if (message.hidden) return [];
                    return message.parts.flatMap((part, index): object[] => {
                        const createdAt = (part.timestamp ?? message.timestamp ?? Date.now() / 1000) * 1000;
                        if (part.type === "tool-call") {
                            return [
                                {
                                    id: part.toolCallId,
                                    role: "tool",
                                    status: "final",
                                    createdAt,
                                    toolUse: {
                                        name: part.toolName,
                                        toolUseId: part.toolCallId,
                                        input: part.args,
                                        output: penToolOutput(part.result, part.isError),
                                        isError: part.isError,
                                    },
                                },
                            ];
                        }
                        if (
                            part.type !== "text" ||
                            !part.text ||
                            (message.role !== "user" && message.role !== "assistant")
                        )
                            return [];
                        return [
                            {
                                id: `${message.id}:${index}`,
                                role: message.role,
                                text: part.text,
                                status: "final",
                                createdAt,
                            },
                        ];
                    });
                });
                openedHistory.set(sessionId, runtimeId);
                await send({ sessionId, title, messages });
            } catch (error) {
                const message = error instanceof Error ? error.message : "Could not open chat.";
                if (conversationId) throw new Error(message);
                await send({ error: message });
            }
        };
        let workflowIds = new Set<string>();
        let workflowsPending = false;
        const loadWorkflows = async () => {
            if (workflowsPending) return;
            workflowsPending = true;
            try {
                let state = await runN8nWorkspaceCommand<N8nRuntimeState>("state");
                if (!state.running && state.occupiedGeneration == null && current.current.visible) {
                    window.dispatchEvent(new CustomEvent("kronterm:workflow-prepare", { detail: { tabId } }));
                    await runN8nWorkspaceCommand("open", { surface: "canvas", workflowId: state.selectedWorkflowId });
                    state = await runN8nWorkspaceCommand<N8nRuntimeState>("state");
                }
                const workflows = state.running
                    ? await runN8nWorkspaceCommand<N8nRuntimeState["workflows"]>("workflows")
                    : (state.workflows ?? []);
                workflowIds = new Set(workflows.map(({ id }) => id));
                await client.request("set_workflow_library", { ...state, workflows });
            } catch {
                void client
                    .request("set_workflow_library", { error: "Could not load KronFlow workflows." })
                    .catch(() => {});
            } finally {
                workflowsPending = false;
            }
        };
        const telegramSessions = () => {
            const sessions = new Map<string, ReturnType<typeof $sessions.get>[number]>();
            for (const session of [...$sessions.get(), ...$messagingSessions.get()]) {
                if (!session.archived && normalizeSessionSource(session.source) === "telegram")
                    sessions.set(session.id, session);
            }
            return [...sessions.values()].sort((a, b) => b.last_active - a.last_active);
        };
        const syncHistoryExtras = () => {
            if (!connected || !current.current.visible) return;
            const telegram = telegramSessions()
                .slice(0, 30)
                .map(({ id, title, preview }) => ({
                    id,
                    title: title?.trim() || preview?.trim() || "Telegram conversation",
                }));
            const jobs = $cronJobs.get().map(({ id, name, next_run_at, enabled }) => ({
                id,
                title: name || "Scheduled job",
                nextRun: next_run_at,
                enabled,
            }));
            const profiles = $profiles.get().map(({ name, is_default }) => ({
                id: name,
                title: is_default ? "Hermes" : name,
            }));
            void client
                .request("set_history_extras", {
                    telegram,
                    jobs,
                    profiles,
                    activeProfile: $activeGatewayProfile.get(),
                })
                .catch(() => {});
        };
        const offHistoryExtras = [$sessions, $messagingSessions, $cronJobs, $profiles, $activeGatewayProfile].map(
            (store) => store.listen(syncHistoryExtras)
        );
        let directories: string[] = [];
        let fileRows: Awaited<ReturnType<typeof readDesktopDir>>["entries"] = [];
        let fileRequest = 0;
        const publishFiles = (payload: Record<string, unknown>) =>
            client.request("set_file_panel", payload).catch(() => {});
        const browseFiles = async (action: string, index: number) => {
            const request = ++fileRequest;
            try {
                if (action === "open") {
                    const file = fileRows[index];
                    if (!file) return;
                    if (!file.isDirectory) {
                        const document = await readDesktopFileText(file.path);
                        if (request === fileRequest && current.current.visible) {
                            await publishFiles({
                                preview: {
                                    title: file.name,
                                    text: document.binary ? "This file is binary." : document.text.slice(0, 16000),
                                },
                            });
                        }
                        return;
                    }
                    directories = [...directories, file.path];
                } else if (action === "up") {
                    directories = directories.slice(0, Math.max(1, directories.length - 1));
                }
                if (!directories.length) {
                    const root =
                        $currentCwd.get()?.trim() ||
                        (
                            await window.hermesDesktop.api<{ cwd: string }>({
                                path: "/api/fs/default-cwd",
                                profile: desktopFsProfile(),
                            })
                        ).cwd;
                    if (request !== fileRequest) return;
                    if (!root) throw new Error("No workspace folder is available.");
                    directories = [root];
                }
                const { entries, error } = await readDesktopDir(directories.at(-1));
                if (request !== fileRequest || !current.current.visible) return;
                if (error) throw new Error(error);
                fileRows = entries;
                await publishFiles({
                    path: directories.at(-1),
                    canGoUp: directories.length > 1,
                    rows: fileRows.map(({ name, isDirectory }) => ({ name, isDirectory })),
                });
            } catch (error) {
                if (request === fileRequest && current.current.visible)
                    await publishFiles({
                        error: error instanceof Error ? error.message : "Could not read workspace files.",
                    });
            }
        };
        const syncInspector = () => {
            if (connected && current.current.visible)
                void client.request("set_workspace_inspector", { open: $krontermInspectorOpen.get() }).catch(() => {});
        };
        const offInspector = $krontermInspectorOpen.listen(syncInspector);
        const resetFileScope = () => {
            directories = [];
            fileRows = [];
            fileRequest++;
            if (current.current.visible && $krontermInspectorOpen.get()) void browseFiles("list", -1);
        };
        const offFileScope = [$currentCwd.listen(resetFileScope), $connection.listen(resetFileScope)];
        const sessionForComposer = (id: string) =>
            id.startsWith("hermes:") ? openedHistory.get(id.slice(7)) : $activeSessionId.get();
        let pendingVoicePrompt: { conversationId: string; prompt: string; expires: number };
        type PenReply = { id: string; pending: boolean; text: string };
        type PenMessage = { role: "user" | "assistant"; content: string };
        const voiceReplies = new Map<string, ReturnType<typeof atom<PenReply>>>();
        const experimentTurns = new Map<string, PenMessage[]>();
        const openPenDialog = (detail: PenDialogRequest) =>
            window.dispatchEvent(new CustomEvent("kronos:pen-dialog", { detail }));
        const voiceAction = (conversationId: string, action: PenVoiceRequest["action"]) => {
            const runtimeId = conversationId.startsWith("hermes:") ? sessionForComposer(conversationId) : undefined;
            if (action !== "cancel" && conversationId.startsWith("hermes:") && !runtimeId) return;
            if (action === "conversation") {
                primeVoicePlayback();
                if (!voiceReplies.has(conversationId)) voiceReplies.set(conversationId, atom<PenReply>(null));
            }
            if (action === "cancel") {
                pendingVoicePrompt = undefined;
                if (conversationId) voiceReplies.delete(conversationId);
                else voiceReplies.clear();
            }
            window.dispatchEvent(
                new CustomEvent<PenVoiceRequest>(PenVoiceEvent, {
                    detail: {
                        tabId,
                        conversationId,
                        runtimeId,
                        action,
                        reply: voiceReplies.get(conversationId),
                        synthesize: penVoiceSynthesizer(getApi()?.audioPenTinyVoca),
                        orbMount: () => {
                            const editor = iframe.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
                            return Array.from(
                                editor?.contentDocument?.querySelectorAll<HTMLElement>("[data-kronos-pen-voice-orb]") ??
                                    []
                            ).find(
                                (mount) =>
                                    mount.dataset.kronosPenVoiceOrb === conversationId &&
                                    mount.closest("[data-kronos-pen-voice-panel][data-active]")
                            );
                        },
                        publish: async (update) => {
                            const pending = update.prompt
                                ? { conversationId, prompt: update.prompt.trim(), expires: performance.now() + 3000 }
                                : undefined;
                            if (pending) pendingVoicePrompt = pending;
                            try {
                                const result = await client.request("composer_voice_update", {
                                    conversationId,
                                    ...update,
                                });
                                if (
                                    pending &&
                                    pendingVoicePrompt === pending &&
                                    (result as { success?: boolean })?.success !== true
                                )
                                    pendingVoicePrompt = undefined;
                                return result;
                            } catch (error) {
                                if (pending && pendingVoicePrompt === pending) pendingVoicePrompt = undefined;
                                throw error;
                            }
                        },
                    },
                })
            );
        };
        const updateSandbox = async (conversationId: string, action: string, desktopId: string, mode: unknown) => {
            const bridge = window.hermesDesktop?.krontermSurfaces;
            const manager = bridge?.computerManager;
            const send = (payload: object) =>
                client.request("composer_sandbox_update", { conversationId, ...payload }).catch(() => {});
            try {
                if (!manager || !bridge.openMachines) throw new Error("Sandbox computers are unavailable.");
                const runtimeId = sessionForComposer(conversationId);
                if (conversationId.startsWith("hermes:") && !runtimeId)
                    throw new Error("Reopen this Hermes chat first.");
                const storedId = $sessionStates.get()[runtimeId]?.storedSessionId;
                const sessionIds = [...new Set([runtimeId, storedId].filter(Boolean))];
                const desktops = await manager.desktops();
                if (!current.current.visible) return;
                const desktop = desktops.find(({ id }) => id === desktopId);
                if (action === "select") {
                    if (!desktop || desktop.status === "unavailable") throw new Error("This computer is unavailable.");
                    if ($connection.get()?.mode === "remote")
                        throw new Error("Computer mode requires local Kron Agent.");
                    if (
                        runtimeId?.startsWith("kronoscode:") ||
                        runtimeId?.startsWith("openmausbot:") ||
                        (window.hermesDesktop?.agentBackends?.getActive?.() || "hermes") !== "hermes"
                    )
                        throw new Error("Computer mode requires Kron Agent.");
                    if ($sessionStates.get()[runtimeId]?.busy) throw new Error("Wait for the active turn to finish.");
                    if (desktop.imagePrepared || desktop.status === "running") {
                        $sandboxComputerAccess.set(
                            await manager.access({
                                enabled: true,
                                desktopId,
                                mode: mode === "hybrid" ? "hybrid" : "sandbox",
                                startIfStopped: true,
                                sessionIds,
                            })
                        );
                    }
                    const result = await bridge.openMachines("desktop", false, desktopId);
                    if (!result.ok) throw new Error(result.error);
                } else if (action === "disable") {
                    if ($sessionStates.get()[runtimeId]?.busy) throw new Error("Wait for the active turn to finish.");
                    $sandboxComputerAccess.set(await manager.access({ enabled: false, sessionIds }));
                }
                const access = await manager.access({ sessionIds });
                await send({
                    access,
                    desktops: desktops.map(({ id, name, status, imagePrepared }) => ({
                        id,
                        name,
                        status,
                        imagePrepared,
                    })),
                });
            } catch (error) {
                await send({ error: error instanceof Error ? error.message : "Could not open the sandbox selector." });
            }
        };
        const cancelVoice = () => voiceAction("", "cancel");
        cancelPenVoice.current = cancelVoice;
        const receive = (event: MessageEvent) => {
            if (!client.receive(event)) return;
            const type = event.data.type ?? event.data.event;
            if (type === "ready" && !connected) {
                connected = true;
                syncHistoryExtras();
                syncInspector();
                clearTimeout(timeout);
                setStatus("ready");
                if (current.current.visible) sync?.start();
                widgetSync.start();
                unregister?.();
                unregister = registerPenEditor(tabId, client.request);
                void client
                    .request("get_commands")
                    .then((snapshot: { commands?: PenCanvasCommand[] }) => {
                        if (Array.isArray(snapshot?.commands)) setCommands(snapshot.commands);
                    })
                    .catch(() => {});
            }
            if (type === "commands-changed" && Array.isArray(event.data.commands)) setCommands(event.data.commands);
            if (type === "command-palette-open") openCommandPalettePopup();
            if (type === "ready" || type === "tools-slot") {
                const engine = frameRef.current?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
                current.current.onToolsSlot?.(
                    engine?.contentDocument?.querySelector("[data-kronos-pen-tools]") ?? null
                );
            }
            if (current.current.visible && type === "workflow-library-load") void loadWorkflows();
            if (current.current.visible && type === "workflow-library-open") {
                const { workflowId } = event.data;
                if (workflowIds.has(workflowId)) {
                    void runN8nWorkspaceCommand("open", { surface: "canvas", workflowId })
                        .then(() => {
                            window.dispatchEvent(
                                new CustomEvent("kronterm:workflow-open", {
                                    detail: { tabId, surface: "canvas", focusWorkflow: true, workflowId },
                                })
                            );
                        })
                        .catch(() => {
                            void client
                                .request("set_workflow_library", { error: "Could not open this workflow." })
                                .catch(() => {});
                        });
                }
            }
            if (current.current.visible && type === "render-library-open" && typeof event.data.library === "string")
                current.current.onRenderLibrary?.(event.data.library);
            if (type === "ready" || type === "render-controls-slot") {
                const engine = iframe?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
                current.current.onRenderControlsSlot?.(
                    engine?.contentDocument?.querySelector("[data-kronos-pen-render-controls]") ?? null
                );
                if (current.current.onIslandControlsSlot) {
                    const inspector = engine?.contentDocument?.getElementById("kronos-pen-workspace-inspector");
                    if (inspector && islandControlsSlot?.parentElement !== inspector) {
                        islandControlsSlot?.remove();
                        islandControlsSlot = inspector.ownerDocument.createElement("div");
                        islandControlsSlot.style.display = "contents";
                        inspector.prepend(islandControlsSlot);
                    }
                    current.current.onIslandControlsSlot(inspector ? islandControlsSlot : null);
                }
            }
            if (type === "files-panel-action" && current.current.visible && $krontermInspectorOpen.get()) {
                const { action, index } = event.data;
                if (action === "list" || action === "up" || (action === "open" && Number.isSafeInteger(index)))
                    void browseFiles(action, index);
            }
            if (type === "ready" || type === "system-controls-slot") {
                const engine = iframe?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
                current.current.onSystemControlsSlot?.(
                    engine?.contentDocument?.querySelector("[data-kronos-pen-system-controls]") ?? null
                );
            }
            if (current.current.visible && type === "history-extras-ready") syncHistoryExtras();
            if (current.current.visible && type === "history-profile-select") {
                const { profile } = event.data;
                if (profile !== $activeGatewayProfile.get() && $profiles.get().some(({ name }) => name === profile))
                    selectProfile(profile);
            }
            if (current.current.visible && type === "history-cron-open") {
                const { jobId } = event.data;
                if ($cronJobs.get().some(({ id }) => id === jobId))
                    window.dispatchEvent(new CustomEvent(PenHistoryToolEvent, { detail: { tool: "cron", jobId } }));
            }
            if (current.current.visible && type === "history-telegram-open") {
                const { sessionId, requestId } = event.data;
                const session = telegramSessions().find(({ id }) => id === sessionId);
                if (session && Number.isSafeInteger(requestId))
                    void openHistory(
                        requestId,
                        session.title || session.preview || "Telegram conversation",
                        async () => sessionId
                    );
            }
            if (type === "history-tool-open" && current.current.visible && typeof event.data.tool === "string")
                window.dispatchEvent(new CustomEvent(PenHistoryToolEvent, { detail: event.data.tool }));
            if (type === "workspace-navigation" && current.current.visible) {
                const { mode } = event.data;
                if (mode === "sessions" || mode === "workflows" || mode === "comfy" || mode === "design") {
                    $workflowSidebarMode.set(mode);
                    setSidebarOpen(true);
                }
            }
            if (type === "hermes-history-search" && current.current.visible) {
                const { requestId, query } = event.data;
                if (Number.isSafeInteger(requestId) && typeof query === "string" && query.length <= 200)
                    void publishHistory(requestId, query.trim());
            }
            if (type === "hermes-history-open" && current.current.visible) {
                const { sessionId, requestId } = event.data;
                if (!Number.isSafeInteger(requestId) || !openableHistoryIds.has(sessionId)) return;
                void openHistory(requestId, openableHistoryIds.get(sessionId), async () => sessionId);
            }
            if (type === "bot-roster-load" && current.current.visible) void loadBots();
            if (type === "bot-roster-open" && current.current.visible) {
                const { botId, requestId } = event.data;
                if (!Number.isSafeInteger(requestId) || !botTitles.has(botId)) return;
                void openHistory(requestId, botTitles.get(botId), async () => {
                    const { openBotConversation } = await import("@hermes/plugins/bots/upstream/hermes-bot-mode.js");
                    return openBotConversation(botId);
                });
            }
            if (type === "composer-voice" && current.current.visible) {
                const { conversationId, action } = event.data;
                if (
                    typeof conversationId === "string" &&
                    (action === "conversation" || action === "dictation" || action === "cancel")
                )
                    voiceAction(conversationId, action);
            }
            if (type === "close-workspace-inspector" && current.current.visible) $krontermInspectorOpen.set(false);
            if (type === "subagent-theater" && current.current.visible) {
                const { conversationId, workerId } = event.data;
                if (typeof conversationId !== "string" || typeof workerId !== "string") return;
                const sessionId = workerSessions.get(conversationId) ?? sessionForComposer(conversationId);
                if (sessionId) openPenDialog({ kind: "subagents", sessionId, workerId });
            }
            if (type === "composer-complete" && current.current.visible) {
                const { conversationId, requestId, trigger, query } = event.data;
                if (
                    typeof conversationId !== "string" ||
                    typeof requestId !== "number" ||
                    (trigger !== "/" && trigger !== "@") ||
                    typeof query !== "string" ||
                    query.length > 512
                )
                    return;
                const sessionId = sessionForComposer(conversationId);
                if (conversationId.startsWith("hermes:") && !sessionId) return;
                window.dispatchEvent(
                    new CustomEvent("kronos:pen-composer-complete", {
                        detail: {
                            trigger,
                            query,
                            sessionId,
                            publish: (items: unknown) => {
                                void client
                                    .request("composer_completions", { conversationId, requestId, items })
                                    .catch(() => {});
                            },
                        },
                    })
                );
            }
            if (type === "composer-sandbox" && current.current.visible) {
                const { conversationId, action, desktopId, mode } = event.data;
                if (
                    typeof conversationId === "string" &&
                    (action === "list" || action === "select" || action === "disable")
                )
                    void updateSandbox(conversationId, action, desktopId, mode);
            }
            if (type === "agent-stop" && typeof event.data.requestId === "string") stopAgent?.(event.data.requestId);
            if (type === "agent-prompt") {
                const { requestId, prompt, conversationId, imageReview } = event.data;
                if (typeof requestId !== "string" || typeof prompt !== "string") return;
                const submittedAt = performance.now();
                let agentLabel = "Hermes";
                let reportedFirstText = false;
                const comparison = import.meta.env.DEV && new URLSearchParams(location.search).has("compareAgent");
                const penVoice =
                    pendingVoicePrompt != null &&
                    pendingVoicePrompt.conversationId === conversationId &&
                    pendingVoicePrompt.prompt === prompt.trim() &&
                    pendingVoicePrompt.expires > performance.now();
                if (penVoice || pendingVoicePrompt?.expires <= performance.now()) pendingVoicePrompt = undefined;
                type ToolUpdate = {
                    id: string;
                    name: string;
                    done: boolean;
                    input?: unknown;
                    output?: ReturnType<typeof penToolOutput>;
                    failed?: boolean;
                };
                type AgentUpdate = { done: boolean; text?: string; error?: string; start?: boolean; tool?: ToolUpdate };
                let updates: AgentUpdate[] = [];
                let flushTimer: ReturnType<typeof setTimeout>;
                const flush = () => {
                    clearTimeout(flushTimer);
                    flushTimer = undefined;
                    if (updates.length === 0) return;
                    const batch = updates;
                    updates = [];
                    void client
                        .request("agent_reply", { requestId, updates: batch, agent: agentLabel })
                        .catch(() => {});
                };
                const spoken = penVoice ? voiceReplies.get(conversationId) : undefined;
                let spokenText = "";
                let spokenPrefix = "";
                let spokenSnapshot = "";
                const reply = (update: AgentUpdate) => {
                    if (!reportedFirstText && update.text?.trim() && typeof conversationId === "string") {
                        reportedFirstText = true;
                        if (comparison)
                            getApi().sendLog(
                                `[Pen comparison] ${agentLabel} first text ${Math.round(performance.now() - submittedAt)}ms`
                            );

                        if (import.meta.env.DEV)
                            void client
                                .request("composer_agent_timing", {
                                    conversationId,
                                    agent: agentLabel,
                                    milliseconds: Math.round(performance.now() - submittedAt),
                                })
                                .catch(() => {});
                    }
                    if (spoken) {
                        if (update.start && spokenSnapshot) spokenPrefix = spokenText + " ";
                        if (update.text) {
                            spokenSnapshot = update.text;
                            spokenText = spokenPrefix + spokenSnapshot;
                        }
                        spoken.set({
                            id: requestId,
                            pending: !update.done,
                            text:
                                spokenText ||
                                (update.error && update.error !== "Stopped."
                                    ? "I couldn't complete that request."
                                    : ""),
                        });
                    }
                    const last = updates.at(-1);
                    if (!update.done && update.text && !update.start && last?.text && !last.done) {
                        last.text = update.text;
                    } else {
                        updates.push(update);
                    }
                    if (update.done) {
                        if (comparison)
                            getApi().sendLog(
                                `[Pen comparison] ${agentLabel} ${update.error ? "failed" : "finished"} ${Math.round(performance.now() - submittedAt)}ms ${update.error ?? ""}`
                            );
                        flush();
                    } else flushTimer ??= setTimeout(flush, 16);
                };
                let attachments: ReturnType<typeof penComposerAttachments>;
                try {
                    attachments = penComposerAttachments(event.data.files);
                } catch (error) {
                    reply({ done: true, error: error instanceof Error ? error.message : String(error) });
                    return;
                }
                if (attachments.length && SLASH_COMMAND_RE.test(prompt.trim())) {
                    reply({ done: true, error: "Send attachments with a chat message, not a slash command." });
                    return;
                }
                if (imageReview && SLASH_COMMAND_RE.test(prompt.trim())) {
                    reply({ done: true, error: "Send image comments with a chat message." });
                    return;
                }
                if (
                    !current.current.visible ||
                    (!prompt.trim() && !attachments.length) ||
                    prompt.length > 32000 ||
                    activeAgentRequest
                ) {
                    reply({ done: true, error: "Open the canvas and wait for the current request to finish." });
                    return;
                }
                if (spoken) spoken.set({ id: requestId, pending: true, text: "" });
                const controller = new AbortController();
                const slash = SLASH_COMMAND_RE.test(prompt.trim());
                const { designs } = readPenRunSettings(event.data.options);
                const designCount = slash ? 1 : designs;
                let design = 1;
                let displayPrompt = prompt;
                let selection = mobileSelection.current;
                const fullChat =
                    frameRef.current?.contentDocument
                        ?.querySelector<HTMLIFrameElement>("#pen-editor")
                        ?.contentDocument?.documentElement.hasAttribute("data-kronos-full-chat") ?? false;
                const makeAgentPrompt = () => {
                    if (slash) return prompt.trim();
                    const text = preparePenAgentPrompt(
                        prompt.trim() || "Review the attached files.",
                        event.data.options,
                        selection,
                        fullChat,
                        design,
                        penVoice
                    );
                    const project = comparison ? new URLSearchParams(location.search).get("compareProject") : null;
                    if (project) {
                        const target =
                            new URLSearchParams(location.search).get("compareAgent") === "sequential"
                                ? project + "/hermes/project"
                                : project;
                        return `For this comparison, work only in this absolute project directory: ${target}.\n\n${text}`;
                    }
                    if (!imageReview?.comments.length) return text;
                    return (
                        text +
                        "\n\nImage comments for " +
                        imageReview.filename +
                        ":\n" +
                        imageReview.comments
                            .map(
                                ({ number, x, y, text }: { number: number; x: number; y: number; text: string }) =>
                                    `${number}. (x: ${x.toFixed(1)}%, y: ${y.toFixed(1)}%) ${text}`
                            )
                            .join("\n")
                    );
                };
                let agentPrompt = makeAgentPrompt();
                const existingTabs = new Set((dockTabsRef.current ?? []).map(({ id }) => id));
                const tools = new Map<string, boolean>();
                let showWrittenFile = Promise.resolve();
                let workerSnapshot = "";
                let mainStatus: "running" | "completed" | "failed" = "running";
                let mainDetail = "";
                let mainTool = "";
                let mainToolImage: string;
                let mainBrowserBlock: string;
                let browserPreview = Promise.resolve();
                const preparedBrowserBlocks = new Set<string>();
                const surfaces = new Map<string, SubagentSurfaceSnapshot>();
                const subscriptions = new Map<string, { key: string; stop: () => void }>();
                let relayTimer: ReturnType<typeof setTimeout>;
                const scheduleWorkers = () => {
                    relayTimer ??= setTimeout(() => {
                        relayTimer = undefined;
                        relayWorkers();
                    }, 80);
                };
                const previousTodos = $todosBySession.get();
                let transcriptTodos: TodoItem[] | null = null;
                let retainedTodos: TodoItem[] | undefined;
                const taskTitle =
                    prompt.startsWith("The user is in KronOS full chat.") && prompt.includes("\nUser request:\n")
                        ? prompt.slice(prompt.lastIndexOf("\nUser request:\n") + "\nUser request:\n".length).trim()
                        : prompt.trim();
                const recordTask = (action?: PenTaskAction) => {
                    const blockId = action?.blockId || mainBrowserBlock || surfaces.get("main")?.blockId;
                    if (!blockId && !action) return;
                    setTaskGroups((groups) =>
                        updatePenTask(
                            groups,
                            { id: requestId, title: taskTitle.slice(0, 160), status: mainStatus },
                            [...new Set([blockId, ...[...surfaces.values()].map((surface) => surface.blockId)])].filter(
                                (id) => id && !existingTabs.has(id)
                            ),
                            action
                        )
                    );
                };
                const relayWorkers = () => {
                    const bySession = $subagentsBySession.get();
                    const storedKey = sessionId ? $sessionStates.get()[sessionId]?.storedSessionId : undefined;
                    const workers = new Map(
                        (storedKey ? (bySession[storedKey] ?? []) : []).map((worker) => [worker.id, worker])
                    );
                    for (const worker of (sessionId ? bySession[sessionId] : undefined) ?? [])
                        workers.set(worker.id, worker);
                    const todoStore = $todosBySession.get();
                    const liveTodos =
                        sessionId && todoStore[sessionId] !== previousTodos[sessionId]
                            ? todoStore[sessionId]
                            : storedKey && todoStore[storedKey] !== previousTodos[storedKey]
                              ? todoStore[storedKey]
                              : undefined;
                    retainedTodos = liveTodos ?? transcriptTodos ?? retainedTodos;
                    const todos = retainedTodos;
                    const rows = [
                        {
                            id: "main",
                            goal: taskTitle.slice(0, 160),
                            status: mainStatus,
                            detail: mainDetail,
                            tool: mainTool,
                            sessionId,
                            swarm: false,
                        },
                        ...[...workers.values()]
                            .filter((worker) => worker.startedAt >= runStartedAt)
                            .slice(0, 12)
                            .map((worker) => describePenWorker(worker, runStartedAt)),
                    ]
                        .map(({ id, goal, status, detail, tool, sessionId, swarm }) => {
                            const live = status === "running";
                            const key = JSON.stringify([sessionId, live, swarm]);
                            const prior = subscriptions.get(id);
                            if ((sessionId || swarm) && prior?.key !== key) {
                                prior?.stop();
                                subscriptions.set(id, {
                                    key,
                                    stop: subscribeSubagentSurface(
                                        { id, sessionId, live, swarm, since: runStartedAt, capture: false },
                                        (surface) => {
                                            const previous = surfaces.get(id);
                                            surfaces.set(id, {
                                                ...surface,
                                                imageUrl:
                                                    surface.imageUrl ??
                                                    (!live && surface.targetKey === previous?.targetKey
                                                        ? previous?.imageUrl
                                                        : undefined),
                                            });
                                            scheduleWorkers();
                                        }
                                    ),
                                });
                            }
                            const surface = surfaces.get(id);
                            const imageUrl = id === "main" ? (mainToolImage ?? surface?.imageUrl) : surface?.imageUrl;
                            const blockId = (id === "main" ? mainBrowserBlock : undefined) || surface?.blockId;
                            return {
                                id,
                                goal,
                                status,
                                detail: detail || surface?.detail || "",
                                tool,
                                sessionId,
                                swarm,
                                since: runStartedAt,
                                ...(imageUrl ? { imageUrl } : {}),
                                ...(blockId ? { blockId } : {}),
                                ...(id === "main" && todos?.length ? { todos } : {}),
                            };
                        })
                        .filter(
                            (row) => row.id !== "main" || Boolean(row.blockId || row.imageUrl || row.todos?.length)
                        );
                    recordTask();
                    const snapshot = JSON.stringify([sessionId, storedKey, rows]);
                    if (snapshot === workerSnapshot) return;
                    workerSnapshot = snapshot;
                    if (typeof conversationId === "string") {
                        setActivityRuns((previous) => {
                            const next = new Map(previous);
                            next.delete(conversationId);
                            next.set(conversationId, { rows, sessionId, storedId: storedKey, since: runStartedAt });
                            if (next.size > 20) next.delete(next.keys().next().value);
                            return next;
                        });
                    }
                    void client
                        .request("agent_workers", {
                            requestId,
                            rows: rows.map(({ id, goal, status, detail, blockId, imageUrl, todos }) => ({
                                id,
                                goal,
                                status,
                                detail,
                                ...(blockId ? { blockId } : {}),
                                ...(imageUrl ? { imageUrl } : {}),
                                ...(todos ? { todos } : {}),
                            })),
                        })
                        .catch(() => {});
                };
                const runStartedAt = Date.now();
                const replyTool = (tool: ToolUpdate) => reply({ done: false, tool });
                let previous = new Set(
                    Object.values($sessionStates.get()).flatMap((state) => state.messages.map((message) => message.id))
                );
                const storedId = event.data.hermesSessionId;
                const delegate = storedId ? sessionTileDelegate() : null;
                const targetId = storedId ? openedHistory.get(storedId) : undefined;
                let userId: string;
                let sessionId: string;
                let lastState: ReturnType<typeof $sessionStates.get>[string];
                let lastText = "";
                let streamedAnswerId: string;
                let advancing = false;
                let stopping = false;
                let submission: Promise<unknown>;
                const finish = (result: { text?: string; error?: string }) => {
                    mainStatus = result.error ? "failed" : "completed";
                    if (!slash) relayWorkers();
                    reply({ done: true, ...result });
                    activeAgentRequest?.();
                    activeAgentRequest = undefined;
                };
                let deadline: ReturnType<typeof setTimeout>;
                const refreshDeadline = () => {
                    clearTimeout(deadline);
                    deadline = setTimeout(() => finish({ error: "The agent stopped sending updates to Pen." }), 180000);
                };
                refreshDeadline();
                let relayHermes = false;
                const relayTurn = (states: ReturnType<typeof $sessionStates.get>) => {
                    if (!relayHermes) return;
                    const runtimeId = sessionId ?? targetId ?? $activeSessionId.get();
                    const state = runtimeId == null ? undefined : states[runtimeId];
                    if (!state || state === lastState) return;
                    lastState = state;
                    const { messages } = state;
                    userId ??= messages.find(
                        (message) =>
                            message.role === "user" &&
                            !previous.has(message.id) &&
                            (slash ||
                                readText(message).trim() === displayPrompt.trim() ||
                                (targetId && readText(message) === agentPrompt))
                    )?.id;
                    const user = messages.findIndex((message) => message.id === userId);
                    if (user < 0) return;
                    sessionId = runtimeId;
                    if (typeof conversationId === "string" && workerSessions.get(conversationId) !== runtimeId) {
                        workerSessions.set(conversationId, runtimeId);
                        if (workerSessions.size > 20) workerSessions.delete(workerSessions.keys().next().value);
                    }
                    refreshDeadline();
                    const tail = messages.slice(user + 1);
                    const nextUser = tail.findIndex((message) => message.role === "user");
                    const turn = nextUser < 0 ? tail : tail.slice(0, nextUser);
                    transcriptTodos = latestSessionTodos(turn);
                    for (const message of turn) {
                        for (const part of message.parts) {
                            if (part.type !== "tool-call") continue;
                            const done = part.completedAt != null || part.result !== undefined;
                            mainTool = part.toolName.replaceAll("_", " ");
                            const targetsWidget =
                                /(?:^|_)(?:browser_.*|workspace_focus_widget|workspace_open_file|widget_.*)$/.test(
                                    part.toolName
                                );
                            if (targetsWidget) {
                                const args = part.args as { blockId?: unknown; blockid?: unknown };
                                const target = args?.blockId ?? args?.blockid;
                                if (typeof target === "string") mainBrowserBlock = target.replace(/^block:/, "");
                            }
                            const previous = tools.get(part.toolCallId);
                            if (previous === undefined) {
                                replyTool({ id: part.toolCallId, name: part.toolName, done: false, input: part.args });
                            }
                            if (done && !previous) {
                                const output = penToolOutput(part.result, part.isError);
                                if (targetsWidget) {
                                    const text =
                                        typeof output === "string"
                                            ? output
                                            : output
                                                  .flatMap((item) => (item.type === "text" ? [item.text] : []))
                                                  .join(" ");
                                    mainBrowserBlock =
                                        /\bblock:([\w-]+)/.exec(text)?.[1] ||
                                        /"(?:blockId|blockid)"\s*:\s*"([\w-]+)"/.exec(text)?.[1] ||
                                        mainBrowserBlock;
                                }
                                if (
                                    fullChat &&
                                    !part.isError &&
                                    mainBrowserBlock &&
                                    targetsWidget &&
                                    !preparedBrowserBlocks.has(mainBrowserBlock)
                                ) {
                                    const blockId = mainBrowserBlock;
                                    preparedBrowserBlocks.add(blockId);
                                    browserPreview = browserPreview
                                        .then(async () => {
                                            const result = await getWorkspaceSurfaceModeProvider(tabId)?.control({
                                                action: "focus",
                                                blockid: blockId,
                                                presentation: "background",
                                            });
                                            if (!result?.success) preparedBrowserBlocks.delete(blockId);
                                        })
                                        .catch((error) => {
                                            preparedBrowserBlocks.delete(blockId);
                                            console.warn("Could not attach the browser tab", error);
                                        });
                                }
                                if (
                                    fullChat &&
                                    !part.isError &&
                                    !mainBrowserBlock &&
                                    /(?:^|_)browser_(?:open|open_tab|navigate)$/.test(part.toolName)
                                ) {
                                    const url = (part.args as { url?: unknown })?.url;
                                    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
                                        browserPreview = browserPreview
                                            .then(async () => {
                                                if (mainBrowserBlock) return;
                                                const result = await getWorkspaceSurfaceModeProvider(tabId)?.control({
                                                    action: "spatial.open",
                                                    view: "web",
                                                    text: url,
                                                });
                                                if (result?.success) {
                                                    mainBrowserBlock = /^block:([\w-]+)$/.exec(result.message)?.[1];
                                                    relayWorkers();
                                                }
                                            })
                                            .catch((error) => console.warn("Could not prepare the browser tab", error));
                                    }
                                }
                                const image = Array.isArray(output)
                                    ? output.findLast((item) => item.type === "image" && item.data.length < 4_000_000)
                                    : undefined;
                                if (targetsWidget && image?.type === "image")
                                    mainToolImage = `data:${image.mimeType};base64,${image.data}`;
                                if (targetsWidget) {
                                    const action: PenTaskAction = {
                                        id: part.toolCallId,
                                        title: mainTool,
                                        timestamp: part.completedAt ?? Date.now(),
                                        status: part.isError ? "failed" : "completed",
                                        blockId: mainBrowserBlock,
                                        result: (typeof output === "string"
                                            ? output
                                            : output
                                                  .filter((item) => item.type === "text")
                                                  .map((item) => item.text)
                                                  .join("\n")
                                        ).slice(0, 1600),
                                        image:
                                            image?.type === "image"
                                                ? `data:${image.mimeType};base64,${image.data}`
                                                : undefined,
                                    };
                                    recordTask(action);
                                    void browserPreview.then(async () => {
                                        const blockId = action.blockId || mainBrowserBlock;
                                        if (!blockId || action.image) return;
                                        for (let attempt = 0; attempt < 4; attempt++) {
                                            const capture = await captureBrowserTab(blockId).catch(() => undefined);
                                            if (capture?.image) {
                                                recordTask({ ...action, blockId, image: capture.image });
                                                break;
                                            }
                                            if (controller.signal.aborted) break;
                                            await new Promise((resolve) => setTimeout(resolve, 600));
                                        }
                                    });
                                }
                                replyTool({
                                    id: part.toolCallId,
                                    name: part.toolName,
                                    done,
                                    failed: part.isError,
                                    output,
                                });
                                const args = part.args as { path?: unknown } | undefined;
                                const file =
                                    typeof args?.path === "string" && args.path
                                        ? args.path.startsWith("/")
                                            ? args.path
                                            : state.cwd?.startsWith("/") && !/^(?:~|[\w+.-]+:)/.test(args.path)
                                              ? `${state.cwd}/${args.path}`
                                              : undefined
                                        : undefined;
                                if (
                                    fullChat &&
                                    !part.isError &&
                                    ["write_file", "patch"].includes(part.toolName) &&
                                    file
                                ) {
                                    showWrittenFile = showWrittenFile
                                        .then(async () => {
                                            const surface = getWorkspaceSurfaceModeProvider(tabId);
                                            if (surface?.snapshot().penchatmode === "tabs") {
                                                const result = await surface.control({
                                                    action: "spatial.openFile",
                                                    file,
                                                });
                                                const blockId =
                                                    result?.success && /\bblock:([\w-]+)/.exec(result.message)?.[1];
                                                if (blockId)
                                                    recordTask({
                                                        id: part.toolCallId,
                                                        title: "Updated file",
                                                        timestamp: part.completedAt ?? Date.now(),
                                                        status: "completed",
                                                        blockId,
                                                        result: file,
                                                    });
                                            }
                                        })
                                        .catch((error) =>
                                            console.warn("Could not prepare the agent’s file preview", error)
                                        );
                                }
                            }
                            tools.set(part.toolCallId, done || previous === true);
                        }
                    }
                    const answer = turn.findLast(
                        (message) =>
                            message.role === "assistant" &&
                            !message.interim &&
                            !message.hidden &&
                            (message.error || readText(message).trim())
                    );
                    mainDetail = answer && !answer.error ? readText(answer).trim().slice(0, 400) : "";
                    relayWorkers();
                    if (!answer) return;
                    const text = readText(answer);
                    if (answer.error) finish({ error: answer.error });
                    else if (!state.busy && answer.completedAt != null) {
                        if (advancing) return;
                        advancing = true;
                        void browserPreview
                            .then(async () => {
                                await submission;
                                if (controller.signal.aborted || stopping) return;
                                if (design === designCount) {
                                    finish({ text });
                                    return;
                                }
                                reply({ done: false, text, start: streamedAnswerId !== answer.id });
                                const currentState = $sessionStates.get()[runtimeId];
                                previous = new Set((currentState?.messages ?? messages).map((message) => message.id));
                                userId = undefined;
                                streamedAnswerId = undefined;
                                lastText = "";
                                displayPrompt = `Design pass ${++design} of ${designCount}`;
                                agentPrompt = makeAgentPrompt();
                                refreshDeadline();
                                advancing = false;
                                submission = submitCanvasChat(
                                    agentPrompt,
                                    displayPrompt,
                                    controller.signal,
                                    [],
                                    runtimeId,
                                    currentState?.storedSessionId ?? storedId
                                );
                                await submission;
                            })
                            .catch((error) => {
                                if (!controller.signal.aborted) finish({ error: String(error) });
                            });
                    } else if (text && (text !== lastText || streamedAnswerId !== answer.id)) {
                        const start = streamedAnswerId !== answer.id;
                        streamedAnswerId = answer.id;
                        lastText = text;
                        reply({ done: false, text, start });
                    }
                };
                const offWorkers = $subagentsBySession.listen(relayWorkers);
                const offTodos = $todosBySession.listen(relayWorkers);
                const offStates = $sessionStates.listen(relayTurn);
                const offActive = $activeSessionId.listen(() => relayTurn($sessionStates.get()));
                activeAgentRequest = () => {
                    controller.abort();
                    offWorkers();
                    offTodos();
                    clearTimeout(relayTimer);
                    for (const { stop } of subscriptions.values()) stop();
                    offStates();
                    offActive();
                    stopAgent = undefined;
                    clearTimeout(deadline);
                    clearTimeout(flushTimer);
                    updates = [];
                };
                const cleanup = activeAgentRequest;
                stopAgent = (id) => {
                    if (id !== requestId || stopping) return;
                    stopping = true;
                    if (!sessionId) {
                        finish({ error: "Stopped." });
                        return;
                    }
                    const sessionDelegate = sessionTileDelegate();
                    const interruption = sessionDelegate
                        ? sessionDelegate.interruptSession(sessionId)
                        : $activeSessionId.get() === sessionId
                          ? cancelCanvasChat()
                          : Promise.resolve();
                    void interruption.then(
                        () => {
                            if (activeAgentRequest === cleanup) finish({ error: "Stopped." });
                        },
                        (error) => {
                            if (activeAgentRequest === cleanup) finish({ error: String(error) });
                        }
                    );
                };
                const submit = async () => {
                    relayHermes = true;
                    if (!slash) relayWorkers();
                    if (
                        !slash &&
                        (selection?.platform === "iphone" ||
                            (/\biPhone simulator\b/i.test(prompt) && /\b(start|launch|boot|open)\b/i.test(prompt)))
                    ) {
                        const result = await getApi().resolveIPhonePreviewTarget();
                        if (controller.signal.aborted) return;
                        selection = {
                            platform: "iphone",
                            ...(result.success ? { targetId: result.data.id, name: result.data.name } : {}),
                        };
                        agentPrompt = makeAgentPrompt();
                    }
                    if (slash && typeof conversationId === "string") {
                        const { name, arg } = parseSlashCommand(agentPrompt);
                        const sessionPicker = ["resume", "sessions", "switch"].includes(name);
                        if (sessionPicker || name === "model") {
                            const resume = async (id: string) => {
                                if (!current.current.visible) throw new Error("Return to the originating Pen canvas.");
                                const session = $sessions.get().find((entry) => entry.id === id);
                                await openHistory(
                                    undefined,
                                    session ? sessionTitle(session) : "Hermes chat",
                                    async () => id,
                                    conversationId
                                );
                            };
                            if (sessionPicker && arg.trim()) {
                                const id = resolveSlashSessionId($sessions.get(), arg.trim());
                                if (!id) throw new Error("No matching Hermes chat.");
                                await resume(id);
                                return;
                            }
                            if (!arg.trim())
                                openPenDialog({
                                    kind: "command",
                                    sessionId: targetId ?? $activeSessionId.get(),
                                    resume,
                                });
                        }
                    }
                    if (imageReview && !slash) {
                        if (storedId && !targetId) throw new Error("Reopen this Hermes session before sending.");
                        attachments.push({
                            id: crypto.randomUUID(),
                            kind: "image",
                            label: imageReview.filename,
                            path: imageReview.filename,
                            imageDataUrl: imageReview.dataUrl,
                        });
                    }
                    if (!storedId || attachments.length || designCount > 1) {
                        if (storedId && !targetId) throw new Error("Reopen this Hermes session before sending.");
                        return submitCanvasChat(
                            agentPrompt,
                            prompt,
                            controller.signal,
                            attachments,
                            targetId,
                            storedId
                        );
                    }
                    if (!delegate || !targetId) throw new Error("Reopen this Hermes session before sending.");
                    if ($sessionStates.get()[targetId]?.busy)
                        throw new Error("This Hermes session is already running.");
                    if (slash) await delegate.executeSlash(agentPrompt, targetId);
                    else await delegate.submitToSession(targetId, agentPrompt);
                };
                const submitExperiment = async () => {
                    const api = getApi();
                    const selectedAgent = event.data.agent;
                    const mode =
                        selectedAgent === "codex" || selectedAgent === "opencode" || selectedAgent === "pi"
                            ? selectedAgent
                            : penVoice && selectedAgent !== "hermes"
                              ? "voice"
                              : undefined;
                    const namedAgent =
                        mode === "codex"
                            ? "Codex CLI"
                            : mode === "opencode"
                              ? "OpenCode"
                              : mode === "pi"
                                ? "Pi"
                                : "Local voice";
                    if (mode && mode !== "voice" && (slash || attachments.length || imageReview)) {
                        agentLabel = namedAgent;
                        throw new Error(`${namedAgent} currently accepts plain-text prompts.`);
                    }
                    if (
                        !import.meta.env.DEV ||
                        !mode ||
                        slash ||
                        attachments.length ||
                        imageReview ||
                        typeof conversationId !== "string"
                    )
                        return submit();
                    if (!api?.runPenAgent || !api?.onPenAgentDelta) {
                        if (mode !== "voice")
                            throw new Error(`Restart the dev app to load the ${namedAgent} connection.`);
                        return submit();
                    }
                    agentLabel = namedAgent;
                    const historyKey = mode + ":" + conversationId;
                    const messages: PenMessage[] = [
                        ...(experimentTurns.get(historyKey) ?? []),
                        { role: "user", content: prompt.trim().slice(0, 4000) },
                    ];
                    let output = "";
                    const unsubscribe = api.onPenAgentDelta((id, delta) => {
                        if (id !== requestId || controller.signal.aborted) return;
                        if (typeof delta !== "string") {
                            reply({ done: false, tool: delta });
                            return;
                        }
                        const start = !output;
                        output += delta;
                        reply({ done: false, start, text: output });
                    });
                    const cancel = () => api.cancelPenAgent(requestId);
                    controller.signal.addEventListener("abort", cancel, { once: true });
                    try {
                        let outcome: "done" | "hermes";
                        try {
                            outcome = await api.runPenAgent(
                                requestId,
                                mode,
                                messages,
                                mode !== "voice"
                                    ? {
                                          provider: $currentProvider.get(),
                                          model: $currentModel.get(),
                                          reasoning: $currentReasoningEffort.get(),
                                      }
                                    : undefined
                            );
                        } catch (error) {
                            if (controller.signal.aborted || mode !== "voice" || output) throw error;
                            outcome = "hermes";
                        }
                        controller.signal.throwIfAborted();
                        if (outcome === "hermes") {
                            agentLabel = "Hermes";
                            experimentTurns.delete(historyKey);
                            return submit();
                        }
                        if (!output.trim()) throw new Error("The model returned an empty reply.");
                        experimentTurns.set(
                            historyKey,
                            [...messages, { role: "assistant" as const, content: output.slice(0, 4000) }].slice(-8)
                        );
                        if (experimentTurns.size > 20) experimentTurns.delete(experimentTurns.keys().next().value);
                        finish({ text: output });
                    } finally {
                        controller.signal.removeEventListener("abort", cancel);
                        unsubscribe();
                    }
                };
                submission = submitExperiment();
                void submission
                    .then(() => {
                        if (!slash || userId || activeAgentRequest !== cleanup) return;
                        const messages = $sessionStates.get()[targetId ?? $activeSessionId.get()]?.messages ?? [];
                        const answer = messages
                            .filter(
                                (message) =>
                                    (message.role === "system" || message.role === "assistant") &&
                                    !previous.has(message.id) &&
                                    !message.hidden
                            )
                            .at(-1);
                        finish(
                            answer?.error ? { error: answer.error } : { text: answer ? readText(answer) : undefined }
                        );
                    })
                    .catch((error) => {
                        if (activeAgentRequest === cleanup) finish({ error: error.message });
                    });
            }
            if (type === "open-settings")
                window.dispatchEvent(
                    new CustomEvent(SystemCenterOpenEvent, { detail: { center: "control", section: "canvas" } })
                );
            if (type === "open-workspace" && typeof event.data.workspaceId === "string")
                current.current.onWorkspaceAction?.(event.data.workspaceId);
            if (type === "new-workspace") current.current.onWorkspaceAction?.();
            if (type === "native-overlay") {
                setNativeOverlay(!!event.data.open);
                current.current.onOverlay?.(!!event.data.open);
            }
            if (["camera", "presentation", "widgets", "widget-interact"].includes(type)) receiveSurface(event.data);
            if (type === "canvas-interaction") current.current.onCanvasInteraction?.();
            if (type === "storage-error")
                setError(String(event.data.error || "Could not save locally. Export a copy to keep your changes."));
            if (type === "error") {
                widgetSync.pause();
                clearTimeout(timeout);
                setError(String(event.data.error || "The canvas could not start."));
                setStatus("error");
            }
        };
        iframe.addEventListener("kronos-pen-surface", receiveSurfaceEvent);
        window.addEventListener("message", receive);
        client.connect();
        return () => {
            clearTimeout(timeout);
            window.removeEventListener(BrowserChatSelectionEvent, stageBrowserSelection);
            activeAgentRequest?.();
            activeAgentRequest = undefined;
            unregister?.();
            cancelVoice();
            cancelPenVoice.current = null;
            offHistoryExtras.forEach((off) => off());
            offInspector();
            offFileScope.forEach((off) => off());
            current.current.onRenderControlsSlot?.(null);
            current.current.onIslandControlsSlot?.(null);
            islandControlsSlot?.remove();
            current.current.onSystemControlsSlot?.(null);
            iframe.removeEventListener("kronos-pen-surface", receiveSurfaceEvent);
            window.removeEventListener("message", receive);
            sync?.dispose();
            widgetSync.dispose();
            current.current.onToolsSlot?.(null);
            widgetSyncRef.current = null;
            client.dispose();
            cameraSyncRef.current = null;
            clientRef.current = null;
        };
    }, [tabId, attempt, src]);

    useEffect(() => {
        if (!kronosV2 || !visible || status !== "ready" || !onWidgetControlsSlot) return;
        const editor = frameRef.current?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
        const editorDocument = editor?.contentDocument;
        if (!editorDocument) return;
        const slot = editorDocument.createElement("div");
        slot.dataset.kronosV2LayerControls = "";
        const mount = () => {
            if (slot.isConnected) return;
            editorDocument.querySelector('[role="tree"]')?.append(slot);
            if (slot.isConnected) onWidgetControlsSlot(slot);
        };
        const observer = new MutationObserver(mount);
        observer.observe(editorDocument.body, { childList: true, subtree: true });
        mount();
        return () => {
            observer.disconnect();
            onWidgetControlsSlot(null);
            slot.remove();
        };
    }, [kronosV2, visible, status, onWidgetControlsSlot]);

    useEffect(() => {
        if (!visible || status !== "ready") return;
        return $workflowSidebarMode.subscribe((mode) => {
            void clientRef.current?.request("set_workspace_navigation", { mode }).catch(() => {});
        });
    }, [visible, status]);

    useEffect(() => {
        if (visible && status === "ready")
            void clientRef.current
                ?.request("set_workspace_inspector", { open: $krontermInspectorOpen.get() })
                .catch(() => {});
    }, [visible, status]);

    useEffect(() => {
        if (!visible) cancelPenVoice.current?.();
    }, [visible]);

    usePenPaletteCommands({
        tabId,
        visible: visible && status === "ready",
        commands,
        onError: (failure) => setError(String(failure)),
    });

    useEffect(() => {
        if (status !== "ready" || !context) return;
        void clientRef.current?.request("set_context", context).catch((failure) => setError(String(failure)));
    }, [status, context]);

    useEffect(() => {
        widgetSyncRef.current?.setWidgets(widgets);
    }, [widgets]);

    useLayoutEffect(() => {
        if (camera) cameraSyncRef.current?.setCamera(camera);
    }, [camera?.x, camera?.y, camera?.zoom]);

    useEffect(() => {
        if (status !== "ready" || !cameraSyncRef.current) return;
        if (!visible) {
            cameraSyncRef.current?.pause();
            return;
        }
        cameraSyncRef.current?.start();
        void clientRef.current
            ?.request("get_camera")
            .then((snapshot) => cameraSyncRef.current?.receive(snapshot))
            .catch((failure) =>
                setError(failure instanceof Error ? failure.message : "Could not read the canvas camera.")
            );
    }, [visible, status]);

    useEffect(() => {
        if (status !== "ready") return;
        const styles = getComputedStyle(frameRef.current);
        void clientRef.current
            ?.request("set_theme", {
                theme: appearance.colorScheme,
                background: styles.getPropertyValue("--kt-content").trim(),
                accent: styles.getPropertyValue("--accent-color").trim(),
                reducedMotion: appearance.reducedMotion,
            })
            .catch(() => {});
    }, [appearance, status]);

    useEffect(() => {
        if (!kronosV2 || status !== "ready" || !visible) return;
        const engine = frameRef.current?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
        const editorDocument = engine?.contentDocument;
        if (!editorDocument) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") window.dispatchEvent(new Event(KronOSV2AgentFollowPauseEvent));
        };
        editorDocument.addEventListener("keydown", escape, true);
        return () => editorDocument.removeEventListener("keydown", escape, true);
    }, [kronosV2, status, visible]);

    useLayoutEffect(() => {
        if (!kronosV2 || status !== "ready" || !visible) return;
        const host = presentationChromeRef.current;
        const engine = frameRef.current?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor");
        const editorDocument = engine?.contentDocument;
        const editorWindow = engine?.contentWindow;
        if (!editorDocument || !editorWindow || !host) return;

        const compactChatStyle = editorDocument.createElement("style");
        compactChatStyle.dataset.kronosCompactChat = "";
        compactChatStyle.textContent = `
            [data-kronos-mini-chat] [data-kronos-pen-workers],
            [aria-label="Mini chat"] [data-kronos-pen-workers] { display: none !important; }
        `;
        editorDocument.head.append(compactChatStyle);

        // Live widgets paint above the iframe, so their clip needs to leave Pen's interactive chrome exposed.
        const selector = [
            "[data-agent-spotlight]",
            "[data-kronos-pen-island-bar]",
            "[data-agent-input-notch]",
            "[data-kronos-island-controls]",
            "[data-kronos-island-resize]",
            "[data-radix-popper-content-wrapper]",
            '[data-slot="popover-content"]',
            "dialog[open]",
            ...(typeof CSS !== "undefined" && CSS.supports("selector(:popover-open)")
                ? ["[popover]:popover-open"]
                : []),
            "[data-kronos-pen-voice-panel][data-active]",
            "[data-kronos-mini-chat]",
            '[aria-label="Mini chat"]',
            "[data-kronos-pen-slide-control]",
            '[role="menu"]',
            '[role="listbox"]',
            '[role="dialog"]',
            ".tools-panel:has([data-kronos-v2-workflow-tools])",
            ".kronos-v2-workflow-tool-popover",
        ].join(", ");
        let frame: number;
        let lastRects = "";
        let clippedPlane: HTMLElement;
        let clippedDock: HTMLElement;
        const update = () => {
            const offset = engine.getBoundingClientRect();
            const rects = Array.from(editorDocument.querySelectorAll(selector)).flatMap((element) => {
                const rect = element.getBoundingClientRect();
                const computed = editorWindow.getComputedStyle(element);
                if (!rect.width || !rect.height || computed.visibility === "hidden" || computed.opacity === "0")
                    return [];
                const floating = editorDocument.documentElement.hasAttribute("data-kronos-floating-chat");
                if (floating && element.matches("[data-agent-spotlight]")) return [];
                const rounded =
                    element.matches("[data-kronos-pen-voice-panel]") ||
                    (floating &&
                        element.matches(
                            "[data-kronos-pen-island-bar], [data-kronos-mini-chat], [data-agent-input-notch], [data-kronos-island-controls], [data-kronos-pen-voice-panel]"
                        ));
                const bounds = rounded
                    ? { x: offset.x + rect.x, y: offset.y + rect.y, width: rect.width, height: rect.height }
                    : {
                          x: Math.floor(offset.x + rect.x) - 2,
                          y: Math.floor(offset.y + rect.y) - 2,
                          width: Math.ceil(rect.width) + 4,
                          height: Math.ceil(rect.height) + 4,
                      };
                return makePenSurfaceOccluders(
                    bounds,
                    rounded ? penSurfaceCornerRadius(computed.borderTopLeftRadius, rect.width, rect.height) : 0
                ).map(({ x, y, width, height }) => [x, y, width, height]);
            });
            const signature = JSON.stringify(rects);
            if (signature !== lastRects) {
                lastRects = signature;
                host.replaceChildren(
                    ...rects.map(([x, y, width, height]) => {
                        const marker = document.createElement("div");
                        marker.dataset.liveBlockOccluder = "";
                        marker.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px`;
                        return marker;
                    })
                );
            }
            const plane = host.closest(".os-mode-root")?.querySelector<HTMLElement>(".os-kronos-live-plane");
            if (plane) {
                clippedPlane = plane;
                const bounds = plane.getBoundingClientRect();
                const occluders = Array.from(
                    host.parentElement.querySelectorAll("[data-live-block-occluder]"),
                    (marker) => marker.getBoundingClientRect()
                );
                const clip =
                    bounds.width && bounds.height && occluders.length
                        ? makeSurfaceClipPath(bounds, bounds, occluders, plane.offsetWidth, plane.offsetHeight)
                        : "";
                if (plane.style.clipPath !== clip) plane.style.clipPath = clip;
            }
            const dock = host.parentElement.querySelector<HTMLElement>(".pen-chat-dock:not([data-backgrounded])");
            if (clippedDock && clippedDock !== dock) clippedDock.style.clipPath = "";
            if (dock) {
                const bounds = dock.getBoundingClientRect();
                const occluders = Array.from(
                    host.parentElement.querySelectorAll("[data-live-block-occluder]"),
                    (marker) => marker.getBoundingClientRect()
                );
                const clip =
                    bounds.width && bounds.height && occluders.length
                        ? makeSurfaceClipPath(bounds, bounds, occluders, dock.offsetWidth, dock.offsetHeight)
                        : "";
                if (dock.style.clipPath !== clip) dock.style.clipPath = clip;
            }
            clippedDock = dock;
            frame = requestAnimationFrame(update);
        };
        update();
        return () => {
            cancelAnimationFrame(frame);
            compactChatStyle.remove();
            if (clippedPlane) clippedPlane.style.clipPath = "";
            if (clippedDock) clippedDock.style.clipPath = "";
            host.replaceChildren();
        };
    }, [kronosV2, presenting, status, visible]);

    useEffect(() => {
        if (status !== "ready" || !visible || nativeOverlay || !widgets.length) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const refresh = async () => {
            const previews = [];
            for (const widget of current.current.widgets) {
                if (document.visibilityState === "hidden") break;
                if (disposed) return;
                if (performance.now() - lastSurfaceChange.current < 400) break;
                if (!widget.visible) continue;
                try {
                    const preview = await capturePenWidgetPreview(widget.blockId);
                    if (preview) previews.push(preview);
                } catch {
                    // Keep the last preview when a guest is navigating or a surface is unavailable.
                }
            }
            if (disposed) return;
            for (let index = 0; index < previews.length && !disposed; index += 100)
                await clientRef.current
                    ?.request("update_widget_previews", { previews: previews.slice(index, index + 100) })
                    .catch(() => {});
            if (!disposed) timer = setTimeout(refresh, 3000);
        };
        timer = setTimeout(refresh, 500);
        return () => {
            disposed = true;
            clearTimeout(timer);
        };
    }, [status, visible, tabId, nativeOverlay, widgets.length]);

    const editorDocument =
        status === "ready" && kronosV2
            ? frameRef.current?.contentDocument?.querySelector<HTMLIFrameElement>("#pen-editor")?.contentDocument
            : null;

    const [chatImage, setChatImage] = useState<{
        url: string;
        filename: string;
        mount: HTMLDivElement;
        docked?: boolean;
    }>();
    const imageHost = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (!chatImage) return;
        if (!chatImage.docked) imageHost.current?.append(chatImage.mount);
        return () => {
            if (!chatImage.docked && chatImage.mount.parentElement === imageHost.current) chatImage.mount.remove();
        };
    }, [chatImage]);
    useEffect(() => {
        if (!editorDocument || !visible) {
            setChatImage(undefined);
            return;
        }
        const showChatImage = (event: MouseEvent) => {
            const target = event.target as Element;
            if (target?.closest?.("[data-kronos-pen-workers], [data-kronos-browser-previews]")) return;
            const attachment = target?.closest?.('button[aria-label="Open attachment"]');
            const image = target?.closest?.("img") ?? attachment?.querySelector("img");
            if (!image?.closest("[data-kronos-chat-panel], [data-agent-spotlight]")) return;
            const url = image.currentSrc || image.src;
            if (!/^(data:image\/|blob:)/i.test(url) && !(attachment && /^https?:/i.test(url))) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const mount = document.createElement("div");
            mount.style.cssText = "width:100%;height:100%;min-height:0";
            setChatImage({ url, filename: image.alt || "Image", mount });
        };
        editorDocument.addEventListener("click", showChatImage, true);
        return () => editorDocument.removeEventListener("click", showChatImage, true);
    }, [editorDocument, visible]);

    const exportDesign = async () => {
        try {
            const result = (await clientRef.current.request("export")) as Parameters<typeof penDownload>[0] & {
                warning?: string;
            };
            const file = penDownload(result);
            const download = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: file.type }));
            const anchor = document.createElement("a");
            anchor.href = download;
            anchor.download = file.name;
            anchor.click();
            setError(result.warning ?? "");
            setTimeout(() => URL.revokeObjectURL(download), 1000);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Export failed.");
        }
    };

    return (
        <section
            className="os-pen-editor"
            hidden={!visible && camera != null}
            inert={!visible}
            data-pen-inactive={!visible && camera == null ? "" : undefined}
            aria-label="Workspace canvas"
            data-workflow-native-host=""
        >
            <iframe
                key={attempt}
                ref={frameRef}
                src={src}
                title="KronOS canvas powered by Pen"
                name="kronos-pen-editor"
                sandbox="allow-scripts allow-same-origin allow-downloads"
            />
            {kronosV2 && <div ref={presentationChromeRef} aria-hidden="true" className="os-pen-presentation-chrome" />}
            {visible && editorDocument && (
                <OSPenActivityPreview
                    editorDocument={editorDocument}
                    runs={activityRuns}
                    onOpenWidget={async (id) => {
                        if (!onOpenActivityWidget?.(id)) return false;
                        if (!editorDocument.documentElement.hasAttribute("data-kronos-full-chat"))
                            await clientRef.current.request("show_full_chat");
                        return true;
                    }}
                    onOpenTheater={(conversationId, workerId) => {
                        const sessionId = workerSessions.get(conversationId);
                        if (!sessionId) return;
                        const detail: PenDialogRequest = { kind: "subagents", sessionId, workerId };
                        window.dispatchEvent(new CustomEvent("kronos:pen-dialog", { detail }));
                    }}
                />
            )}
            {editorDocument && onFullChat && (
                <Suspense fallback={null}>
                    <OSPenChatDock
                        workspaceId={tabId}
                        editorDocument={editorDocument}
                        visible={visible}
                        tabs={chatDockTabs ?? []}
                        imageTab={
                            chatImage?.docked
                                ? {
                                      title: chatImage.filename,
                                      mount: chatImage.mount,
                                      close: () => setChatImage(undefined),
                                  }
                                : undefined
                        }
                        focusRequest={chatDockFocus}
                        taskGroups={taskGroups}
                        workingTabIds={[...activityRuns.values()].flatMap(({ rows }) =>
                            rows.flatMap(({ status, blockId }) => (status === "running" && blockId ? [blockId] : []))
                        )}
                        onActiveTab={onChatDockActive}
                        onFullChat={onFullChat}
                        onMobileSelection={setMobileSelection}
                    />
                </Suspense>
            )}
            <div ref={imageHost} />
            {visible &&
                chatImage &&
                createPortal(
                    <Suspense fallback={null}>
                        <ChatImageViewer
                            key={chatImage.url}
                            url={chatImage.url}
                            filename={chatImage.filename}
                            onDismiss={() => setChatImage(undefined)}
                            onMoveToSidePanel={
                                onFullChat
                                    ? () => setChatImage((current) => current && { ...current, docked: true })
                                    : undefined
                            }
                        />
                    </Suspense>,
                    chatImage.mount
                )}
            {status === "ready" && error && (
                <div className="os-pen-editor-alert" role="alert">
                    <p>{error}</p>
                    <button type="button" onClick={() => void exportDesign()}>
                        <Download size={15} /> Export a copy
                    </button>
                </div>
            )}
            {status !== "ready" && (
                <div className="os-pen-editor-startup" role="status">
                    {status === "loading" ? (
                        <LoaderCircle className="os-pen-editor-spinner" size={24} />
                    ) : (
                        <RotateCcw size={24} />
                    )}
                    <h2>{status === "loading" ? "Opening your canvas" : "Canvas needs attention"}</h2>
                    <p>{status === "loading" ? "Loading your layers and design tools." : error}</p>
                    {status === "error" && (
                        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                            Retry canvas
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
