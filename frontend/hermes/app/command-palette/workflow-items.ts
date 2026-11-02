// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { useWorkflowContext } from "@hermes/app/workflows/workflow-context";
import { closeCommandPalette } from "@hermes/store/command-palette";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

type CatalogNode = { name: string; displayName: string; description?: string; version: number | number[] };
type Widget = { blockId: string; label: string; view: string };
type Scope = { tabId?: string; workflowId?: string };
export type WorkflowPaletteItem = {
    id: string;
    label: string;
    detail: string;
    keywords: string[];
    keepOpen: true;
    run: () => void;
};
const command = <T>(body: Record<string, unknown>) =>
    window.hermesDesktop.api<T>({ path: "/api/kronterm/n8n/command", method: "POST", body });

export async function insertPaletteNode(node: CatalogNode, workflowId: string, isCurrent: () => boolean) {
    const definition = await command<any>({ operation: "get-node", nodeType: node.name });
    const workflow = await command<any>({ operation: "get-workflow", workflowId });
    if (!isCurrent() || workflow.id !== workflowId)
        throw new Error("The selected workflow changed. Choose the node again.");
    if (!workflow.versionId) throw new Error("Save the workflow before adding a node.");
    const versions = (Array.isArray(definition.version) ? definition.version : [definition.version]).filter(
        (value: unknown) => typeof value === "number" && value > 0
    );
    const version = definition.defaultVersion ?? Math.max(...versions);
    if (!Number.isFinite(version) || version <= 0) throw new Error("This node has no supported version.");
    const nodes = workflow.nodes ?? [];
    const baseName = definition.defaults?.name || node.displayName || node.name;
    let name = baseName;
    for (let index = 2; nodes.some((entry: any) => entry.name === name); index++) name = `${baseName} ${index}`;
    const x = nodes.length ? Math.max(...nodes.map((entry: any) => Number(entry.position?.[0]) || 0)) + 240 : 0;
    const y = nodes.length ? Number(nodes[0].position?.[1]) || 0 : 0;
    return command({
        operation: "edit-workflow",
        workflowId,
        expectedVersionId: workflow.versionId,
        edits: [
            {
                action: "add-node",
                node: {
                    id: crypto.randomUUID(),
                    name,
                    type: node.name,
                    typeVersion: version,
                    position: [x, y],
                    parameters: definition.defaults?.parameters ?? {},
                },
            },
        ],
    });
}

export function insertPaletteWidget(scope: Scope, widget: Widget): Promise<void> {
    return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const complete = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (
                detail?.requestId !== requestId ||
                detail.tabId !== scope.tabId ||
                detail.workflowId !== scope.workflowId
            )
                return;
            clearTimeout(timer);
            window.removeEventListener("kronterm:workflow-widget-inserted", complete);
            if (detail.error) reject(new Error(detail.error));
            else resolve();
        };
        const timer = setTimeout(() => {
            window.removeEventListener("kronterm:workflow-widget-inserted", complete);
            reject(new Error("The workflow editor did not respond. Open the workflow and try again."));
        }, 30000);
        window.addEventListener("kronterm:workflow-widget-inserted", complete);
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-insert-widget", { detail: { ...scope, ...widget, requestId } })
        );
    });
}

export function useWorkflowPaletteItems(open: boolean, search: string) {
    const scope = useWorkflowContext();
    const currentScope = useRef(scope);
    currentScope.current = scope;
    const pendingRef = useRef(false);
    const epoch = useRef(0);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const [pending, setPending] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        setError("");
        epoch.current++;
    }, [open, scope.tabId, scope.workflowId]);
    const enabled = Boolean(
        open && scope.tabId && scope.workflowId && scope.workflowId !== "new" && window.hermesDesktop?.api
    );
    const catalog = useQuery({
        queryKey: ["workflow-palette-nodes", scope.tabId, scope.workflowId, search],
        enabled,
        retry: false,
        queryFn: () =>
            command<CatalogNode[]>({
                operation: "search-nodes",
                query: search.replace(/^(?:add\s+)?(?:workflow\s+)?nodes?\s+/i, ""),
            }),
    });
    const widgets = useQuery({
        queryKey: ["workflow-palette-widgets", scope.tabId, scope.workflowId],
        enabled,
        retry: false,
        queryFn: () => command<Widget[]>({ operation: "workspace-widgets" }),
    });
    const run = (id: string, insert: () => Promise<unknown>) => {
        if (pendingRef.current || !enabled) return;
        pendingRef.current = true;
        const started = epoch.current;
        setPending(id);
        setError("");
        void insert()
            .then(() => {
                if (mounted.current && started === epoch.current) closeCommandPalette();
            })
            .catch((failure) => {
                if (mounted.current && started === epoch.current)
                    setError(
                        String(failure)
                            .replace(/^Error:\s*/, "")
                            .replace(/\bn8n\b/gi, "workflow")
                    );
            })
            .finally(() => {
                pendingRef.current = false;
                if (mounted.current) setPending("");
            });
    };
    const current = () =>
        currentScope.current.tabId === scope.tabId && currentScope.current.workflowId === scope.workflowId;
    const nodes: WorkflowPaletteItem[] = enabled
        ? (catalog.data ?? []).map((node) => ({
              id: `workflow-node:${node.name}`,
              label: node.displayName || node.name,
              detail: pending === node.name ? "Adding…" : "Add workflow node",
              keywords: ["workflow", "node", node.name, node.description?.replace(/<[^>]*>/g, " ") || ""],
              keepOpen: true,
              run: () => run(node.name, () => insertPaletteNode(node, scope.workflowId, current)),
          }))
        : [];
    const liveWidgets: WorkflowPaletteItem[] = enabled
        ? (widgets.data ?? []).map((widget) => ({
              id: `workflow-widget:${widget.blockId}`,
              label: widget.label,
              detail: pending === widget.blockId ? "Adding…" : `Add ${widget.view} widget node`,
              keywords: ["workflow", "node", "widget", widget.view],
              keepOpen: true,
              run: () =>
                  run(widget.blockId, () =>
                      insertPaletteWidget({ tabId: scope.tabId, workflowId: scope.workflowId }, widget)
                  ),
          }))
        : [];
    return {
        nodes,
        widgets: liveWidgets,
        error: error || (enabled ? catalog.error?.message || widgets.error?.message || "" : ""),
    };
}
