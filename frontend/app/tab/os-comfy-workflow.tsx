// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { pinComfyOutput } from "@/app/view/rendercomparison/render-comparison";
import { comfyOrigin, type ComfyJob, type ComfyRenderRef, type ComfyWorkflow } from "@/types/comfyui";
import { WorkflowPickerResults } from "@hermes/app/workflows/workflow-picker-results";
import { $comfyControlsOpen } from "@hermes/lib/kronterm-sidebar";
import { $workflowPickerComfyTarget, $workflowPickerSource, closeWorkflowPicker } from "@hermes/store/command-palette";
import { useStore } from "@nanostores/react";
import { Box, Database } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadWorkflowEditor, type WorkflowCamera } from "./os-workflow-host";
import type { OSCanvasObject } from "./os-workspace-model";
import { WorkflowNodePickerPopup } from "./workflow-node-picker-popup";

type CatalogItem = { id: string; label: string; detail: string };
type ComfyNode = Omit<OSCanvasObject, "kind" | "text"> & { title: string };
export const ComfyLibraries = {
    assets: "Media Assets",
    workflows: "Workflows",
    apps: "Apps",
    "job-history": "Job History",
} as const;
export type ComfyLibrary = keyof typeof ComfyLibraries;
type ComfyPanels = { library: ComfyLibrary | null; properties: boolean; logs: boolean };
type ComfyPanelTargets = {
    libraryTarget: HTMLElement;
    propertiesTarget: HTMLElement;
    logsTarget: HTMLElement;
};
type ComfyEditor = {
    setCamera(camera: WorkflowCamera): void;
    setOrder(order: Record<string, number>): void;
    setPanels(panels: ComfyPanels): void;
    setPanelTargets(targets: ComfyPanelTargets): void;
    listNodes(query: string): CatalogItem[];
    listModels(): Promise<CatalogItem[]>;
    insertNode(id: string): boolean;
    placeModel(id: string): boolean;
    openPicker(point?: { x: number; y: number }): void;
    closePicker(): void;
    clearSelection(): void;
    importWorkflow(workflow: unknown): Promise<void>;
    exportWorkflow(): unknown;
    exportPrompt(): Promise<unknown>;
    run(): Promise<unknown>;
    moveNode(id: string, x: number, y: number): void;
    removeNode(id: string): void;
    dispose(): void;
};

type ComfyBundle = {
    mountComfyEditor(options: ComfyPanelTargets & {
        origin: string;
        world: HTMLElement;
        viewport: HTMLElement;
        overlayTarget: HTMLElement;
        panels: ComfyPanels;
        camera: WorkflowCamera;
        order: Record<string, number>;
        onReady(): void;
        onError(error: unknown): void;
        onNodes(nodes: ComfyNode[]): void;
        onSelect(id: string): void;
        onClosePanel(panel: "library" | "properties"): void;
        onPickerChange(open: boolean): void;
    }): Promise<ComfyEditor>;
};

function mountTarget(host: HTMLElement, stylesheet: URL, layout: string) {
    if (!host) return null;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const existing = shadow.querySelector<HTMLElement>("[data-comfy-mount]");
    if (existing) return existing;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheet.href;
    const style = document.createElement("style");
    style.textContent = layout;
    const target = document.createElement("div");
    target.dataset.comfyMount = "";
    shadow.replaceChildren(link, style, target);
    return target;
}

const PanelLayout = "[data-comfy-mount] { width: 100%; height: 100%; min-height: 0; }";
const OverlayLayout = `${PanelLayout}
    div.comfy-modal { position: fixed; inset: 0; align-items: center; justify-content: center; background: #0008; pointer-events: auto; }
    .comfy-modal-content { max-width: min(640px, 90vw); max-height: 85vh; overflow: auto; padding: 16px; border-radius: 8px; background: var(--color-background, #191a1c); }
`;

export function OSComfyWorkflow({
    tabId,
    active,
    visible,
    camera,
    order,
    world,
    controlsTarget,
    libraryTarget,
    propertiesTarget,
    logsTarget,
    panels,
    allowCanvasPicker,
    onActivate,
    onTogglePanel,
    onClosePanel,
    onReady,
    onNodes,
    onSelect,
    onFit,
    onClose,
}: {
    tabId: string;
    active: boolean;
    visible: boolean;
    camera: WorkflowCamera;
    order: Record<string, number>;
    world: HTMLElement;
    controlsTarget?: HTMLElement | null;
    libraryTarget: HTMLElement;
    propertiesTarget: HTMLElement;
    logsTarget: HTMLElement;
    panels: ComfyPanels;
    allowCanvasPicker: boolean;
    onActivate(): void;
    onTogglePanel(panel: "library" | "properties" | "logs"): void;
    onClosePanel(panel: "library" | "properties"): void;
    onReady(ready: boolean): void;
    onNodes(objects: OSCanvasObject[]): void;
    onSelect(id: string): void;
    onFit(nodes: OSCanvasObject[]): void;
    onClose(): void;
}) {
    const [address, setAddress] = useState("http://127.0.0.1:8188");
    const [origin, setOrigin] = useState("");
    const [engineOrigin, setEngineOrigin] = useState("");
    const [renderJob, setRenderJob] = useState<ComfyJob>();
    const [renderPreview, setRenderPreview] = useState<{ render: ComfyRenderRef; data: string; digest: string }>();
    const [renderSubmitting, setRenderSubmitting] = useState(false);
    const [renderPinning, setRenderPinning] = useState(false);
    const [renderPinned, setRenderPinned] = useState(false);
    const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const controlsOpen = useStore($comfyControlsOpen);
    const pickerSource = useStore($workflowPickerSource);
    const pickerTarget = useStore($workflowPickerComfyTarget);
    const pickerSlot = pickerTarget?.tabId === tabId ? pickerTarget : null;
    const catalogOpen = Boolean(pickerSlot);
    const nodesOnly = pickerSource === "comfy-nodes";
    const modelsOnly = pickerSource === "comfy-models";
    const showModels = catalogOpen && !nodesOnly;
    const [models, setModels] = useState<CatalogItem[]>(null);
    const [modelError, setModelError] = useState("");
    const [catalogError, setCatalogError] = useState("");
    const [connectFromPicker, setConnectFromPicker] = useState(false);
    const connecting = useRef(false);
    const autoConnectRequested = useRef(false);
    const editor = useRef<ComfyEditor>(null);
    const objects = useRef<OSCanvasObject[]>([]);
    const stage = useRef<HTMLDivElement>(null);
    const overlay = useRef<HTMLDivElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const targets = { libraryTarget, propertiesTarget, logsTarget };
    const targetsRef = useRef(targets);
    targetsRef.current = targets;
    const panelMounts = (): ComfyPanelTargets => {
        const stylesheet = new URL("./comfy-native/assets/editor.css", document.baseURI);
        const targets = targetsRef.current;
        return {
            libraryTarget: mountTarget(targets.libraryTarget, stylesheet, PanelLayout),
            propertiesTarget: mountTarget(targets.propertiesTarget, stylesheet, PanelLayout),
            logsTarget: mountTarget(targets.logsTarget, stylesheet, PanelLayout),
        };
    };
    const current = useRef({ camera, order, onNodes, onSelect, visible, panels, onClosePanel, onReady });
    current.current = { camera, order, onNodes, onSelect, visible, panels, onClosePanel, onReady };
    const controlsWereOpen = useRef(false);
    useEffect(() => {
        const open = active && controlsOpen;
        if (open && !controlsWereOpen.current && !visible && !controlsTarget) onActivate();
        controlsWereOpen.current = open;
    }, [active, controlsOpen, controlsTarget, visible, onActivate]);
    useEffect(() => {
        current.current.onNodes(visible ? objects.current : []);
    }, [visible]);
    useEffect(() => {
        editor.current?.setCamera(camera);
    }, [camera]);
    useEffect(() => {
        editor.current?.setOrder(order);
    }, [order]);
    useEffect(() => {
        editor.current?.setPanels(panels);
    }, [panels]);
    useEffect(() => {
        editor.current?.setPanelTargets(panelMounts());
    }, [libraryTarget, propertiesTarget, logsTarget]);
    useEffect(() => {
        setCatalogError("");
        if (!pickerSource) {
            editor.current?.closePicker();
            setConnectFromPicker(false);
        }
    }, [pickerSource]);
    useEffect(() => {
        const comfy = editor.current;
        if (!showModels || status !== "ready" || !comfy) return;
        let active = true;
        setModels(null);
        setModelError("");
        void comfy.listModels().then(
            (result) => {
                if (active) setModels(result);
            },
            (failure) => {
                if (active) setModelError(failure instanceof Error ? failure.message : String(failure));
            }
        );
        return () => {
            active = false;
        };
    }, [showModels, status]);
    useEffect(() => {
        const viewport = stage.current?.parentElement;
        if (!viewport || !visible) return;
        const onCanvas = (event: MouseEvent) =>
            event.target === viewport ||
            (event.target instanceof HTMLElement && event.target.classList.contains("os-desktop-layer"));
        const openPicker = (event: MouseEvent) => {
            if (allowCanvasPicker && onCanvas(event))
                editor.current?.openPicker({ x: event.clientX, y: event.clientY });
        };
        const clearSelection = (event: PointerEvent) => {
            if (event.button === 0 && onCanvas(event)) editor.current?.clearSelection();
        };
        viewport.addEventListener("dblclick", openPicker);
        viewport.addEventListener("pointerdown", clearSelection);
        return () => {
            viewport.removeEventListener("dblclick", openPicker);
            viewport.removeEventListener("pointerdown", clearSelection);
        };
    }, [allowCanvasPicker, visible]);
    useEffect(() => {
        if (!origin || !world || !stage.current) return;
        let cancelled = false;
        let ready = false;
        let signaledReady = false;
        let failed = false;
        let mounted: ComfyEditor;
        const viewportHost = stage.current;
        const overlayHost = overlay.current;
        const reportError = (reason: unknown) => {
            if (cancelled) return;
            if (!ready) {
                failed = true;
                setOrigin("");
                setStatus("idle");
            }
            setError(reason instanceof Error ? reason.message : String(reason));
        };
        const deadline = window.setTimeout(
            () => reportError(new Error("KronRender did not finish loading. Check the server and reconnect.")),
            45000
        );
        const publishReady = () => {
            if (cancelled || failed || ready || !signaledReady || !mounted) return;
            ready = true;
            window.clearTimeout(deadline);
            setStatus("ready");
            current.current.onReady(true);
        };

        async function mount() {
            const bundle = await loadWorkflowEditor<ComfyBundle>("comfy-native").catch(() => {
                throw new Error("Could not load the KronRender canvas components. Run npm run build:comfy-editor.");
            });
            if (cancelled || failed) return;
            const stylesheet = new URL("./comfy-native/assets/editor.css", document.baseURI);
            const worldTarget = mountTarget(
                world,
                stylesheet,
                "[data-comfy-mount] { display: contents; } .lg-node { left: 0; top: 0; }"
            );
            const viewportTarget = mountTarget(
                viewportHost,
                stylesheet,
                "[data-comfy-mount] { position: absolute; inset: 0; }"
            );
            mounted = await bundle.mountComfyEditor({
                origin,
                viewport: viewportTarget,
                world: worldTarget,
                ...panelMounts(),
                overlayTarget: mountTarget(overlayHost, stylesheet, OverlayLayout),
                panels: current.current.panels,
                camera: current.current.camera,
                order: current.current.order,
                onReady: () => {
                    signaledReady = true;
                    publishReady();
                },
                onError: reportError,
                onNodes: (nodes) => {
                    if (cancelled) return;
                    objects.current = nodes.map(({ id, title, ...bounds }) => ({
                        ...bounds,
                        id: `comfy:${id}`,
                        kind: "workflow-node",
                        text: title,
                    }));
                    if (current.current.visible) current.current.onNodes(objects.current);
                },
                onSelect: (id) => {
                    if (!cancelled) current.current.onSelect(`comfy:${id}`);
                },
                onClosePanel: (panel) => {
                    if (!cancelled) current.current.onClosePanel(panel);
                },
                onPickerChange: (open) => {
                    if (!cancelled && open) $workflowPickerSource.set("comfy-nodes");
                },
            });
            if (cancelled) mounted.dispose();
            else {
                editor.current = mounted;
                mounted.setCamera(current.current.camera);
                mounted.setOrder(current.current.order);
                mounted.setPanels(current.current.panels);
                mounted.setPanelTargets(panelMounts());
                publishReady();
            }
        }

        void mount().catch(reportError);
        return () => {
            cancelled = true;
            window.clearTimeout(deadline);
            mounted?.dispose();
            editor.current = null;
            objects.current = [];
            current.current.onNodes([]);
            current.current.onReady(false);
        };
    }, [origin, world]);

    useEffect(() => {
        const command = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.tabId !== tabId || !detail.objectId?.startsWith("comfy:") || !editor.current) return;
            const id = detail.objectId.slice(6);
            if (detail.remove) editor.current.removeNode(id);
            else if (Number.isFinite(detail.patch?.x) && Number.isFinite(detail.patch?.y))
                editor.current.moveNode(id, detail.patch.x, detail.patch.y);
            else {
                detail.result = { success: false, message: "Supply both canvas coordinates to move a KronRender node." };
                return;
            }
            detail.result = { success: true, message: "Updated KronRender workflow." };
        };
        window.addEventListener("kronterm:workflow-object-command", command);
        return () => window.removeEventListener("kronterm:workflow-object-command", command);
    }, [tabId]);

    const report = (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason));
    const runRender = async () => {
        if (renderSubmitting || !engineOrigin) return;
        setRenderSubmitting(true);
        setRenderJob(undefined);
        setRenderPreview(undefined);
        setRenderPinned(false);
        setError("");
        try {
            const workflow = await editor.current?.exportPrompt() as ComfyWorkflow;
            if (!workflow) throw new Error("Open a KronRender workflow first.");
            const { job } = await getApi().comfyUiRequest({ action: "submit", origin: engineOrigin, workflow });
            if (!job) throw new Error("KronRender did not return a job ID.");
            setRenderJob(job);
        } catch (reason) {
            report(reason);
        } finally {
            setRenderSubmitting(false);
        }
    };
    const renderJobId = renderJob?.id;
    const renderOrigin = renderJob?.origin;
    useEffect(() => {
        if (!renderJobId || !renderOrigin) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const update = async () => {
            try {
                const { jobs } = await getApi().comfyUiRequest({ action: "refresh", origin: renderOrigin, id: renderJobId });
                if (stopped || !jobs?.[0]) return;
                const job = jobs[0];
                setRenderJob(job);
                if (["queued", "running", "cancel-requested"].includes(job.status) ||
                    (job.status === "unknown" && Date.now() - job.createdAt < 15000)) {
                    timer = setTimeout(update, 2500);
                } else if (job.status === "completed" && job.images[0]) {
                    const render = { origin: renderOrigin, id: renderJobId, image: job.images[0] };
                    const result = await getApi().comfyUiRequest({ action: "image", ...render });
                    if (!stopped && result.imageData && result.previewDigest)
                        setRenderPreview({ render, data: result.imageData, digest: result.previewDigest });
                }
            } catch (reason) {
                if (!stopped) setError(reason instanceof Error ? reason.message : String(reason));
            }
        };
        void update();
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [renderJobId, renderOrigin]);
    const connect = useCallback(async () => {
        if (connecting.current || status !== "idle") return;
        connecting.current = true;
        if (!visible && !controlsTarget && !(active && controlsOpen)) onActivate();
        setError("");
        setStatus("loading");
        setOrigin("");
        try {
            const url = comfyOrigin(address);
            void loadWorkflowEditor<ComfyBundle>("comfy-native").catch(() => {});
            const { editorUrl } = await getApi().comfyUiRequest({ action: "editor", origin: url });
            if (!editorUrl) throw new Error("KronRender editor could not connect.");
            setEngineOrigin(url);
            setOrigin(editorUrl);
        } catch (reason) {
            setStatus("idle");
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            connecting.current = false;
        }
    }, [active, address, controlsOpen, controlsTarget, onActivate, status, visible]);

    const connectionRequested =
        (active && controlsOpen) || (catalogOpen && (nodesOnly || modelsOnly || connectFromPicker));
    useEffect(() => {
        if (connectionRequested && !autoConnectRequested.current) void connect();
        autoConnectRequested.current = connectionRequested;
    }, [connect, connectionRequested]);

    const exportWorkflow = async (apiFormat = false) => {
        if (!editor.current) return;
        const graph = apiFormat ? await editor.current.exportPrompt() : editor.current.exportWorkflow();
        const url = URL.createObjectURL(new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = apiFormat ? "workflow-api.json" : "workflow.json";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const copyMcp = async () => {
        try {
            await navigator.clipboard.writeText(
                JSON.stringify(
                    {
                        mcpServers: {
                            "comfy-mcp": {
                                command: "uvx",
                                args: ["--with", "comfy-cli>=1.14.0", "comfy-mcp"],
                                env: { COMFY_LOCAL_URL: comfyOrigin(address) },
                            },
                        },
                    },
                    null,
                    2
                )
            );
            setCopied(true);
        } catch (reason) {
            report(reason);
        }
    };
    const button =
        "cursor-pointer rounded-md px-2 py-1 text-xs font-medium hover:bg-muted aria-pressed:bg-muted disabled:opacity-50";

    const connectionForm = (
        <form
            className="kronterm-catalog-connect flex items-center gap-1"
            onSubmit={(event) => {
                event.preventDefault();
                void connect();
            }}
        >
            <input
                aria-label="Local KronRender address"
                className="w-48 rounded bg-muted px-2 py-1 text-xs"
                value={address}
                onChange={(event) => {
                    setAddress(event.currentTarget.value);
                    setCopied(false);
                }}
                disabled={status === "loading"}
            />
            <button className={button} disabled={status === "loading"}>
                {status === "loading" ? "Connecting…" : "Connect"}
            </button>
        </form>
    );

    const query = pickerSlot?.query.trim() ?? "";
    const nodeQuery = /^(?:kronrender|comfyui)$/i.test(query) ? "" : query;
    const nodeMatches =
        status === "ready" && catalogOpen && !modelsOnly ? (editor.current?.listNodes(nodeQuery) ?? []) : [];
    const modelMatches = showModels
        ? (models ?? []).filter((item) =>
              `KronRender model ${item.label} ${item.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
          )
        : [];
    const choose = (id: string, model = false) => {
        const comfy = editor.current;
        if (!pickerSlot || !comfy) return;
        onActivate();
        const insert = () => {
            if (editor.current !== comfy || $workflowPickerComfyTarget.get()?.element !== pickerSlot.element) return;
            const inserted = model ? comfy.placeModel(id) : comfy.insertNode(id);
            if (inserted) {
                setCatalogError("");
                closeWorkflowPicker();
            } else {
                setCatalogError(
                    model ? "This model has no compatible loader node." : "Could not add this KronRender node."
                );
            }
        };
        if (visible) insert();
        else requestAnimationFrame(insert);
    };
    const nodeRows = pickerSlot && !modelsOnly && (
        <WorkflowPickerResults
            overflow={pickerSlot.overflow}
            previewCount={nodesOnly ? 3 : 1}
            entries={nodeMatches.map((item) => ({
                ...item,
                detail: nodesOnly ? item.detail : ["KronRender", item.detail].filter(Boolean).join(" · "),
                icon: <Box size={20} />,
                onSelect: () => choose(item.id),
            }))}
        />
    );
    const modelRows = showModels && (
        <WorkflowPickerResults
            overflow={pickerSlot.overflow}
            previewCount={modelsOnly ? 3 : 1}
            entries={modelMatches.map((item) => ({
                ...item,
                detail: modelsOnly ? item.detail : `KronRender model · ${item.detail}`,
                icon: <Database size={20} />,
                onSelect: () => choose(item.id, true),
            }))}
        />
    );

    const controls = (
        <section
            className="flex flex-wrap items-center gap-1 bg-[#191a1c] p-2 text-white"
            aria-label="KronRender workflow controls"
            data-workflow-chrome=""
            onPointerDown={(event) => event.stopPropagation()}
        >
            {status !== "ready" ? (
                connectionForm
            ) : (
                <>
                    <button
                        className={button}
                        onClick={() => {
                            $comfyControlsOpen.set(false);
                            if (controlsTarget) onActivate();
                            editor.current?.openPicker();
                        }}
                    >
                        Add node
                    </button>
                    <button
                        className={button}
                        aria-pressed={!!panels.library}
                        onClick={() => {
                            if (controlsTarget) onActivate();
                            onTogglePanel("library");
                        }}
                    >
                        Libraries
                    </button>
                    <button
                        className={button}
                        aria-pressed={panels.properties}
                        onClick={() => {
                            if (controlsTarget) onActivate();
                            onTogglePanel("properties");
                        }}
                    >
                        Node Properties
                    </button>
                    <button className={button} aria-pressed={panels.logs} onClick={() => {
                            if (controlsTarget) onActivate();
                            onTogglePanel("logs");
                        }}>
                        Logs
                    </button>
                    <button className={button} onClick={() => {
                            if (controlsTarget) onActivate();
                            onFit(objects.current);
                        }}>
                        Fit nodes
                    </button>
                    <button className={button} onClick={() => fileInput.current?.click()}>
                        Import
                    </button>
                    <button className={button} onClick={() => void exportWorkflow().catch(report)}>
                        Export
                    </button>
                    <button className={button} onClick={() => void exportWorkflow(true).catch(report)}>
                        Export for MCP
                    </button>
                    <button className={button} onClick={() => void editor.current?.run().catch(report)}>
                        Run
                    </button>
                    <button className={button} disabled={renderSubmitting || renderPinning} onClick={() => void runRender()}>
                        {renderSubmitting ? "Queuing…" : "Run for comparison"}
                    </button>
                    {renderJob && (
                        <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                            {renderPreview && <img src={renderPreview.data} alt="Latest KronRender output" className="h-12 w-12 rounded object-cover" />}
                            <span role="status" className="text-xs">
                                {renderJob.error || (renderPinned ? "Pinned to canvas" : `Latest render · ${renderJob.status}`)}
                            </span>
                            {renderPreview && !renderPinned && (
                                <button className={button} disabled={renderPinning || renderSubmitting}
                                    onClick={() => {
                                        setRenderPinning(true);
                                        void pinComfyOutput(tabId, renderPreview.render, renderPreview.digest)
                                            .then(() => setRenderPinned(true)).catch(report).finally(() => setRenderPinning(false));
                                    }}>
                                    {renderPinning ? "Pinning…" : "Pin to canvas"}
                                </button>
                            )}
                        </div>
                    )}
                    <input
                        ref={fileInput}
                        hidden
                        type="file"
                        accept=".json,application/json"
                        onChange={async (event) => {
                            const input = event.currentTarget;
                            const file = input.files?.[0];
                            input.value = "";
                            if (!file) return;
                            try {
                                await editor.current?.importWorkflow(JSON.parse(await file.text()));
                            } catch (reason) {
                                report(reason);
                            }
                        }}
                    />
                </>
            )}
            <button
                className={button}
                title="Import in Hermes Capabilities → MCP"
                onClick={() => void copyMcp()}
            >
                {copied ? "MCP copied" : "Copy MCP config"}
            </button>
            <button
                className={button}
                onClick={() => {
                    $comfyControlsOpen.set(false);
                    onClose();
                }}
            >
                Hide KronRender
            </button>
            {error && (
                <p className="basis-full px-1 text-xs text-red-400" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
    return (
        <>
            <div
                ref={stage}
                className={active && visible ? "pointer-events-none absolute inset-0" : "hidden"}
                aria-hidden={!active || !visible}
            />
            {pickerSlot &&
                createPortal(
                    status === "ready" ? (
                        <>
                            {nodeRows}
                            {modelRows}
                            {nodesOnly && !nodeMatches.length && (
                                <p role="status" className="kronterm-catalog-empty">
                                    {query
                                        ? "No nodes match this search."
                                        : "No nodes available on this KronRender server."}
                                </p>
                            )}
                            {modelsOnly && !modelMatches.length && (
                                <p role="status" className="kronterm-catalog-empty">
                                    {modelError ||
                                        (models == null
                                            ? "Loading models…"
                                            : query
                                              ? "No models match this search."
                                              : "No models installed on this KronRender server.")}
                                </p>
                            )}
                            {catalogError && (
                                <p role="alert" className="kronterm-catalog-empty">
                                    {catalogError}
                                </p>
                            )}
                        </>
                    ) : connectFromPicker || pickerSource?.startsWith("comfy") ? (
                        <>
                            {connectionForm}
                            {error && (
                                <p role="alert" className="kronterm-catalog-empty">
                                    {error}
                                </p>
                            )}
                        </>
                    ) : !query || "connect comfyui".includes(query.toLowerCase()) ? (
                        <WorkflowPickerResults
                            overflow={pickerSlot.overflow}
                            entries={[
                                {
                                    id: "connect",
                                    label: "Connect KronRender",
                                    icon: <Box size={20} />,
                                    onSelect: () => setConnectFromPicker(true),
                                },
                            ]}
                        />
                    ) : null,
                    pickerSlot.element
                )}
            {createPortal(
                <div
                    ref={overlay}
                    hidden={!visible}
                    className="pointer-events-none fixed inset-0 z-[60010]"
                    data-workflow-panel=""
                />,
                document.body
            )}
            {controlsTarget ? createPortal(controls, controlsTarget) : (
                <WorkflowNodePickerPopup
                    open={active && visible && controlsOpen}
                    label="KronRender controls"
                    title="KronRender"
                    compact
                    onClose={() => $comfyControlsOpen.set(false)}
                >
                    {controls}
                </WorkflowNodePickerPopup>
            )}
        </>
    );
}
