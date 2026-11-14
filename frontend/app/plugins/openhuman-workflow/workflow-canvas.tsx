// SPDX-License-Identifier: GPL-3.0-only
import type { WorkflowRun } from "@/types/workflow";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeKind } from "@/types/workflow-graph";
import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    Background,
    BackgroundVariant,
    MiniMap,
    ReactFlow,
    type ReactFlowInstance,
    type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
    Bot,
    Check,
    ChevronRight,
    Circle,
    Clock3,
    GitBranch,
    LayoutGrid,
    List,
    PanelLeftClose,
    PanelLeftOpen,
    Play,
    Save,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fromCanvas, toCanvas } from "./graph";
import { NodeEntries, NodeLibrary, PaletteMime } from "./node-library";
import { Button } from "./ui";
import { CanvasActionsContext } from "./upstream/canvas-actions";
import { CanvasToolbarView } from "./upstream/canvas-toolbar";
import { FlowNodeCard } from "./upstream/flow-node";
import {
    autoLayout,
    isValidFlowConnection,
    stepNumbersForFlow,
    type FlowEdge,
    type FlowNode,
} from "./upstream/graph-adapter";
import { NodeKindTile } from "./upstream/node-kind-icons";
import { StepNumberContext } from "./upstream/step-numbers";
import "./workflow-canvas.css";

const NodeTypes = { flowNode: FlowNodeCard };
type Snapshot = { nodes: FlowNode[]; edges: FlowEdge[]; title: string };
export function WorkflowCanvas({
    initialGraph,
    initialTitle = "Untitled workflow",
    targets = [],
    onSave,
    onRun,
    onChat,
    onValidate,
    onDirtyChange,
    runs = [],
    onRunAction,
    actions,
}: {
    initialGraph: WorkflowGraph;
    initialTitle?: string;
    targets?: { id: string; title: string; view: string }[];
    onSave: (graph: WorkflowGraph, title: string) => Promise<void>;
    onRun?: (graph: WorkflowGraph, title: string) => Promise<void>;
    onChat?: (graph: WorkflowGraph, title: string) => void;
    onValidate?: (graph: WorkflowGraph) => Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    runs?: WorkflowRun[];
    onRunAction?: (run: WorkflowRun, action: "open" | "pause" | "cancel" | "resume") => Promise<void>;
    actions?: ReactNode;
}) {
    const initial = useMemo(() => toCanvas(initialGraph), []);
    const [nodes, setNodes] = useState<FlowNode[]>(initial.nodes);
    const [edges, setEdges] = useState<FlowEdge[]>(initial.edges);
    const [title, setTitle] = useState(initialTitle);
    const [selectedId, setSelectedId] = useState<string>();
    const [libraryOpen, setLibraryOpen] = useState(true);
    const [tab, setTab] = useState<"editor" | "runs">("editor");
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState(false);
    const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
    const [revision, setRevision] = useState(0);
    const instance = useRef<ReactFlowInstance<FlowNode, FlowEdge>>(null);
    const [baseline, setBaseline] = useState(() =>
        JSON.stringify({ graph: fromCanvas(initial.nodes, initial.edges), title: initialTitle })
    );
    const graph = useMemo(() => fromCanvas(nodes, edges), [nodes, edges]);
    const dirty = JSON.stringify({ graph, title }) !== baseline;
    const selected = nodes.find((node) => node.id === selectedId);
    const config = selected?.data.config as WorkflowNode;
    const stepNumbers = useMemo(() => stepNumbersForFlow(nodes, edges), [nodes, edges]);
    const checkpoint = useCallback(() => {
        history.current.past.push(structuredClone({ nodes, edges, title }));
        if (history.current.past.length > 60) history.current.past.shift();
        history.current.future = [];
        setRevision((value) => value + 1);
    }, [nodes, edges, title]);
    const restore = (direction: "past" | "future") => {
        const snapshot = history.current[direction].pop();
        if (!snapshot) return;
        history.current[direction === "past" ? "future" : "past"].push(structuredClone({ nodes, edges, title }));
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setTitle(snapshot.title);
        setSelectedId(null);
        setRevision((value) => value + 1);
    };
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    const patch = (changes: Partial<WorkflowNode>) =>
        setNodes((items) =>
            items.map((node) =>
                node.id !== selectedId
                    ? node
                    : {
                          ...node,
                          data: {
                              ...node.data,
                              name: changes.title ?? node.data.name,
                              config: { ...node.data.config, ...changes },
                          },
                      }
            )
        );
    const remove = (id: string) => {
        checkpoint();
        setNodes((items) => items.filter((node) => node.id !== id));
        setEdges((items) => items.filter((edge) => edge.source !== id && edge.target !== id));
        setSelectedId(null);
    };
    const add = (kind: WorkflowNodeKind, position?: XYPosition) => {
        if (busy || nodes.length >= 100) return;
        checkpoint();
        const entry = NodeEntries.find((item) => item.kind === kind);
        if (!entry) return;
        const id = crypto.randomUUID();
        const point = position ??
            instance.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? {
                x: 120,
                y: 80,
            };
        const next = toCanvas({
            version: 1,
            nodes: [{ id, kind, title: `${entry.title} step`, instruction: "", position: point }],
            edges: [],
        });
        setNodes((items) => [
            ...items.map((node) => ({ ...node, selected: false })),
            { ...next.nodes[0], selected: true },
        ]);
        setSelectedId(id);
        setTab("editor");
    };
    const validate = async () => {
        try {
            await onValidate?.(graph);
            if (!graph.nodes.length) throw new Error("Add a step to this workflow.");
            setMessage("Workflow is valid.");
            setError(false);
        } catch (reason) {
            setMessage(reason instanceof Error ? reason.message : String(reason));
            setError(true);
        }
    };
    const perform = async (run: boolean) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setMessage("");
        setError(false);
        try {
            if (!title.trim()) throw new Error("Give this workflow a title.");
            await (run ? onRun(graph, title.trim()) : onSave(graph, title.trim()));
            setBaseline(JSON.stringify({ graph, title }));
            setMessage(run ? "Workflow started. Follow its progress in Runs." : "All changes saved.");
            if (run) setTab("runs");
        } catch (reason) {
            setMessage(reason instanceof Error ? reason.message : String(reason));
            setError(true);
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };
    const arrange = () => {
        checkpoint();
        const wire = nodes.map((node) => ({
            id: node.id,
            kind: node.data.kind,
            name: node.data.name,
            config: node.data.config,
            ports: node.data.ports,
        }));
        const positions = autoLayout(
            wire,
            edges.map((edge) => ({ from_node: edge.source, to_node: edge.target, from_port: "main", to_port: "main" }))
        );
        setNodes((items) =>
            items.map((node) => {
                const point = positions.get(node.id);
                return { ...node, position: { x: point.x * 1.4, y: point.y * 1.65 } };
            })
        );
        requestAnimationFrame(() => void instance.current?.fitView({ padding: 0.25, maxZoom: 1 }));
    };
    return (
        <section
            className="workflow-plugin"
            aria-label="Workflow Canvas"
            data-history-revision={revision}
            onKeyDown={(event) => {
                if ((event.target as HTMLElement).matches("input,textarea,select,[contenteditable=true]")) return;
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                    event.preventDefault();
                    restore(event.shiftKey ? "future" : "past");
                }
            }}
        >
            <header className="wf-header">
                <div className="wf-app-mark">
                    <GitBranch size={19} />
                </div>
                <div className="wf-document">
                    <div className="wf-breadcrumb">
                        Workflows <ChevronRight size={11} />
                        <span>Canvas</span>
                    </div>
                    <input
                        aria-label="Workflow title"
                        value={title}
                        maxLength={160}
                        onFocus={checkpoint}
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </div>
                <span className={`wf-save-state ${dirty ? "is-dirty" : ""}`}>
                    {dirty ? <Circle size={7} fill="currentColor" /> : <Check size={12} />}
                    {dirty ? "Unsaved changes" : "Saved"}
                </span>
                <div className="wf-header-actions">
                    <Button disabled={busy} onClick={() => void perform(false)}>
                        <Save size={14} />
                        Save
                    </Button>
                    {onRun && (
                        <Button variant="primary" disabled={busy} onClick={() => void perform(true)}>
                            <Play size={13} fill="currentColor" />
                            {busy ? "Starting…" : "Run workflow"}
                        </Button>
                    )}
                </div>
            </header>
            <nav className="wf-subbar" aria-label="Workflow views">
                <div className="wf-view-tabs">
                    <button className={tab === "editor" ? "is-active" : ""} onClick={() => setTab("editor")}>
                        <GitBranch size={14} />
                        Editor
                    </button>
                    <button className={tab === "runs" ? "is-active" : ""} onClick={() => setTab("runs")}>
                        <Clock3 size={14} />
                        Runs{runs.length > 0 && <span>{runs.length}</span>}
                    </button>
                </div>
                <div className="wf-surface-actions">{actions}</div>
            </nav>
            <div className="workflow-body">
                {tab === "editor" && (
                    <>
                        {libraryOpen && <NodeLibrary onAdd={add} disabled={busy || nodes.length >= 100} />}
                        <div
                            className="workflow-graph"
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                const kind = event.dataTransfer.getData(PaletteMime) as WorkflowNodeKind;
                                if (NodeEntries.some((entry) => entry.kind === kind))
                                    add(
                                        kind,
                                        instance.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY })
                                    );
                            }}
                        >
                            <CanvasActionsContext.Provider
                                value={{ deleteNode: remove, validate: () => void validate(), validating: busy }}
                            >
                                <StepNumberContext.Provider value={stepNumbers}>
                                    <ReactFlow
                                        nodes={nodes}
                                        edges={edges}
                                        nodeTypes={NodeTypes}
                                        onInit={(value) => {
                                            instance.current = value;
                                        }}
                                        onNodesChange={(changes) => {
                                            if (changes.some((change) => change.type === "remove")) checkpoint();
                                            setNodes((items) => applyNodeChanges(changes, items));
                                        }}
                                        onEdgesChange={(changes) => {
                                            if (changes.some((change) => change.type === "remove")) checkpoint();
                                            setEdges((items) => applyEdgeChanges(changes, items));
                                        }}
                                        onNodeDragStart={checkpoint}
                                        onNodeClick={(_, node) => setSelectedId(node.id)}
                                        onPaneClick={() => setSelectedId(null)}
                                        onConnect={(connection) => {
                                            if (!isValidFlowConnection(connection, nodes, edges)) return;
                                            checkpoint();
                                            setEdges((items) =>
                                                addEdge({ ...connection, id: crypto.randomUUID() }, items)
                                            );
                                        }}
                                        isValidConnection={(connection) =>
                                            isValidFlowConnection(connection, nodes, edges)
                                        }
                                        fitView
                                        fitViewOptions={{ padding: 0.3, maxZoom: 0.95 }}
                                        minZoom={0.2}
                                        maxZoom={2}
                                        deleteKeyCode={["Backspace", "Delete"]}
                                        defaultEdgeOptions={{ type: "smoothstep" }}
                                    >
                                        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
                                        <CanvasToolbarView
                                            history={{
                                                canUndo: !!history.current.past.length,
                                                canRedo: !!history.current.future.length,
                                                onUndo: () => restore("past"),
                                                onRedo: () => restore("future"),
                                            }}
                                        />
                                        <MiniMap pannable zoomable position="bottom-right" />
                                    </ReactFlow>
                                </StepNumberContext.Provider>
                            </CanvasActionsContext.Provider>
                            <div className="wf-canvas-extras">
                                <Button
                                    iconOnly
                                    variant="tertiary"
                                    aria-label={libraryOpen ? "Hide step library" : "Show step library"}
                                    onClick={() => setLibraryOpen((value) => !value)}
                                >
                                    {libraryOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
                                </Button>
                                <Button variant="tertiary" onClick={arrange}>
                                    <LayoutGrid size={14} />
                                    Auto arrange
                                </Button>
                            </div>
                            {!nodes.length && (
                                <div className="wf-empty-canvas">
                                    <GitBranch size={32} />
                                    <h2>Start with a step</h2>
                                    <p>Build a workflow from the tools in your workspace.</p>
                                    <Button onClick={() => add("agent")}>Add an agent step</Button>
                                </div>
                            )}
                        </div>
                        <aside
                            className="workflow-inspector"
                            aria-label={selected ? "Step settings" : "Workflow overview"}
                        >
                            {selected ? (
                                <>
                                    <div className="wf-sidebar-heading">
                                        <span>Step settings</span>
                                        <Button
                                            iconOnly
                                            variant="tertiary"
                                            aria-label="Close step settings"
                                            onClick={() => setSelectedId(null)}
                                        >
                                            <X size={14} />
                                        </Button>
                                    </div>
                                    <div className="wf-selected-kind">
                                        <NodeKindTile kind={selected.data.kind} />
                                        <div>
                                            <strong>
                                                {NodeEntries.find((entry) => entry.kind === config.kind)?.title ??
                                                    config.kind}
                                            </strong>
                                            <small>Step {stepNumbers.get(selected.id) ?? "—"}</small>
                                        </div>
                                    </div>
                                    <label>
                                        Step name
                                        <input
                                            value={selected.data.name}
                                            maxLength={160}
                                            onFocus={checkpoint}
                                            onChange={(event) => patch({ title: event.target.value })}
                                        />
                                    </label>
                                    <label>
                                        Instruction
                                        <textarea
                                            placeholder="What should this step accomplish?"
                                            value={config.instruction}
                                            maxLength={20000}
                                            onFocus={checkpoint}
                                            onChange={(event) => patch({ instruction: event.target.value })}
                                        />
                                    </label>
                                    {["terminal", "browser", "widget"].includes(config.kind) && (
                                        <label>
                                            Target widget
                                            <select
                                                value={config.blockId ?? ""}
                                                onFocus={checkpoint}
                                                onChange={(event) =>
                                                    patch({ blockId: event.target.value || undefined })
                                                }
                                            >
                                                <option value="">Choose a widget</option>
                                                {targets
                                                    .filter(
                                                        (target) =>
                                                            config.kind === "widget" ||
                                                            target.view ===
                                                                (config.kind === "terminal" ? "term" : "web")
                                                    )
                                                    .map((target) => (
                                                        <option key={target.id} value={target.id}>
                                                            {target.title}
                                                        </option>
                                                    ))}
                                            </select>
                                        </label>
                                    )}
                                    {config.kind === "review" && (
                                        <p className="wf-info">
                                            This step pauses execution until you review the evidence and continue.
                                        </p>
                                    )}
                                    <Button variant="tertiary" tone="danger" onClick={() => remove(selectedId)}>
                                        <Trash2 size={13} />
                                        Delete step
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <div className="wf-sidebar-heading">
                                        <span>Workflow outline</span>
                                        <List size={14} />
                                    </div>
                                    <p className="wf-sidebar-hint">Each connection defines what runs next.</p>
                                    <ol className="wf-outline">
                                        {[...nodes]
                                            .sort((a, b) => (stepNumbers.get(a.id) ?? 0) - (stepNumbers.get(b.id) ?? 0))
                                            .map((node) => (
                                                <li key={node.id}>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedId(node.id);
                                                            setNodes((items) =>
                                                                items.map((item) => ({
                                                                    ...item,
                                                                    selected: item.id === node.id,
                                                                }))
                                                            );
                                                        }}
                                                    >
                                                        <NodeKindTile kind={node.data.kind} size="sm" />
                                                        <span>{node.data.name}</span>
                                                        <ChevronRight size={12} />
                                                    </button>
                                                </li>
                                            ))}
                                    </ol>
                                    <div className="wf-info">
                                        <strong>Connected to your workspace</strong>
                                        <p>
                                            Steps use existing tools and widgets. Credentials and approvals stay with
                                            KronOS.
                                        </p>
                                    </div>
                                </>
                            )}
                            {onChat && (
                                <div className="wf-copilot-card">
                                    <Sparkles size={18} />
                                    <strong>Build with Kronos</strong>
                                    <p>Share this workflow with your current conversation to plan the next step.</p>
                                    <Button onClick={() => onChat(graph, title)}>
                                        <Bot size={14} />
                                        Ask Kronos
                                        <ChevronRight size={12} />
                                    </Button>
                                </div>
                            )}
                        </aside>
                    </>
                )}
                {tab === "runs" && (
                    <div className="wf-runs">
                        <div className="wf-runs-heading">
                            <Clock3 size={20} />
                            <div>
                                <h2>Workflow runs</h2>
                                <p>Execution, evidence, and review stay in this workspace.</p>
                            </div>
                        </div>
                        {!runs.length ? (
                            <div className="wf-empty-runs">
                                <Play size={28} />
                                <h3>No runs yet</h3>
                                <p>Run this workflow to see its progress here.</p>
                                <Button onClick={() => setTab("editor")}>Back to editor</Button>
                            </div>
                        ) : (
                            runs.map((run) => (
                                <article className="wf-run-card" key={run.id}>
                                    <div>
                                        <strong>{run.title}</strong>
                                        <span className={`wf-run-state is-${run.status}`}>{run.status}</span>
                                    </div>
                                    <p>
                                        {run.steps.filter((step) => step.status === "succeeded").length} of{" "}
                                        {run.steps.length} steps complete
                                    </p>
                                    <progress
                                        value={run.steps.filter((step) => step.status === "succeeded").length}
                                        max={Math.max(1, run.steps.length)}
                                    />
                                    <ol>
                                        {run.steps.map((step) => (
                                            <li key={step.id}>
                                                <span className={`wf-step-state is-${step.status}`} />
                                                {step.title}
                                                <small>{step.status}</small>
                                            </li>
                                        ))}
                                    </ol>
                                    {run.error && <p role="alert">{run.error}</p>}
                                    {onRunAction && (
                                        <div className="wf-run-actions">
                                            {(
                                                [
                                                    "open",
                                                    ...(["running", "queued"].includes(run.status)
                                                        ? ["pause", "cancel"]
                                                        : run.status === "paused"
                                                          ? ["resume", "cancel"]
                                                          : []),
                                                ] as ("open" | "pause" | "resume" | "cancel")[]
                                            ).map((action) => (
                                                <Button
                                                    key={action}
                                                    onClick={() =>
                                                        void onRunAction(run, action).catch((reason) => {
                                                            setMessage(String(reason));
                                                            setError(true);
                                                        })
                                                    }
                                                >
                                                    {action === "open" ? "Open workspace" : action}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            ))
                        )}
                    </div>
                )}
            </div>
            <footer className={`wf-statusbar ${error ? "is-error" : ""}`} role="status">
                <span>
                    {error ? <Circle size={8} fill="currentColor" /> : <span className="wf-status-dot" />}
                    {message || `${nodes.length} steps · ${edges.length} connections`}
                </span>
                <span className="wf-status-hint">
                    {dirty ? "Save to keep your changes" : "All changes saved"}
                    <span className="wf-keycap">⌘ Z</span> Undo
                </span>
            </footer>
        </section>
    );
}
