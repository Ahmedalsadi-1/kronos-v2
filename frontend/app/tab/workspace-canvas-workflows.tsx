// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atoms, getApi } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { submitToHermes } from "@/app/view/hermes/hermes-quick-submit";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { ProjectEnvironmentLauncher } from "@/app/workspace/project-environment-launcher";
import type { SavedWorkflow, WorkflowCommand, WorkflowRun, WorkflowSnapshot, WorkflowTarget } from "@/types/workflow";
import { type WorkflowNode, type WorkflowNodeKind } from "@/types/workflow-graph";
import { useAtomValue } from "jotai";
import { GitBranch, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceCanvasCamera, WorkspaceCanvasRect } from "./workspace-canvas-utils";
import {
    canvasWorkflowEdgePath,
    canvasWorkflowNodeRect,
    connectCanvasWorkflow,
    emptyCanvasWorkflow,
    makeCanvasWorkflowDefinition,
    removeCanvasWorkflowNode,
    type CanvasWorkflowDraft,
} from "./workspace-canvas-workflow-model";
import "./workspace-canvas-workflows.css";

const PendingDraftWrites = new Map<string, Promise<void>>();

function writeCanvasDraft(tabId: string, draft: CanvasWorkflowDraft): Promise<void> {
    const previous = PendingDraftWrites.get(tabId) ?? Promise.resolve();
    const next = previous
        .catch(() => {})
        .then(() =>
            RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("tab", tabId),
                meta: { "layout:workflow": draft } as unknown as MetaType,
            })
        );
    PendingDraftWrites.set(tabId, next);
    void next
        .finally(() => {
            if (PendingDraftWrites.get(tabId) === next) PendingDraftWrites.delete(tabId);
        })
        .catch(() => {});
    return next;
}

export function CanvasWorkflows({
    tabId,
    tabData,
    rects,
    camera,
    selectedBlockId,
    onFocusBlock,
}: {
    tabId: string;
    tabData: Tab;
    rects: Record<string, WorkspaceCanvasRect>;
    camera: WorkspaceCanvasCamera;
    selectedBlockId: string;
    onFocusBlock: (id: string) => void;
}) {
    const workspace = useAtomValue(atoms.workspace);
    const config = useAtomValue(atoms.fullConfigAtom);
    const stored = (tabData.meta as Record<string, unknown>)?.["layout:workflow"] as CanvasWorkflowDraft;
    const [draft, setDraft] = useState<CanvasWorkflowDraft>(() =>
        stored?.graph?.version === 1 ? stored : emptyCanvasWorkflow()
    );
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string>();
    const [connectionSource, setConnectionSource] = useState<string>();
    const [transferOutput, setTransferOutput] = useState(false);
    const [snapshot, setSnapshot] = useState<WorkflowSnapshot>({ runs: [], workflows: [] });
    const [runId, setRunId] = useState<string>();
    const [intervalMinutes, setIntervalMinutes] = useState(60);
    const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [missedRunPolicy, setMissedRunPolicy] = useState<"skip" | "run-once">("skip");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [workflowIntent, setWorkflowIntent] = useState("");
    const [history, setHistory] = useState<CanvasWorkflowDraft[]>([]);
    const [future, setFuture] = useState<CanvasWorkflowDraft[]>([]);
    const persistVersion = useRef(0);
    const queuedRevision = useRef(0);
    const latestDraft = useRef(draft);
    const mounted = useRef(true);
    const drag = useRef<{ id: string; x: number; y: number; original: CanvasWorkflowDraft }>(undefined);
    const api = getApi();
    const activeNode = draft.graph.nodes.find((node) => node.id === selected);
    const run = snapshot.runs.find((value) => value.id === runId);
    const savedDraft = draft.savedWorkflow;
    const savedWorkflow = snapshot.workflows.find((value) => value.id === savedDraft?.id);
    const savedVersionChanged = savedWorkflow && (savedWorkflow.version ?? 1) !== savedDraft.version;
    const canSchedule = savedWorkflow && !savedDraft.dirty && !savedVersionChanged;
    const schedules = (snapshot.schedules ?? []).filter((value) => value.workflowId === savedDraft?.id);
    const target: WorkflowTarget = {
        workspaceId: workspace?.oid ?? tabId,
        tabId,
        blockIds: [...new Set(draft.graph.nodes.map((node) => node.blockId).filter(Boolean))],
        environment: draft.target?.environment ?? "workspace",
        computerId: draft.target?.computerId || undefined,
        repository: draft.target?.repository || undefined,
    };

    useEffect(() => {
        mounted.current = true;
        const off = api.onWorkflowChanged?.((value) => {
            if (mounted.current) setSnapshot(value);
        });
        if (api.workflowCommand)
            void api
                .workflowCommand({ action: "list" })
                .then((value) => {
                    if (mounted.current) setSnapshot(value as WorkflowSnapshot);
                })
                .catch((reason) => {
                    if (mounted.current) setError(String(reason));
                });
        return () => {
            mounted.current = false;
            off?.();
        };
    }, [api]);

    useEffect(() => {
        if (
            !persistVersion.current &&
            stored?.graph?.version === 1 &&
            Array.isArray(stored.graph.nodes) &&
            Array.isArray(stored.graph.edges)
        ) {
            latestDraft.current = stored;
            setDraft(stored);
        }
    }, [stored]);
    useEffect(() => {
        if (!persistVersion.current) return;
        const revision = persistVersion.current;
        const timer = window.setTimeout(() => {
            queuedRevision.current = revision;
            void writeCanvasDraft(tabId, draft).catch((reason) => {
                if (mounted.current) setError(`Could not save canvas draft: ${String(reason)}`);
            });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [draft, tabId]);
    useEffect(
        () => () => {
            if (persistVersion.current > queuedRevision.current)
                void writeCanvasDraft(tabId, latestDraft.current).catch(() => {});
        },
        [tabId]
    );

    const commitDraft = (next: CanvasWorkflowDraft) => {
        persistVersion.current++;
        latestDraft.current = next;
        if (mounted.current) {
            setDraft(next);
        } else {
            void writeCanvasDraft(tabId, next).catch((reason) => console.warn("Could not save canvas draft", reason));
        }
    };
    const change = (next: CanvasWorkflowDraft, record = true) => {
        if (record) {
            setHistory((values) => [...values.slice(-49), draft]);
            setFuture([]);
        }
        const saved = latestDraft.current.savedWorkflow;
        commitDraft({ ...next, savedWorkflow: saved && { ...saved, dirty: true } });
        setError("");
        setNotice("");
    };
    const loadSavedWorkflow = (saved: SavedWorkflow) => {
        if (!saved.graph) return;
        commitDraft({
            title: saved.title,
            graph: structuredClone(saved.graph),
            target: {
                environment: saved.target.environment,
                computerId: saved.target.computerId,
                repository: saved.target.repository,
            },
            savedWorkflow: { id: saved.id, version: saved.version ?? 1 },
        });
        setHistory([]);
        setFuture([]);
        setSelected(undefined);
        setRunId(undefined);
        setConnectionSource(undefined);
        setError("");
        setNotice("");
    };
    const patchNode = (patch: Partial<WorkflowNode>) =>
        change({
            ...draft,
            graph: {
                ...draft.graph,
                nodes: draft.graph.nodes.map((node) => (node.id === selected ? { ...node, ...patch } : node)),
            },
        });
    const addNode = (kind: WorkflowNodeKind, blockId?: string) => {
        if (blockId && draft.graph.nodes.some((node) => node.blockId === blockId)) {
            setSelected(draft.graph.nodes.find((node) => node.blockId === blockId).id);
            return;
        }
        const id = `node-${crypto.randomUUID()}`;
        const block = blockId
            ? globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)))
            : undefined;
        const node: WorkflowNode = {
            id,
            kind,
            blockId,
            engine: kind === "computer" ? "computer" : undefined,
            title: blockId
                ? String(block?.meta?.["frame:title"] || block?.meta?.view || `Widget ${draft.graph.nodes.length + 1}`)
                : kind === "review"
                  ? "Review outputs"
                  : kind === "launch"
                    ? "Open widget"
                    : kind === "computer"
                      ? "Computer task"
                      : "Agent task",
            instruction:
                kind === "review"
                    ? "Review the upstream outputs before continuing."
                    : kind === "launch"
                      ? "Open the configured widget."
                      : "",
            ...(kind === "launch" ? { launch: { view: "term" as const } } : {}),
            inputs: [{ id: "input", type: "text" }],
            outputs: [{ id: "output", type: "text" }],
            position: {
                x: (280 - camera.x) / camera.zoom + draft.graph.nodes.length * 40,
                y: (100 - camera.y) / camera.zoom + draft.graph.nodes.length * 150,
            },
        };
        change({ ...draft, graph: { ...draft.graph, nodes: [...draft.graph.nodes, node] } });
        setSelected(id);
    };
    const connect = (id: string) => {
        if (!connectionSource) {
            setConnectionSource(id);
            return;
        }
        try {
            change({ ...draft, graph: connectCanvasWorkflow(draft.graph, connectionSource, id, transferOutput) });
            setConnectionSource(undefined);
        } catch (reason) {
            setError(String(reason));
        }
    };
    const perform = async (command: WorkflowCommand) => {
        if (!api.workflowCommand) {
            setError("Workflow execution is unavailable in this session.");
            return;
        }
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const value = await api.workflowCommand(command);
            if (mounted.current) {
                try {
                    const next = (await api.workflowCommand({ action: "list" })) as WorkflowSnapshot;
                    if (mounted.current) setSnapshot(next);
                } catch (reason) {
                    if (mounted.current) setError(`Could not refresh workflows: ${String(reason)}`);
                }
            }
            return value;
        } catch (reason) {
            if (mounted.current) setError(String(reason));
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    const definition = () => makeCanvasWorkflowDefinition(draft, target, tabData.blockids ?? []);
    const start = async () => {
        try {
            const value = (await perform({
                ...definition(),
                action: "create",
                conversationId: `canvas-${tabId}-${crypto.randomUUID()}`,
            })) as WorkflowRun;
            if (value && mounted.current) {
                setRunId(value.id);
                setNotice("Run queued. Progress and evidence appear below.");
            }
        } catch (reason) {
            setError(String(reason));
        }
    };
    const save = async (asNew = false) => {
        const revision = persistVersion.current;
        try {
            const existing = asNew ? undefined : savedDraft;
            if (existing && !savedWorkflow) {
                throw new Error("The saved workflow is unavailable. Save as a new workflow to keep this draft.");
            }
            const nextDefinition = makeCanvasWorkflowDefinition(
                draft,
                target,
                tabData.blockids ?? [],
                existing ? savedWorkflow : undefined
            );
            const value = (await perform(
                existing
                    ? {
                          action: "update-workflow",
                          workflowId: existing.id,
                          expectedVersion: existing.version,
                          definition: nextDefinition,
                      }
                    : { action: "save-definition", definition: nextDefinition }
            )) as SavedWorkflow;
            if (value) {
                const dirty = revision !== persistVersion.current;
                commitDraft({
                    ...latestDraft.current,
                    savedWorkflow: { id: value.id, version: value.version ?? 1, dirty },
                });
                if (mounted.current && !dirty) setNotice("Workflow saved. It is available in Hermes Workflows.");
            }
        } catch (reason) {
            if (mounted.current) setError(String(reason));
        }
    };
    const schedule = async () => {
        if (!canSchedule) return;
        await perform({
            action: "upsert-schedule",
            schedule: {
                workflowId: savedDraft.id,
                conversationId: `canvas-schedule-${tabId}`,
                timezone,
                intervalMinutes,
                startAt: Date.now() + intervalMinutes * 60000,
                enabled: true,
                missedRunPolicy,
            },
        });
    };
    const generateDraft = async () => {
        setBusy(true);
        setError("");
        try {
            const context = await api.workflowContext();
            if (context.tabId !== tabId) throw new Error("Return to this canvas before generating its workflow.");
            hermesSurfaceController.requestOpenChat();
            submitToHermes(
                [
                    "Create an editable KronOS canvas workflow draft for this request. Do not execute or schedule it.",
                    workflowIntent.trim(),
                    `Bound target: ${JSON.stringify({ ...target, blockIds: tabData.blockids ?? [] })}`,
                    `Available widgets: ${JSON.stringify(context.blocks)}`,
                    "Use workflow_run action save-definition with a definition (id, title, kind automation, target, parameters {task: a concrete task description}, steps [], graph).",
                    "Graph version 1 uses nodes {id,kind,title,instruction,blockId?,engine?,position?} and edges {id,source,target}.",
                    "Kinds: agent, terminal, browser, widget, review, launch. Widget/terminal/browser nodes need a bound blockId. Launch has launch:{view:term|web|preview,root?,url?,connection?}.",
                    "Engines: kronoscode uses the managed ACP coding agent. Computer is an independent accessibility-only native macOS loop using a configured direct OpenAI/Anthropic AI preset; it does not use the Hermes model router. Use kronoscode for workspace widgets and managed machines.",
                    "Give unbound task nodes canvas positions. Use explicit verifiable instructions and a final review node. Keep the graph acyclic.",
                    "If targets or tool prerequisites are unavailable, explain what is missing. Return the saved draft name so I can select it in Canvas.",
                ].join("\n"),
                "new"
            );
            setNotice("Draft requested in Hermes. Select the generated workflow above when it is saved.");
        } catch (reason) {
            setError(String(reason));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="canvas-workflow-layer"
            data-canvas-overlay
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className="canvas-workflow-toggle"
                aria-expanded={open}
                aria-controls={`canvas-workflow-${tabId}`}
                onClick={() => {
                    setOpen(!open);
                    setConnectionSource(undefined);
                }}
            >
                <GitBranch size={16} aria-hidden="true" /> Workflows <span>{draft.graph.nodes.length}</span>
            </button>
            {open && (
                <>
                    <div
                        className="canvas-workflow-world"
                        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
                    >
                        <svg className="canvas-workflow-wires" aria-label="Workflow connections">
                            {draft.graph.edges.map((edge) => {
                                const from = draft.graph.nodes.find((node) => node.id === edge.source);
                                const to = draft.graph.nodes.find((node) => node.id === edge.target);
                                if (!from || !to) return null;
                                return (
                                    <path
                                        key={edge.id}
                                        strokeDasharray={edge.sourcePort ? "6 4" : undefined}
                                        d={canvasWorkflowEdgePath(
                                            canvasWorkflowNodeRect(from, rects),
                                            canvasWorkflowNodeRect(to, rects)
                                        )}
                                    />
                                );
                            })}
                        </svg>
                        {draft.graph.nodes.map((node) => {
                            const rect = canvasWorkflowNodeRect(node, rects);
                            const step = run?.steps.find((value) => value.id === node.id);
                            return (
                                <div
                                    key={node.id}
                                    className={`canvas-workflow-node ${node.id === selected ? "is-selected" : ""} ${node.blockId ? "is-widget" : ""}`}
                                    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                                >
                                    {!node.blockId && (
                                        <button
                                            type="button"
                                            className="canvas-workflow-node-card"
                                            onClick={() => setSelected(node.id)}
                                            onPointerDown={(event) => {
                                                setSelected(node.id);
                                                drag.current = {
                                                    id: node.id,
                                                    x: event.clientX,
                                                    y: event.clientY,
                                                    original: draft,
                                                };
                                                event.currentTarget.setPointerCapture(event.pointerId);
                                            }}
                                            onPointerMove={(event) => {
                                                if (
                                                    !event.currentTarget.hasPointerCapture(event.pointerId) ||
                                                    drag.current?.id !== node.id
                                                )
                                                    return;
                                                const initial = drag.current.original.graph.nodes.find(
                                                    (value) => value.id === node.id
                                                ).position ?? { x: rect.x, y: rect.y };
                                                change(
                                                    {
                                                        ...draft,
                                                        graph: {
                                                            ...draft.graph,
                                                            nodes: draft.graph.nodes.map((value) =>
                                                                value.id === node.id
                                                                    ? {
                                                                          ...value,
                                                                          position: {
                                                                              x:
                                                                                  initial.x +
                                                                                  (event.clientX - drag.current.x) /
                                                                                      camera.zoom,
                                                                              y:
                                                                                  initial.y +
                                                                                  (event.clientY - drag.current.y) /
                                                                                      camera.zoom,
                                                                          },
                                                                      }
                                                                    : value
                                                            ),
                                                        },
                                                    },
                                                    false
                                                );
                                            }}
                                            onPointerUp={(event) => {
                                                if (!drag.current) return;
                                                setHistory((values) => [...values.slice(-49), drag.current.original]);
                                                setFuture([]);
                                                drag.current = undefined;
                                                event.currentTarget.releasePointerCapture(event.pointerId);
                                            }}
                                        >
                                            <span>
                                                {node.kind} · {step?.status ?? "draft"}
                                            </span>
                                            <strong>{node.title}</strong>
                                            <small>{node.instruction || "Add instructions in the inspector"}</small>
                                        </button>
                                    )}
                                    {node.blockId && (
                                        <button
                                            type="button"
                                            className="canvas-workflow-widget-label"
                                            onClick={() => {
                                                setSelected(node.id);
                                                onFocusBlock(node.blockId);
                                            }}
                                        >
                                            {node.title} · {step?.status ?? "draft"}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="canvas-workflow-port is-input"
                                        aria-label={`Connect input of ${node.title}`}
                                        title={`Connect input of ${node.title}`}
                                        onClick={() => (connectionSource ? connect(node.id) : setSelected(node.id))}
                                    />
                                    <button
                                        type="button"
                                        className={`canvas-workflow-port is-output ${connectionSource === node.id ? "is-active" : ""}`}
                                        aria-label={`Connect output of ${node.title}`}
                                        title={`Connect output of ${node.title}`}
                                        onClick={() => {
                                            setSelected(node.id);
                                            setConnectionSource(node.id);
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <aside
                        id={`canvas-workflow-${tabId}`}
                        className="canvas-workflow-inspector"
                        data-live-block-occluder=""
                        aria-label="Workflow inspector"
                    >
                        <header>
                            <strong>Workflow</strong>
                            <button type="button" aria-label="Close workflow inspector" onClick={() => setOpen(false)}>
                                <X size={16} />
                            </button>
                        </header>
                        <label>
                            Name
                            <input
                                value={draft.title}
                                maxLength={160}
                                onChange={(event) => change({ ...draft, title: event.target.value })}
                            />
                        </label>
                        <label>
                            Saved workflows
                            <select
                                value={savedDraft?.id ?? ""}
                                disabled={busy}
                                onChange={(event) => {
                                    const saved = snapshot.workflows.find((value) => value.id === event.target.value);
                                    if (saved) loadSavedWorkflow(saved);
                                }}
                            >
                                <option value="" disabled>
                                    Current draft
                                </option>
                                {snapshot.workflows
                                    .filter((value) => value.graph && value.target.tabId === tabId)
                                    .map((value) => (
                                        <option key={value.id} value={value.id}>
                                            {value.title}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <div className="canvas-workflow-actions">
                            <button
                                type="button"
                                disabled={!selectedBlockId}
                                onClick={() => addNode("widget", selectedBlockId)}
                            >
                                <Plus size={14} /> Selected widget
                            </button>
                            <button type="button" onClick={() => addNode("agent")}>
                                Agent task
                            </button>
                            <button type="button" onClick={() => addNode("review")}>
                                Review
                            </button>
                            <button type="button" onClick={() => addNode("computer")}>
                                Computer task
                            </button>
                            <button type="button" onClick={() => addNode("launch")}>
                                Launch widget
                            </button>
                            <button
                                type="button"
                                disabled={!history.length}
                                onClick={() => {
                                    const previous = history[history.length - 1];
                                    setHistory(history.slice(0, -1));
                                    setFuture([...future, draft]);
                                    change(previous, false);
                                }}
                            >
                                Undo
                            </button>
                            <button
                                type="button"
                                disabled={!future.length}
                                onClick={() => {
                                    const next = future[future.length - 1];
                                    setFuture(future.slice(0, -1));
                                    setHistory([...history, draft]);
                                    change(next, false);
                                }}
                            >
                                Redo
                            </button>
                        </div>
                        <details>
                            <summary>Generate a workflow</summary>
                            <label>
                                Task
                                <textarea
                                    rows={3}
                                    value={workflowIntent}
                                    maxLength={12000}
                                    placeholder="Describe the steps and the result you want"
                                    onChange={(event) => setWorkflowIntent(event.target.value)}
                                />
                            </label>
                            <button
                                type="button"
                                disabled={busy || !workflowIntent.trim()}
                                onClick={() => void generateDraft()}
                            >
                                Draft with Kronos
                            </button>
                            <p className="canvas-workflow-hint">
                                Creates a saved draft for review. Running and scheduling remain separate actions.
                            </p>
                        </details>
                        <details>
                            <summary>Open project environment</summary>
                            <ProjectEnvironmentLauncher
                                connections={Object.keys(config?.connections ?? {}).filter(
                                    (name) => name !== "local" && !name.startsWith("wsl://")
                                )}
                                adapter={{
                                    create: async (blockDef) =>
                                        WOS.splitORef(
                                            await RpcApi.CreateBlockCommand(TabRpcClient, {
                                                tabid: tabId,
                                                blockdef: blockDef,
                                                focused: false,
                                            })
                                        )[1],
                                    remove: (blockId) => RpcApi.DeleteBlockCommand(TabRpcClient, { blockid: blockId }),
                                    ensureConnection: (connection) =>
                                        RpcApi.ConnEnsureCommand(TabRpcClient, { connname: connection }),
                                    findExisting: (key, role) =>
                                        tabData.blockids?.find((id) => {
                                            const block = globalStore.get(
                                                WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", id))
                                            );
                                            return (
                                                block?.meta?.["environment:key"] === key &&
                                                block?.meta?.["environment:role"] === role
                                            );
                                        }),
                                }}
                            />
                        </details>
                        <p className="canvas-workflow-hint">
                            {connectionSource
                                ? "Choose another node’s input to connect. "
                                : "Connect an output to an input to set execution order. "}
                            {connectionSource && (
                                <button type="button" onClick={() => setConnectionSource(undefined)}>
                                    Cancel connection
                                </button>
                            )}
                        </p>
                        <label>
                            New connection
                            <select
                                value={transferOutput ? "data" : "order"}
                                onChange={(event) => setTransferOutput(event.target.value === "data")}
                            >
                                <option value="order">Execution order</option>
                                <option value="data">Transfer text result</option>
                            </select>
                        </label>
                        <details>
                            <summary>Execution targets</summary>
                            <label>
                                Environment
                                <select
                                    value={target.environment}
                                    onChange={(event) =>
                                        change({
                                            ...draft,
                                            target: {
                                                ...draft.target,
                                                environment: event.target.value as WorkflowTarget["environment"],
                                            },
                                        })
                                    }
                                >
                                    <option value="workspace">Workspace widgets</option>
                                    <option value="native">Native computer</option>
                                    <option value="vm">Managed Linux computer</option>
                                </select>
                            </label>
                            {target.environment !== "workspace" && (
                                <label>
                                    Computer target ID
                                    <input
                                        value={target.computerId ?? ""}
                                        onChange={(event) =>
                                            change({
                                                ...draft,
                                                target: { ...draft.target, computerId: event.target.value },
                                            })
                                        }
                                        placeholder={target.environment === "native" ? "Native app name or bundle ID" : "Exact managed machine ID"}
                                    />
                                </label>
                            )}
                            <label>
                                Repository (optional)
                                <input
                                    value={target.repository ?? ""}
                                    onChange={(event) =>
                                        change({
                                            ...draft,
                                            target: { ...draft.target, repository: event.target.value },
                                        })
                                    }
                                    placeholder="/absolute/path/to/repository"
                                />
                            </label>
                            <p className="canvas-workflow-hint">
                                Code changes use an isolated worktree when a repository is assigned. Computer tasks
                                require an exact target.
                            </p>
                        </details>
                        <label>
                            Inspect node
                            <select value={selected ?? ""} onChange={(event) => setSelected(event.target.value)}>
                                <option value="">Choose a node</option>
                                {draft.graph.nodes.map((node) => (
                                    <option key={node.id} value={node.id}>
                                        {node.title}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {activeNode && (
                            <fieldset>
                                <legend>{activeNode.blockId ? "Live widget node" : "Task node"}</legend>
                                <label>
                                    Title
                                    <input
                                        value={activeNode.title}
                                        maxLength={160}
                                        onChange={(event) => patchNode({ title: event.target.value })}
                                    />
                                </label>
                                <label>
                                    Instructions
                                    <textarea
                                        value={activeNode.instruction}
                                        rows={4}
                                        maxLength={20000}
                                        onChange={(event) => patchNode({ instruction: event.target.value })}
                                    />
                                </label>
                                {activeNode.kind === "launch" && (
                                    <>
                                        <label>
                                            Widget type
                                            <select
                                                value={activeNode.launch?.view ?? "term"}
                                                onChange={(event) =>
                                                    patchNode({
                                                        launch: {
                                                            view: event.target.value as "term" | "web" | "preview",
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="term">Terminal</option>
                                                <option value="web">Browser</option>
                                                <option value="preview">Files</option>
                                            </select>
                                        </label>
                                        {activeNode.launch?.view === "web" ? (
                                            <label>
                                                URL
                                                <input
                                                    value={activeNode.launch.url ?? ""}
                                                    placeholder="http://localhost:3000"
                                                    onChange={(event) =>
                                                        patchNode({
                                                            launch: { ...activeNode.launch, url: event.target.value },
                                                        })
                                                    }
                                                />
                                            </label>
                                        ) : (
                                            <>
                                                <label>
                                                    Folder
                                                    <input
                                                        value={activeNode.launch?.root ?? ""}
                                                        placeholder="/absolute/project/folder"
                                                        onChange={(event) =>
                                                            patchNode({
                                                                launch: {
                                                                    ...activeNode.launch,
                                                                    root: event.target.value || undefined,
                                                                },
                                                            })
                                                        }
                                                    />
                                                </label>
                                                <label>
                                                    Connection (optional)
                                                    <input
                                                        value={activeNode.launch?.connection ?? ""}
                                                        onChange={(event) =>
                                                            patchNode({
                                                                launch: {
                                                                    ...activeNode.launch,
                                                                    connection: event.target.value || undefined,
                                                                },
                                                            })
                                                        }
                                                    />
                                                </label>
                                            </>
                                        )}
                                    </>
                                )}
                                <label>
                                    Execution engine
                                    <select
                                        value={activeNode.engine ?? (activeNode.kind === "computer" ? "computer" : "kronoscode")}
                                        onChange={(event) =>
                                            patchNode({ engine: event.target.value as WorkflowNode["engine"] })
                                        }
                                    >
                                        <option value="kronoscode">KronosCode</option>
                                        <option value="computer">Computer · accessibility</option>
                                    </select>
                                </label>
                                <p className="canvas-workflow-hint">
                                    {(activeNode.engine ?? (activeNode.kind === "computer" ? "computer" : "kronoscode")) === "computer"
                                        ? "Native macOS apps only. Requires a direct OpenAI or Anthropic AI preset. Uses accessibility text rather than screenshots."
                                        : "Uses your managed KronosCode agent and its model configuration."}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        change({
                                            ...draft,
                                            graph: removeCanvasWorkflowNode(draft.graph, activeNode.id),
                                        });
                                        setSelected(undefined);
                                    }}
                                >
                                    Remove node
                                </button>
                            </fieldset>
                        )}
                        {!!draft.graph.edges.length && (
                            <fieldset>
                                <legend>Connections</legend>
                                {draft.graph.edges.map((edge) => (
                                    <div className="canvas-workflow-connection" key={edge.id}>
                                        <span>
                                            {draft.graph.nodes.find((node) => node.id === edge.source)?.title} →{" "}
                                            {draft.graph.nodes.find((node) => node.id === edge.target)?.title}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="Remove connection"
                                            onClick={() =>
                                                change({
                                                    ...draft,
                                                    graph: {
                                                        ...draft.graph,
                                                        edges: draft.graph.edges.filter(
                                                            (value) => value.id !== edge.id
                                                        ),
                                                    },
                                                })
                                            }
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </fieldset>
                        )}
                        {error && (
                            <p role="alert" className="canvas-workflow-error">
                                {error}
                            </p>
                        )}
                        {notice && <p role="status">{notice}</p>}
                        <div className="canvas-workflow-actions">
                            <button
                                type="button"
                                disabled={busy || !draft.graph.nodes.length}
                                onClick={() => void save()}
                            >
                                Save workflow
                            </button>
                            {savedDraft && (
                                <button
                                    type="button"
                                    disabled={busy || !draft.graph.nodes.length}
                                    onClick={() => void save(true)}
                                >
                                    Save as new workflow
                                </button>
                            )}
                            <button
                                type="button"
                                className="is-primary"
                                disabled={busy || !draft.graph.nodes.length}
                                onClick={() => void start()}
                            >
                                Run workflow
                            </button>
                        </div>
                        {savedVersionChanged && (
                            <p role="status" className="canvas-workflow-hint">
                                This workflow has changed since you opened it.{" "}
                                <button type="button" disabled={busy} onClick={() => loadSavedWorkflow(savedWorkflow)}>
                                    Reload saved workflow
                                </button>
                            </p>
                        )}
                        {savedDraft?.dirty && (
                            <p className="canvas-workflow-hint">
                                Save your edits to update the workflow used by its schedules.
                            </p>
                        )}
                        {(canSchedule || schedules.length > 0) && (
                            <fieldset>
                                <legend>Schedule</legend>
                                <label>
                                    Repeat every (minutes)
                                    <input
                                        type="number"
                                        min={1}
                                        max={525600}
                                        value={intervalMinutes}
                                        onChange={(event) => setIntervalMinutes(Number(event.target.value))}
                                    />
                                </label>
                                <label>
                                    Display timezone
                                    <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
                                </label>
                                <label>
                                    When the host was unavailable
                                    <select
                                        value={missedRunPolicy}
                                        onChange={(event) =>
                                            setMissedRunPolicy(event.target.value as "skip" | "run-once")
                                        }
                                    >
                                        <option value="skip">Skip missed runs</option>
                                        <option value="run-once">Run once after returning</option>
                                    </select>
                                </label>
                                <p className="canvas-workflow-hint">
                                    Repeats use elapsed time. KronOS must be running. Concurrent runs of this workflow
                                    are skipped.
                                </p>
                                {canSchedule && (
                                    <button
                                        type="button"
                                        disabled={
                                            busy ||
                                            !Number.isInteger(intervalMinutes) ||
                                            intervalMinutes < 1 ||
                                            intervalMinutes > 525600
                                        }
                                        onClick={() => void schedule()}
                                    >
                                        Add schedule
                                    </button>
                                )}
                                {schedules.map((value) => (
                                    <div key={value.id} className="canvas-workflow-schedule">
                                        <span>
                                            Every {value.intervalMinutes} min · {value.enabled ? "Active" : "Paused"}
                                        </span>
                                        <small>
                                            Next:{" "}
                                            {new Date(value.nextRunAt).toLocaleString(undefined, {
                                                timeZone: value.timezone,
                                            })}{" "}
                                            ({value.timezone})
                                        </small>
                                        <div className="canvas-workflow-actions">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void perform({
                                                        action: "upsert-schedule",
                                                        schedule: { ...value, enabled: !value.enabled },
                                                    })
                                                }
                                            >
                                                {value.enabled ? "Pause schedule" : "Resume schedule"}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void perform({
                                                        action: "delete-schedule",
                                                        scheduleId: value.id,
                                                    })
                                                }
                                            >
                                                Delete schedule
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </fieldset>
                        )}
                        {run && (
                            <section aria-label="Workflow progress">
                                <strong>
                                    {run.title} · {run.status}
                                </strong>
                                {run.steps.map((step) => (
                                    <details key={step.id}>
                                        <summary>
                                            {step.title} · {step.status}
                                        </summary>
                                        <p>{step.result ?? "No output yet."}</p>
                                    </details>
                                ))}
                                {run.error && <p role="alert">{run.error}</p>}
                                {run.question && (
                                    <fieldset>
                                        <legend>Attention required</legend>
                                        <p>{run.question.text}</p>
                                        {run.question.kind === "permission" ? (
                                            run.question.options?.map((option) => (
                                                <button
                                                    type="button"
                                                    key={option.id}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void perform({
                                                            action: "permission",
                                                            runId: run.id,
                                                            questionId: run.question.id,
                                                            optionId: option.id,
                                                        })
                                                    }
                                                >
                                                    {option.label}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="canvas-workflow-actions">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void perform({
                                                            action: "reconcile",
                                                            runId: run.id,
                                                            questionId: run.question.id,
                                                            resolution: "completed",
                                                        })
                                                    }
                                                >
                                                    Mark reviewed and completed
                                                </button>
                                                {run.steps.find((step) => step.id === run.question.stepId)?.nodeKind !==
                                                    "launch" && (
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void perform({
                                                                action: "reconcile",
                                                                runId: run.id,
                                                                questionId: run.question.id,
                                                                resolution: "retry",
                                                            })
                                                        }
                                                    >
                                                        Retry after inspection
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </fieldset>
                                )}
                                <div className="canvas-workflow-actions">
                                    {run.status === "running" && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void perform({ action: "pause", runId: run.id })}
                                        >
                                            Pause
                                        </button>
                                    )}
                                    {run.status === "paused" && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void perform({ action: "resume", runId: run.id })}
                                        >
                                            Resume
                                        </button>
                                    )}
                                    {!["cancelled", "succeeded"].includes(run.status) && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void perform({ action: "cancel", runId: run.id })}
                                        >
                                            Cancel run
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void api.workflowOpen?.(run.id).catch((reason) => setError(String(reason)))
                                        }
                                    >
                                        Open run in Hermes
                                    </button>
                                </div>
                            </section>
                        )}
                        {!draft.graph.nodes.length && (
                            <p className="canvas-workflow-hint">
                                Select a widget on the canvas, then add it here. Its live session stays in place.
                            </p>
                        )}
                    </aside>
                </>
            )}
        </div>
    );
}
