// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: GPL-3.0-only
import { makeInitialGraph, validateCanvas } from "@/app/plugins/openhuman-workflow/graph";
import { WorkflowCanvas } from "@/app/plugins/openhuman-workflow/workflow-canvas";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { WOS, getApi } from "@/store/global";
import type { WorkflowRun, WorkflowSnapshot, WorkflowTarget } from "@/types/workflow";
import type { WorkflowGraph } from "@/types/workflow-graph";
import { mainComposerScope } from "@hermes/store/composer";
import { $selectedStoredSessionId } from "@hermes/store/session";
import { useEffect, useState } from "react";
import type { WorkflowCanvasModel } from "./workflowcanvas-model";

type CanvasDocument = { graph: WorkflowGraph; title: string };
export function WorkflowCanvasWidget({ blockId }: ViewComponentProps<WorkflowCanvasModel>) {
    const [document, setDocument] = useState<CanvasDocument>();
    const [targets, setTargets] = useState<{ id: string; title: string; view: string }[]>([]);
    const [runs, setRuns] = useState<WorkflowRun[]>([]);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        Promise.all([RpcApi.GetMetaCommand(TabRpcClient, { oref: `block:${blockId}` }), getApi().workflowContext()])
            .then(([meta, context]) => {
                if (!active) return;
                const saved = meta?.["workflow:document"] as CanvasDocument;
                if (
                    saved &&
                    (saved.graph?.version !== 1 ||
                        !Array.isArray(saved.graph.nodes) ||
                        !Array.isArray(saved.graph.edges))
                )
                    throw new Error("The saved canvas document is invalid.");
                setDocument(saved ?? { graph: makeInitialGraph(), title: "Untitled workflow" });
                setTargets(
                    context.blocks.map((block) => ({
                        id: block.blockid ?? block.blockId ?? block.id ?? block.oid,
                        title: block.title ?? block.view ?? "Widget",
                        view: block.view ?? block.meta?.view,
                    }))
                );
            })
            .catch((reason) => {
                if (active) setError(String(reason));
            });
        return () => {
            active = false;
        };
    }, [blockId, attempt]);
    useEffect(() => {
        let active = true;
        const update = (snapshot: WorkflowSnapshot) => {
            if (active) setRuns(snapshot.runs.filter((run) => run.parameters?.canvasBlockId === blockId));
        };
        const unsubscribe = getApi().onWorkflowChanged(update);
        void getApi()
            .workflowCommand({ action: "list" })
            .then((snapshot) => update(snapshot as WorkflowSnapshot))
            .catch((reason) => {
                if (active) setError(String(reason));
            });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [blockId]);
    const targetFor = async (): Promise<WorkflowTarget> => {
        const context = await getApi().workflowContext();
        return {
            workspaceId: context.workspaceId,
            tabId: context.tabId,
            blockIds: context.blocks
                .map((block) => block.blockid ?? block.blockId ?? block.id ?? block.oid)
                .filter(Boolean),
            environment: "workspace",
        };
    };
    const save = async (graph: WorkflowGraph, title: string) => {
        if (graph.nodes.length > 100 || JSON.stringify(graph).length > 1000000)
            throw new Error("This workflow exceeds the document size limit.");
        await RpcApi.SetMetaCommand(TabRpcClient, {
            oref: WOS.makeORef("block", blockId),
            meta: { "workflow:document": { graph, title } } as MetaType,
        });
    };
    const ask = (graph: WorkflowGraph, title: string) => {
        mainComposerScope.add({
            id: `workflow:${blockId}`,
            kind: "canvas",
            label: title,
            refText: JSON.stringify(graph),
            detail: "Workflow Canvas",
        });
        hermesSurfaceController.requestOpenPanel();
    };
    if (error)
        return (
            <div role="alert">
                {error}
                <button
                    className="cursor-pointer"
                    onClick={() => {
                        setError("");
                        setAttempt((value) => value + 1);
                    }}
                >
                    Retry
                </button>
            </div>
        );
    if (!document) return <div role="status">Loading workflow…</div>;
    return (
        <WorkflowCanvas
            initialGraph={document.graph}
            initialTitle={document.title}
            targets={targets}
            onSave={save}
            onValidate={async (graph) => {
                validateCanvas(graph, await targetFor());
            }}
            runs={runs}
            onRunAction={async (run, action) => {
                if (action === "open") {
                    await getApi().workflowOpen(run.id);
                    return;
                }
                await getApi().workflowCommand({ action, runId: run.id });
            }}
            onChat={ask}
            onRun={async (graph, title) => {
                const conversationId = $selectedStoredSessionId.get();
                if (!conversationId) throw new Error("Open a Kronos conversation before running a workflow.");
                const target = await targetFor();
                validateCanvas(graph, target);
                await save(graph, title);
                const run = (await getApi().workflowCommand({
                    action: "create",
                    title,
                    kind: "automation",
                    conversationId,
                    target,
                    parameters: { canvasBlockId: blockId, task: title },
                    graph,
                })) as WorkflowRun;
                await getApi().workflowOpen(run.id);
                hermesSurfaceController.requestOpenPanel();
            }}
            actions={
                <>
                    <button onClick={() => hermesSurfaceController.requestOpenPanel()}>Chat panel</button>
                    <button onClick={() => hermesSurfaceController.requestOpenHud()}>HUD chat</button>
                </>
            }
        />
    );
}
