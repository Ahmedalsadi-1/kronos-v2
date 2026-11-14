import { $workflowPickerSource, closeWorkflowPicker } from "@hermes/store/command-palette";
import { useStore } from "@nanostores/react";
import type { WorkflowWidget, WorkflowWidgetConfiguration } from "@/util/workflow-widget";
import { workflowWidgetParameters } from "@/util/workflow-widget";
import { OriginalExecutionsPanel, OriginalNodePicker } from "@hermes/app/workflows/original-node-picker";
import { WidgetConnectionDialog } from "@hermes/app/workflows/widget-connection-dialog";
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { useSystemAppearance } from "@/app/components/system-ui";
import { getApi } from "@/store/global";
import type { N8nSurface } from "@/types/n8n-workspace";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    getWorkflowSelectionCommand,
    loadWorkflowEditor,
    workflowEventMatchesTab,
    type WorkflowCamera,
    type WorkflowCameraIntent,
} from "./os-workflow-host";
import { getWorkflowSlotStyle, type WorkflowSlotKind } from "./os-workflow-slot-style";
import type { OSCanvasObject } from "./os-workspace-model";

export type WorkflowPanelInsets = { top: number; right: number; bottom: number };

type Desktop = { url: string; surface: N8nSurface; revision?: number };
type RuntimeState = {
    desktop?: Desktop;
    selectedWorkflowId?: string;
    documentRevision?: number;
    documentWorkflowId?: string;
    running?: boolean;
};

type WorkflowHost = {
    workflowId?: string;
    camera: WorkflowCamera;
    chromeTarget: HTMLElement;
    detailTarget: HTMLElement;
    headerTarget: HTMLElement;
    logsTarget: HTMLElement;
    getWidgetConnectionSource?: () => unknown;
    insertWidgetNode?: (input: any) => Promise<{ nodeId: string }>;
    worldTarget: HTMLElement;
    viewportTarget: HTMLElement;
    positions?: Record<string, { x: number; y: number }>;
    navigate?: (path: string) => Promise<unknown>;
    setViewport?: (camera: WorkflowCamera) => void;
    setSelection?: (ids: string[]) => void;
    getSelection?: () => string[];
    closeNodeEditor?: () => void;
    setTheme?: (theme: "light" | "dark" | "system") => void;
    setObjectOrder?: (order: Record<string, number>) => void;
    setPickerTarget?: (target: HTMLElement) => void;
    setExecutionTarget?: (target: HTMLElement) => void;
    setPanelTargets?: (targets: { tools: HTMLElement; focus: HTMLElement }) => void;
    openPicker?: () => void;
    fitWorkflow?: () => void;
    moveNode?: (id: string, position: { x: number; y: number }) => void;
    removeNode?: (id: string) => void;
    refreshDocument?: (draft?: unknown) => Promise<unknown>;
    getDocumentState?: () => { dirty: boolean; workflowId?: string; versionId?: string };
};

function nativeMount(target: HTMLElement, kind: WorkflowSlotKind): HTMLElement {
    const shadow = target.shadowRoot ?? target.attachShadow({ mode: "open" });
    let root = shadow.querySelector<HTMLElement>("[data-workflow-slot-root]");
    if (root) return root;
    target.setAttribute(`data-workflow-${kind}`, "");
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL("./workflow-native/editor.css", document.baseURI).href;
    const style = document.createElement("style");
    style.textContent = getWorkflowSlotStyle(kind);
    root = document.createElement("div");
    root.dataset.workflowSlotRoot = "";
    shadow.append(css, style, root);
    return root;
}

export function OSOriginalWorkflow({
    tabId,
    workspaceId,
    camera,
    visible,
    selectedObjectId,
    worldTarget,
    viewportTarget,
    objectOrder,
    onCameraIntent,
    onObjects,
    onActivate,
    onChat,
    onPanelLayout,
    toolsTarget,
    focusTarget,
    onFocusVisibility,
}: {
    tabId: string;
    workspaceId?: string;
    camera: WorkflowCamera;
    visible: boolean;
    selectedObjectId?: string;
    worldTarget: HTMLElement;
    viewportTarget: HTMLElement;
    objectOrder: Record<string, number>;
    onCameraIntent: (intent: WorkflowCameraIntent) => void;
    onObjects: (objects: OSCanvasObject[]) => void;
    onActivate: () => void;
    onChat: () => void;
    onPanelLayout?: (insets: WorkflowPanelInsets) => void;
    toolsTarget?: HTMLElement;
    focusTarget?: HTMLElement;
    onFocusVisibility?: (visible: boolean, editing: boolean) => void;
}) {
    useEffect(() => {
        if (!focusTarget) return;
        const root = nativeMount(focusTarget, "details");
        const update = () => {
            const editing = !!root.querySelector("[data-workflow-node-editor]");
            onFocusVisibility?.(editing || !!root.querySelector('[data-test-id="focus-sidebar"]'), editing);
        };
        const observer = new MutationObserver(update);
        observer.observe(root, { childList: true, subtree: true });
        update();
        return () => {
            observer.disconnect();
            onFocusVisibility?.(false, false);
        };
    }, [focusTarget, onFocusVisibility]);
    const appearance = useSystemAppearance();
    const element = useRef<HTMLDivElement>(null);
    const chrome = useRef<HTMLDivElement>(null);
    const detail = useRef<HTMLDivElement>(null);
    const header = useRef<HTMLDivElement>(null);
    const logs = useRef<HTMLDivElement>(null);
    const [logsCollapsed, setLogsCollapsed] = useState(true);
    const [headerCollapsed, setHeaderCollapsed] = useState(true);
    const [shellControlsTarget, setShellControlsTarget] = useState<HTMLElement>(null);
    useEffect(() => {
        setShellControlsTarget(document.getElementById(`workflow-shell-controls-${tabId}`));
    }, [tabId]);
    const executionDock = useRef<HTMLDivElement>(null);
    const [executionDockOpen, setExecutionDockOpen] = useState(false);
    const [executionRequested, setExecutionRequested] = useState(false);
    const pickerSource = useStore($workflowPickerSource);
    const panelFrame = useRef<HTMLDivElement>(null);
    const [panelWidth, setPanelWidth] = useState(0);
    const [detailExpanded, setDetailExpanded] = useState(false);
    const [panelInsets, setPanelInsets] = useState<WorkflowPanelInsets>({ top: 0, right: 0, bottom: 0 });
    const bridge = useRef<WorkflowHost>(null);
    const cameraRef = useRef(camera);
    cameraRef.current = camera;
    const orderRef = useRef(objectOrder);
    orderRef.current = objectOrder;
    const panelTargets = useRef({ toolsTarget, focusTarget });
    panelTargets.current = { toolsTarget, focusTarget };
    const currentPanelMounts = () => ({
        tools: panelTargets.current.toolsTarget ? nativeMount(panelTargets.current.toolsTarget, "chrome") : null,
        focus: panelTargets.current.focusTarget ? nativeMount(panelTargets.current.focusTarget, "details") : null,
    });
    useEffect(() => {
        bridge.current?.setPanelTargets?.(currentPanelMounts());
    }, [toolsTarget, focusTarget]);
    const callbacks = useRef({ onCameraIntent, onObjects, onActivate, onChat, onPanelLayout });
    callbacks.current = { onCameraIntent, onObjects, onActivate, onChat, onPanelLayout };
    const reportPanelLayout = (layout: WorkflowPanelInsets) => {
        callbacks.current.onPanelLayout?.({ ...layout, right: 0 });
    };
    useEffect(() => {
        const publish = () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-executions-dock-target", {
                    detail: { tabId, target: executionDock.current },
                })
            );
        const request = (event: Event) => {
            if ((event as CustomEvent).detail?.tabId === tabId) publish();
        };
        const visibility = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.tabId === tabId) setExecutionDockOpen(Boolean(detail.open));
        };
        const open = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.tabId !== tabId || !contextRef.current.hasExecutions) return;
            detail.handled = true;
            setExecutionRequested(true);
        };
        const close = (event: Event) => {
            if ((event as CustomEvent).detail?.tabId === tabId) setExecutionRequested(false);
        };
        window.addEventListener("kronterm:workflow-executions-dock-open", open);
        window.addEventListener("kronterm:workflow-executions-dock-close", close);
        window.addEventListener("kronterm:workflow-executions-dock-target-request", request);
        window.addEventListener("kronterm:workflow-executions-dock-visibility", visibility);
        publish();
        return () => {
            window.removeEventListener("kronterm:workflow-executions-dock-open", open);
            window.removeEventListener("kronterm:workflow-executions-dock-close", close);
            window.removeEventListener("kronterm:workflow-executions-dock-target-request", request);
            window.removeEventListener("kronterm:workflow-executions-dock-visibility", visibility);
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-executions-dock-target", { detail: { tabId, target: null } })
            );
        };
    }, [tabId]);
    useEffect(() => {
        if (!visible) return;
        reportPanelLayout({ ...panelInsets, bottom: Math.min(36, panelInsets.bottom) });
    }, [panelInsets, visible]);
    useEffect(() => {
        const frame = panelFrame.current;
        if (!frame) return;
        const measure = () => {
            const width = frame.getBoundingClientRect().width;
            const available = width - Math.min(detailExpanded ? 320 : 480, width / 2);
            setPanelWidth(
                Math.max(
                    0,
                    Math.floor(Math.min(detailExpanded ? 1100 : 760, width * (detailExpanded ? 0.7 : 0.45), available))
                )
            );
        };
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        measure();
        return () => observer.disconnect();
    }, [detailExpanded]);
    useEffect(() => {
        if (!visible) {
            setPanelInsets({ top: 0, right: 0, bottom: 0 });
            reportPanelLayout({ top: 0, right: 0, bottom: 0 });
        }
    }, [visible]);
    useEffect(() => {
        if (pickerSource && !visible) onActivate();
    }, [pickerSource, visible, onActivate]);
    const pickerTarget = useRef<HTMLElement>(null);
    const executionTarget = useRef<HTMLElement>(null);
    const stateRef = useRef<RuntimeState>({});
    const contextRef = useRef({ tabId, workspaceId, workflowId: "", hasExecutions: false, surface: "canvas" });
    const dirtySequence = useRef(0);
    const [state, setState] = useState<RuntimeState>({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [retry, setRetry] = useState(0);
    const [widgetConnection, setWidgetConnection] = useState<{
        widget: WorkflowWidget;
        workflowId: string;
        respond: (error?: string, nodeId?: string) => void;
        source?: unknown;
    }>(null);
    const widgetConnectionRef = useRef<typeof widgetConnection>(null);
    const [connectingWidget, setConnectingWidget] = useState(false);
    const [widgetError, setWidgetError] = useState("");
    const readyRef = useRef(false);
    const request = (operation: string, input: Record<string, unknown> = {}) =>
        getApi().hermesApi<any>({
            path: "/api/kronterm/n8n/command",
            method: "POST",
            body: { operation, ...input },
            timeoutMs: 100000,
        });
    const publishContext = () => {
        window.dispatchEvent(new CustomEvent("kronterm:workflow-context", { detail: contextRef.current }));
    };

    useEffect(() => {
        let active = true;
        let pending = false;
        let refreshQueued = false;
        const refresh = async () => {
            if (pending) return;
            pending = true;
            try {
                const next = await request("state");
                if (!active) return;
                stateRef.current = next;
                setState((previous) =>
                    previous.desktop?.url === next.desktop?.url &&
                    previous.desktop?.revision === next.desktop?.revision &&
                    previous.documentRevision === next.documentRevision &&
                    previous.documentWorkflowId === next.documentWorkflowId &&
                    previous.selectedWorkflowId === next.selectedWorkflowId
                        ? previous
                        : next
                );
                contextRef.current = {
                    ...contextRef.current,
                    tabId,
                    workspaceId,
                    workflowId: next.selectedWorkflowId ?? "",
                    hasExecutions:
                        next.selectedWorkflowId === contextRef.current.workflowId
                            ? contextRef.current.hasExecutions
                            : false,
                    surface: next.desktop?.surface ?? "canvas",
                };
                publishContext();
            } catch (failure) {
                if (active && bridge.current) setError(String(failure));
            } finally {
                pending = false;
                if (active && refreshQueued) {
                    refreshQueued = false;
                    void refresh();
                }
            }
        };
        void refresh();
        const timer = setInterval(() => void refresh(), 1500);
        const refreshOnCommand = (event: Event) => {
            if (!workflowEventMatchesTab((event as CustomEvent).detail, tabId)) return;
            if (pending) refreshQueued = true;
            else void refresh();
        };
        const prepareEditor = (event: Event) => {
            if (workflowEventMatchesTab((event as CustomEvent).detail, tabId))
                void loadWorkflowEditor("workflow-native").catch(() => {});
        };
        window.addEventListener("kronterm:workflow-context-request", refreshOnCommand);
        window.addEventListener("kronterm:workflow-open", refreshOnCommand);
        window.addEventListener("kronterm:workflow-prepare", prepareEditor);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener("kronterm:workflow-context-request", refreshOnCommand);
            window.removeEventListener("kronterm:workflow-open", refreshOnCommand);
            window.removeEventListener("kronterm:workflow-prepare", prepareEditor);
        };
    }, [tabId, workspaceId]);

    useEffect(() => {
        let active = true;
        const picker = (event: Event) => {
            const value = (event as CustomEvent).detail;
            if (!workflowEventMatchesTab(value, tabId)) return;
            pickerTarget.current = value?.target ?? null;
            const mount = pickerTarget.current ? nativeMount(pickerTarget.current, "inspector") : null;
            bridge.current?.setPickerTarget?.(mount);
            if (!pickerTarget.current) return;
            bridge.current?.openPicker?.();
            if (!bridge.current && !stateRef.current.desktop && !$workflowPickerSource.get()?.startsWith("comfy"))
                void request("open", { surface: "canvas" }).catch((failure) => setError(String(failure)));
        };
        const showPicker = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (workflowEventMatchesTab(detail, tabId) && detail?.section === "workflow-nodes") {
                callbacks.current.onActivate();
                if (!$workflowPickerSource.get()) $workflowPickerSource.set("n8n");
            }
        };
        const surface = (event: Event) => {
            const value = (event as CustomEvent).detail;
            if (!workflowEventMatchesTab(value, tabId)) return;
            if (value?.surface !== "executions") return;
            if (!value.target && value.previousTarget && executionTarget.current !== value.previousTarget) return;
            executionTarget.current = value.target;
            bridge.current?.setExecutionTarget?.(value.target ? nativeMount(value.target, "inspector") : null);
        };
        const objectCommand = (event: Event) => {
            const value = (event as CustomEvent).detail;
            const host = bridge.current;
            if (value?.tabId !== tabId || !value?.objectId?.startsWith(`workflow:${host?.workflowId}:`)) return;
            const id = value.objectId.slice(`workflow:${host.workflowId}:`.length);
            try {
                if (value.remove) {
                    if (!host.removeNode) throw new Error("Workflow editor is not ready.");
                    host.removeNode(id);
                    value.result = { success: true, message: "Deleted workflow node in the editor." };
                    return;
                }
                if (
                    Object.entries(value.patch ?? {}).some(
                        ([key, entry]) => entry != null && key !== "x" && key !== "y"
                    )
                )
                    throw new Error("Only position can be changed here. Edit workflow parameters in the node editor.");
                if (!host.moveNode || !host.positions?.[id]) throw new Error("Workflow node is not ready.");
                const previous = host.positions[id];
                const position = { x: value.patch?.x ?? previous.x, y: value.patch?.y ?? previous.y };
                if (![position.x, position.y].every(Number.isFinite))
                    throw new Error("Node coordinates must be finite numbers.");
                host.moveNode(id, position);
                value.result = { success: true, message: "Moved workflow node in the editor." };
            } catch (failure) {
                value.result = { success: false, message: String(failure) };
            }
        };
        const insertWidget = (event: Event) => {
            const value = (event as CustomEvent).detail;
            if (!workflowEventMatchesTab(value, tabId)) return;
            const respond = (error?: string, nodeId?: string) =>
                window.dispatchEvent(
                    new CustomEvent("kronterm:workflow-widget-inserted", {
                        detail: { tabId, workflowId: value.workflowId, requestId: value.requestId, error, nodeId },
                    })
                );
            void (async () => {
                const host = bridge.current;
                if (!readyRef.current || !host?.insertWidgetNode)
                    throw new Error("Workflow editor is still loading. Try again when connected.");
                if (host.workflowId !== value.workflowId) throw new Error("The selected workflow has changed.");
                const source = host.getWidgetConnectionSource?.();
                const widgets = await request("workspace-widgets");
                const widget = widgets.find((entry: any) => entry.blockId === value.blockId);
                if (!widget) throw new Error("That widget is no longer in this workspace.");
                if (!active || bridge.current !== host || host.workflowId !== value.workflowId)
                    throw new Error("The workflow changed. Reconnect this widget.");
                widgetConnectionRef.current?.respond("Another widget connection was opened.");
                const connection = { widget, workflowId: value.workflowId, source, respond };
                widgetConnectionRef.current = connection;
                setWidgetError("");
                setWidgetConnection(connection);
                window.dispatchEvent(
                    new CustomEvent("kronterm:workflow-widget-configuring", {
                        detail: { tabId, workflowId: value.workflowId, requestId: value.requestId },
                    })
                );
            })().catch((failure) => respond(String(failure)));
        };
        const activate = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!workflowEventMatchesTab(detail, tabId)) return;
            callbacks.current.onActivate();
            if (detail?.focusWorkflow && detail.workflowId === bridge.current?.workflowId)
                bridge.current?.fitWorkflow?.();
        };
        window.addEventListener("kronterm:workflow-insert-widget", insertWidget);
        window.addEventListener("kronterm:workflow-open", activate);
        window.addEventListener("kronterm:original-node-picker", picker);
        window.addEventListener("kronterm:workflow-inspector", showPicker);
        window.addEventListener("kronterm:workflow-surface", surface);
        window.addEventListener("kronterm:workflow-object-command", objectCommand);
        return () => {
            active = false;
            widgetConnectionRef.current?.respond("The workflow tab changed.");
            widgetConnectionRef.current = null;
            setWidgetConnection(null);
            window.removeEventListener("kronterm:workflow-insert-widget", insertWidget);
            window.removeEventListener("kronterm:workflow-open", activate);
            window.removeEventListener("kronterm:original-node-picker", picker);
            window.removeEventListener("kronterm:workflow-inspector", showPicker);
            window.removeEventListener("kronterm:workflow-surface", surface);
            window.removeEventListener("kronterm:workflow-object-command", objectCommand);
        };
    }, [tabId]);

    const open = Boolean(state.desktop);
    useEffect(() => {
        if (!open) {
            setLoading(false);
            setError("");
            return;
        }
        if (!element.current || !worldTarget || !viewportTarget) return;
        let active = true;
        let dispose: (() => void) | undefined;
        let initialNavigationSettled = false;
        readyRef.current = false;
        setLoading(true);
        setError("");
        const loadingDeadline = window.setTimeout(() => {
            if (active && !readyRef.current) {
                setLoading(false);
                setError("Workflow components did not finish loading. Retry the workflow connection.");
            }
        }, 45000);
        const mount = async () => {
            const [session, module] = await Promise.all([
                request("editor-session"),
                loadWorkflowEditor<{
                    mountKronTermWorkflow(root: HTMLElement, host: WorkflowHost): Promise<() => void>;
                }>("workflow-native"),
            ]);
            if (!active) return;
            const shadow = element.current.shadowRoot ?? element.current.attachShadow({ mode: "open" });
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = new URL("./workflow-native/editor.css", document.baseURI).href;
            const root = document.createElement("div");
            root.id = "app";
            root.style.cssText = "width:100%;height:100%;position:relative;pointer-events:none;background:transparent";
            const contextStyle = document.createElement("style");
            contextStyle.textContent = ":host,#app{background:transparent!important}";
            shadow.replaceChildren(css, contextStyle, root);
            const panels = currentPanelMounts();
            const host = {
                ...session,
                tabId,
                workspaceId,
                camera: cameraRef.current,
                theme: appearance.colorScheme,
                worldTarget: nativeMount(worldTarget, "world"),
                viewportTarget,
                objectOrder: orderRef.current,
                chromeTarget: nativeMount(chrome.current, "chrome"),
                toolsTarget: panels.tools,
                focusTarget: panels.focus,
                detailTarget: nativeMount(detail.current, "details"),
                headerTarget: nativeMount(header.current, "chrome"),
                logsTarget: nativeMount(logs.current, "chrome"),
                panelFrame: panelFrame.current,
                dockedPanels: true,
                onDetailExpanded: (expanded: boolean) => setDetailExpanded(expanded),
                onPanelLayout: (layout: WorkflowPanelInsets) => {
                    if (!active) return;
                    setPanelInsets((previous) =>
                        JSON.stringify(previous) === JSON.stringify(layout) ? previous : layout
                    );
                },
                onReady: () => {
                    if (!active) return;
                    readyRef.current = true;
                    host.setViewport?.(cameraRef.current);
                    setLoading(false);
                    window.dispatchEvent(new CustomEvent("kronterm:workflow-ready", { detail: { tabId } }));
                },
                openChat: () => {
                    callbacks.current.onChat();
                    window.dispatchEvent(new CustomEvent("kronterm:workflow-chat", { detail: { tabId } }));
                },
                onInspector: (value: "nodes" | "executions" | "workflow-nodes" | "workflow-executions") => {
                    const section =
                        value === "nodes" ? "workflow-nodes" : value === "executions" ? "workflow-executions" : value;
                    if (section === "workflow-executions") {
                        if (executionTarget.current?.closest("#inspector-pane-workflow-executions")) return;
                        const detail = { tabId, handled: false };
                        window.dispatchEvent(new CustomEvent("kronterm:workflow-executions-dock-open", { detail }));
                        if (detail.handled) return;
                    }
                    window.dispatchEvent(
                        new CustomEvent("kronterm:workflow-inspector", { detail: { section, tabId } })
                    );
                },
                onExecutionsChanged: (hasExecutions: boolean) => {
                    contextRef.current = { ...contextRef.current, hasExecutions };
                    publishContext();
                },
                onPickerClosed: () => {
                    if (initialNavigationSettled && pickerTarget.current) closeWorkflowPicker();
                },
                request: (input: unknown) => request("editor-request", { input }),
                cancelRequest: (requestId: string) => request("editor-cancel", { input: { requestId } }),
                onDirty: async (dirty: boolean) => {
                    const sequence = ++dirtySequence.current;
                    await request("editor-state", {
                        input: { dirty, sequence, stateId: host.stateId, workflowId: host.workflowId },
                    });
                },
                onRoute: (path: string, workflowId: string) => {
                    if (!active || !initialNavigationSettled) return;
                    const nextWorkflowId = workflowId || host.workflowId || "";
                    contextRef.current = {
                        ...contextRef.current,
                        workflowId: nextWorkflowId,
                        hasExecutions:
                            nextWorkflowId === contextRef.current.workflowId ? contextRef.current.hasExecutions : false,
                    };
                    publishContext();
                    void request("editor-state", { input: { path, workflowId, stateId: host.stateId } }).catch(
                        (failure) => active && setError(String(failure))
                    );
                },
                onSelection: (id: string) =>
                    window.dispatchEvent(
                        new CustomEvent("kronterm:workflow-selection", {
                            detail: { tabId, id: id ? `workflow:${host.workflowId}:${id}` : undefined },
                        })
                    ),
                onCameraIntent: (intent: WorkflowCameraIntent) => callbacks.current.onCameraIntent(intent),
                onObjects: (nodes: any[]) => {
                    host.positions = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
                    callbacks.current.onObjects(
                        nodes.map((node) => ({
                            id: `workflow:${host.workflowId}:${node.id}`,
                            kind: "workflow-node",
                            text: node.name,
                            x: node.position.x,
                            y: node.position.y,
                            width: node.dimensions?.width || 100,
                            height: node.dimensions?.height || 100,
                        }))
                    );
                },
            } as WorkflowHost & Record<string, any>;
            bridge.current = host;
            dispose = await module.mountKronTermWorkflow(root, host);
            if (!active) {
                dispose?.();
                return;
            }
            host.setPanelTargets?.(currentPanelMounts());
            const latest = stateRef.current.desktop;
            if (latest && host.navigate) {
                const url = new URL(latest.url);
                await host.navigate(url.pathname + url.search);
            }
            initialNavigationSettled = true;
            if (pickerTarget.current) {
                host.setPickerTarget?.(nativeMount(pickerTarget.current, "inspector"));
                host.openPicker?.();
            }
            if (executionTarget.current) host.setExecutionTarget?.(nativeMount(executionTarget.current, "inspector"));
        };
        void mount().catch((failure) => {
            window.clearTimeout(loadingDeadline);
            if (active) {
                setError(String(failure));
                setLoading(false);
            }
        });
        return () => {
            active = false;
            window.clearTimeout(loadingDeadline);
            readyRef.current = false;
            dispose?.();
            bridge.current = null;
            widgetConnectionRef.current?.respond("The workflow editor was closed.");
            widgetConnectionRef.current = null;
            setWidgetConnection(null);
            callbacks.current.onObjects([]);
            chrome.current?.shadowRoot?.replaceChildren();
            detail.current?.shadowRoot?.replaceChildren();
            header.current?.shadowRoot?.replaceChildren();
            logs.current?.shadowRoot?.replaceChildren();
            reportPanelLayout({ top: 0, right: 0, bottom: 0 });
        };
    }, [open, tabId, retry, worldTarget, viewportTarget]);

    useEffect(() => {
        const host = bridge.current;
        if (!state.desktop || !host?.navigate) return;
        const url = new URL(state.desktop.url);
        void host.navigate(url.pathname + url.search).catch((failure) => setError(String(failure)));
    }, [state.desktop?.url]);

    const seenRevision = useRef<{ host: WorkflowHost; workflowId: string; revision: number }>(null);
    useEffect(() => {
        const revision = state.documentRevision ?? state.desktop?.revision;
        const host = bridge.current;
        const workflowId = state.documentWorkflowId ?? host?.workflowId;
        if (
            !revision ||
            !workflowId ||
            !host?.refreshDocument ||
            !readyRef.current ||
            host.workflowId !== workflowId
        )
            return;
        const applied = seenRevision.current;
        if (applied?.host === host && applied.workflowId === workflowId && applied.revision === revision) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        let lastFailure = "";
        const current = () =>
            active &&
            bridge.current === host &&
            host.workflowId === workflowId &&
            (stateRef.current.documentRevision ?? stateRef.current.desktop?.revision) === revision &&
            (stateRef.current.documentWorkflowId ?? host.workflowId) === workflowId;
        const refresh = async () => {
            if (!current()) return;
            if (host.getDocumentState?.()?.dirty) {
                timer = setTimeout(() => void refresh(), 2000);
                return;
            }
            try {
                const requestedVersion = host.getDocumentState?.()?.versionId;
                const draft = await request("get-workflow", { workflowId });
                if (!current() || draft?.id !== workflowId) return;
                const currentVersion = host.getDocumentState?.()?.versionId;
                if (currentVersion !== requestedVersion && draft.versionId !== currentVersion) {
                    timer = setTimeout(() => void refresh(), 2000);
                    return;
                }
                await host.refreshDocument(draft);
                if (!current()) return;
                seenRevision.current = { host, workflowId, revision };
                if (lastFailure) setError((previous) => (previous === lastFailure ? "" : previous));
            } catch (failure) {
                if (!current()) return;
                lastFailure = String(failure);
                setError(lastFailure);
                timer = setTimeout(() => void refresh(), 2000);
            }
        };
        void refresh();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [
        state.documentRevision,
        state.documentWorkflowId,
        state.desktop?.revision,
        state.desktop?.url,
        open,
        tabId,
        retry,
        loading,
    ]);

    useEffect(() => {
        if (!bridge.current) return;
        bridge.current.camera = camera;
        if (readyRef.current) bridge.current.setViewport?.(camera);
    }, [camera.x, camera.y, camera.zoom]);

    useEffect(() => {
        bridge.current?.setTheme?.(appearance.colorScheme);
    }, [appearance.colorScheme]);

    useEffect(() => {
        bridge.current?.setObjectOrder?.(objectOrder);
    }, [objectOrder]);

    const previousFocusedObject = useRef(selectedObjectId);
    useEffect(() => {
        const host = bridge.current;
        if (!host?.setSelection) return;
        if (
            previousFocusedObject.current !== selectedObjectId &&
            selectedObjectId &&
            !selectedObjectId.startsWith("workflow:")
        )
            host.closeNodeEditor?.();
        previousFocusedObject.current = selectedObjectId;
        const selection = getWorkflowSelectionCommand(selectedObjectId, host.workflowId, host.getSelection?.() ?? []);
        if (selection) host.setSelection(selection);
    }, [selectedObjectId, loading, state.selectedWorkflowId]);

    useEffect(() => {
        const close = () => bridge.current?.closeNodeEditor?.();
        window.addEventListener("kronterm:workflow-close-node-config", close);
        return () => window.removeEventListener("kronterm:workflow-close-node-config", close);
    }, []);

    const connectWidget = async (configuration: WorkflowWidgetConfiguration) => {
        if (!widgetConnection || connectingWidget) return;
        const connection = widgetConnection;
        setConnectingWidget(true);
        setWidgetError("");
        try {
            const host = bridge.current;
            if (!readyRef.current || !host?.insertWidgetNode || host.workflowId !== widgetConnection.workflowId)
                throw new Error("The workflow changed. Reconnect this widget.");
            const widgets = await request("workspace-widgets");
            if (
                widgetConnectionRef.current !== connection ||
                bridge.current !== host ||
                !readyRef.current ||
                host.workflowId !== connection.workflowId
            )
                throw new Error("The workflow changed. Reconnect this widget.");
            const widget = widgets.find((entry: WorkflowWidget) => entry.blockId === connection.widget.blockId);
            if (!widget) throw new Error("That widget is no longer in this workspace.");
            const parameters = workflowWidgetParameters(widget.view, configuration);
            if (parameters.computerId) parameters.assignedAgentId = `sandbox:${tabId}`;
            const result = await host.insertWidgetNode({
                ...widget,
                parameters,
                source: connection.source,
                workflowId: connection.workflowId,
            });
            connection.respond(undefined, result.nodeId);
            widgetConnectionRef.current = null;
            setWidgetConnection(null);
        } catch (failure) {
            setWidgetError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setConnectingWidget(false);
        }
    };
    const retryConnection = async () => {
        if (!bridge.current || (!readyRef.current && !bridge.current.getDocumentState?.()?.dirty)) {
            setRetry((value) => value + 1);
            return;
        }
        try {
            await request("editor-request", { input: { route: "/rest/login", method: "GET" } });
            setError("");
        } catch (failure) {
            setError(String(failure));
        }
    };
    return (
        <div ref={panelFrame} className="absolute inset-0 pointer-events-none">
            {pickerSource && visible && <OriginalNodePicker tabId={tabId} onClose={closeWorkflowPicker} />}
            {widgetConnection && (
                <WidgetConnectionDialog
                    key={widgetConnection.widget.blockId}
                    widget={widgetConnection.widget}
                    pending={connectingWidget}
                    error={widgetError}
                    onConnect={(configuration) => void connectWidget(configuration)}
                    onClose={() => {
                        if (connectingWidget) return;
                        widgetConnection.respond();
                        widgetConnectionRef.current = null;
                        setWidgetConnection(null);
                    }}
                />
            )}
            <section
                data-workflow-native-host=""
                aria-label="Workflow scene"
                hidden={!open || !visible}
                className="absolute inset-0 z-0 pointer-events-none"
            >
                <div ref={element} className="absolute inset-0 pointer-events-none" />
            </section>
            <div
                ref={chrome}
                data-workflow-chrome=""
                hidden={!open || !visible}
                className="absolute left-0 top-[64px] bottom-[12px] z-[1500] pointer-events-none"
                style={{ right: panelInsets.right }}
            />
            <div
                ref={detail}
                data-workflow-details=""
                hidden={!open || !visible}
                className="absolute right-0 bottom-[12px] z-[1700] pointer-events-none"
                style={{ top: Math.max(64, panelInsets.top), width: panelWidth }}
            />
            <div
                ref={header}
                hidden={!open || !visible || headerCollapsed}
                className="absolute left-3 top-[64px] z-[1500] h-24 w-[380px] max-w-[calc(100%_-_24px)] pointer-events-none"
                data-workflow-header-host=""
                data-workflow-chrome=""
            />
            <div
                ref={logs}
                hidden={!open || !visible || logsCollapsed}
                className="absolute left-3 bottom-3 z-[1500] h-[320px] max-h-[calc(100%_-_80px)] w-[560px] max-w-[calc(100%_-_24px)] overflow-auto pointer-events-none"
                data-workflow-chrome=""
            />
            {open &&
                visible &&
                shellControlsTarget &&
                createPortal(
                    <div className="flex items-center gap-1 pointer-events-auto">
                        <button
                            type="button"
                            aria-label={headerCollapsed ? "Show workflow controls" : "Hide workflow controls"}
                            aria-expanded={!headerCollapsed}
                            title={headerCollapsed ? "Show workflow controls" : "Hide workflow controls"}
                            onClick={() => setHeaderCollapsed((value) => !value)}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-black text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-white"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <rect x="3" y="4" width="18" height="16" rx="2" />
                                <path d="M3 9h18m-13 4h8" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            aria-label={logsCollapsed ? "Show workflow logs" : "Hide workflow logs"}
                            aria-expanded={!logsCollapsed}
                            title={logsCollapsed ? "Show workflow logs" : "Hide workflow logs"}
                            onClick={() => setLogsCollapsed((value) => !value)}
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-black text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-white"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <path d={logsCollapsed ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"} />
                            </svg>
                        </button>
                    </div>,
                    shellControlsTarget
                )}
            <OriginalExecutionsPanel active={executionRequested && open && visible} dockOnly />
            <div
                ref={executionDock}
                className="os-workflow-executions-dock"
                hidden={!open || !visible || !executionDockOpen}
            />
            <div
                data-workflow-chrome=""
                hidden={!open || !visible}
                className="absolute inset-0 z-[1800] pointer-events-none"
            >
                {loading && (
                    <p
                        role="status"
                        className="absolute left-4 top-4 z-50 rounded bg-background px-3 py-2 text-sm text-foreground pointer-events-auto"
                    >
                        Loading workflow components…
                    </p>
                )}
                {error && (
                    <div
                        role="alert"
                        className="absolute left-4 top-4 z-50 max-w-md rounded border border-red-400/30 bg-background p-3 text-sm text-foreground pointer-events-auto"
                    >
                        <p>{error}</p>
                        <button
                            type="button"
                            className="mt-2 cursor-pointer underline"
                            onClick={() => void retryConnection()}
                        >
                            Retry workflow connection
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
