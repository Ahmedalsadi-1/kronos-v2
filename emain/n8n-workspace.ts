import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { workflowAccount, WorkflowBrowserId } from "./workflow-account";
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { webContents } from "electron";
import os from "node:os";
import path from "node:path";
import { n8nSurfacePath, type N8nSurface } from "../frontend/types/n8n-workspace";
import { grantManagedRuntimeRequests } from "./authkey";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermNativeToolBridge } from "./kronterm-native-tool-bridge";
import { editN8nDraft, type N8nWorkflowDraft } from "./n8n-builder";
import { requestN8n, type N8nEditorRequest } from "./n8n-client";
import type { N8nRuntime } from "./n8n-runtime";
import { selectWorkflowWorkerTarget } from "./n8n-worker-scope";
import { n8nScopeKey, N8nWorkspaceStore } from "./n8n-workspace-store";

export type N8nWorkspaceCommand = {
    operation:
        | "editor-state"
        | "editor-session"
        | "editor-request"
        | "editor-cancel"
        | "attach"
        | "hide-desktop"
        | "account"
        | "state"
        | "runtime-status"
        | "open"
        | "switch-workspace"
        | "folders"
        | "workflows"
        | "workspace-widgets"
        | "workspace-computers"
        | "select-workflow"
        | "create-workflow"
        | "search-nodes"
        | "node-ports"
        | "get-node"
        | "get-workflow"
        | "edit-workflow"
        | "validate-workflow"
        | "executions"
        | "execution-detail"
        | "run-workflow"
        | "run-agent";
    webContentsId?: number;
    account?: { email: string; password: string; firstName: string; lastName: string };
    surface?: N8nSurface;
    workflowId?: string;
    query?: string;
    nodeType?: string;
    name?: string;
    action?: "create-folder" | "rename-folder" | "delete-folder" | "move-workflow";
    folderId?: string;
    edits?: Parameters<typeof editN8nDraft>[1];
    expectedVersionId?: string;
    task?: string;
    computerId?: string;
    computerGeneration?: number;
    timeoutSeconds?: number;
    executionId?: string;
    expectedGeneration?: number;
    input?: unknown;
};

export class N8nWorkspace {
    private desktops = new Map<
        string,
        {
            surface: N8nSurface;
            url: string;
            dirty?: boolean;
            revision?: number;
            documentWorkflowId?: string;
            sequence?: number;
            stateId?: string;
        }
    >();
    private mutations = new Map<string, Promise<unknown>>();
    private requestSignals = new AsyncLocalStorage<AbortSignal>();
    private editors = new Map<string, Set<number>>();
    private cancelledRequests = new Map<string, number>();
    private requests = new Map<string, { controller: AbortController; senderId?: number }>();

    private markDocumentChanged(key: string, workflowId: string) {
        const desktop = this.desktops.get(key);
        if (!desktop) return;
        desktop.revision = (desktop.revision ?? 0) + 1;
        desktop.documentWorkflowId = workflowId;
    }

    private registerEditor(key: string, senderId?: number) {
        if (senderId == null) return;
        const contents = webContents.fromId(senderId);
        if (!contents || contents.isDestroyed()) throw new Error("Workflow renderer is closed.");
        const editors = this.editors.get(key) ?? new Set<number>();
        if (editors.has(senderId)) return;
        editors.add(senderId);
        this.editors.set(key, editors);
        contents.once("destroyed", () => {
            editors.delete(senderId);
            if (!editors.size) this.editors.delete(key);
            for (const request of this.requests.values()) if (request.senderId === senderId) request.controller.abort();
        });
    }

    constructor(
        private runtime: N8nRuntime,
        private runAgent: (
            input: N8nWorkspaceCommand,
            context: HermesSurfaceContext,
            signal?: AbortSignal
        ) => Promise<unknown>,
        private store = new N8nWorkspaceStore(path.join(os.homedir(), ".kronterm/runtimes/n8n")),
        private onHandoff?: () => void
    ) {}

    private async ensureConnected(context: HermesSurfaceContext) {
        let status = this.runtime.status();
        if (!status.running) {
            if (context.n8nWorkerId) this.runtime.assertScope(context);
            const bridge = new KronTermNativeToolBridge(() => context);
            const config = JSON.parse(await bridge.listWidgets());
            status = await this.runtime.start(context, { ...config.defaultwidgets, ...config.widgets });
        }
        this.runtime.assertScope(context);
        await workflowAccount(status.url);
        this.runtime.assertScope(context);
        return status;
    }

    private async savedCanvases(
        context: HermesSurfaceContext,
        workflowId?: string,
        checkNativeEditors = true
    ): Promise<Electron.WebContents[]> {
        this.runtime.assertScope(context);
        const key = n8nScopeKey(context);
        for (const senderId of (checkNativeEditors ? this.editors.get(key) : undefined) ?? []) {
            const contents = webContents.fromId(senderId);
            if (!contents || contents.isDestroyed()) continue;
            const document = await contents.executeJavaScript(
                "window.__KRONTERM_WORKFLOW_HOST__?.getDocumentState?.()"
            );
            if (!document) throw new Error("Reconnect the workflow editor before changing its graph.");
            if ((!workflowId || document.workflowId === workflowId) && document.dirty)
                throw new Error("Save the current workflow edits before asking Hermes to change the graph.");
        }
        if (this.desktops.get(n8nScopeKey(context))?.dirty)
            throw new Error("Save the current workflow edits before asking Hermes to change the graph.");
        const origin = new URL(this.runtime.status().url).origin;
        const canvases: Electron.WebContents[] = [];
        for (const contents of webContents.getAllWebContents()) {
            if (contents.isDestroyed() || contents.getType() !== "webview") continue;
            let url: URL;
            try {
                url = new URL(contents.getURL());
            } catch {
                continue;
            }
            if (url.origin !== origin || !/^\/workflow\/[^/]+\/?$/.test(url.pathname)) continue;
            if (workflowId && url.pathname.split("/")[2] !== workflowId) continue;
            const state = await contents.executeJavaScript("window.krontermWorkflowState?.()");
            if (!state) throw new Error("Reload the workflow canvas to attach the workflow builder.");
            if (state.dirty)
                throw new Error(
                    "Save the current canvas edits before changing workflows or asking Hermes to edit them."
                );
            canvases.push(contents);
        }
        return canvases;
    }

    private async withEditorLease<T>(
        context: HermesSurfaceContext,
        workflowId: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const leases: Electron.WebContents[] = [];
        try {
            for (const senderId of this.editors.get(n8nScopeKey(context)) ?? []) {
                const contents = webContents.fromId(senderId);
                if (!contents || contents.isDestroyed()) continue;
                const document = await contents.executeJavaScript(
                    "window.__KRONTERM_WORKFLOW_HOST__?.getDocumentState?.()"
                );
                if (
                    workflowId == null &&
                    !document &&
                    !(await contents.executeJavaScript("Boolean(window.__KRONTERM_WORKFLOW_HOST__)"))
                )
                    continue;
                if (workflowId != null && document?.workflowId !== workflowId) continue;
                const acquired = await contents.executeJavaScript(
                    "window.__KRONTERM_WORKFLOW_HOST__?.beginDocumentMutation?.()"
                );
                if (!acquired)
                    throw new Error("Save the current workflow edits before asking Hermes to change the graph.");
                leases.push(contents);
            }
            return await operation();
        } finally {
            await Promise.allSettled(
                leases
                    .filter((contents) => !contents.isDestroyed())
                    .map((contents) =>
                        contents.executeJavaScript("window.__KRONTERM_WORKFLOW_HOST__?.endDocumentMutation?.()")
                    )
            );
        }
    }

    private async switchWorkspace(input: N8nWorkspaceCommand, context: HermesSurfaceContext, signal?: AbortSignal) {
        if (context.n8nEditorId == null || !Number.isSafeInteger(input.expectedGeneration))
            throw new Error("Switch the workflow connection from the desktop Workflows panel.");
        const owner = this.runtime.handoffOwner(context, input.expectedGeneration);
        const oldKey = n8nScopeKey(owner);
        const bridge = new KronTermNativeToolBridge(() => context);
        const config = JSON.parse(await bridge.listWidgets());
        const release = () => {
            signal?.throwIfAborted();
            this.runtime.handoffOwner(context, input.expectedGeneration);
            if (this.mutations.has(oldKey))
                throw new Error("A workflow change is still in progress in the other tab. Try again when it finishes.");
            this.onHandoff?.();
            this.runtime.stop();
            this.desktops.delete(oldKey);
            const starting = this.runtime.start(context, { ...config.defaultwidgets, ...config.widgets });
            void starting.catch(() => {});
            return { starting };
        };
        const { starting } = this.runtime.status().running
            ? await this.withEditorLease(owner, undefined, async () => {
                  await this.savedCanvases(owner, undefined, false);
                  return release();
              })
            : release();
        await starting;
        return this.execute({ operation: "open", surface: "canvas", workflowId: input.workflowId }, context);
    }

    private async publishNativeDocument(
        context: HermesSurfaceContext,
        workflowId: string,
        workflow: unknown
    ): Promise<boolean> {
        let refreshRequired = false;
        const payload = JSON.stringify(JSON.stringify(workflow));
        for (const senderId of this.editors.get(n8nScopeKey(context)) ?? []) {
            const contents = webContents.fromId(senderId);
            if (!contents || contents.isDestroyed()) continue;
            try {
                const document = await contents.executeJavaScript(
                    "window.__KRONTERM_WORKFLOW_HOST__?.getDocumentState?.()"
                );
                if (document?.workflowId !== workflowId) continue;
                const updated = await contents.executeJavaScript(
                    `(async () => { const host = window.__KRONTERM_WORKFLOW_HOST__; if (!host?.refreshDocument) return false; await host.refreshDocument(JSON.parse(${payload})); return true; })()`
                );
                if (updated === false) refreshRequired = true;
            } catch {
                refreshRequired = true;
            }
        }
        return refreshRequired;
    }

    private async request(context: HermesSurfaceContext, route: string, method = "GET", body?: unknown): Promise<any> {
        this.runtime.assertScope(context);
        const origin = new URL(this.runtime.status().url).origin;
        const result = await requestN8n(origin, { route, method, body }, this.requestSignals.getStore());
        if (result.status >= 400) {
            const pathname = new URL(route, origin).pathname;
            throw new Error(`Workflow service returned ${result.status} (${method} ${pathname})`);
        }
        const value = result.data as any;
        return value?.data ?? value;
    }

    command(input: N8nWorkspaceCommand, context: HermesSurfaceContext, signal?: AbortSignal): Promise<any> {
        input = structuredClone(input);
        context = structuredClone(context);
        const initialOrigin = this.runtime.status().url;
        const execute = () =>
            this.requestSignals.run(signal, () => {
                if (
                    initialOrigin &&
                    this.runtime.status().url !== initialOrigin &&
                    !["state", "open", "account", "hide-desktop"].includes(input.operation)
                )
                    throw new Error("The workflow runtime changed. Retry in the current workspace.");
                return this.execute(input, context, signal);
            });
        const editorRequest = input.input as N8nEditorRequest;
        const documentWrite =
            input.operation === "editor-request" &&
            !["GET", "HEAD"].includes(editorRequest?.method || "GET") &&
            /^\/rest\/workflows(?:\/|$)/.test(editorRequest?.route);
        const serialize =
            documentWrite ||
            [
                "editor-state",
                "edit-workflow",
                "select-workflow",
                "create-workflow",
                "open",
                "hide-desktop",
                "switch-workspace",
            ].includes(input.operation);
        if (!serialize) return execute();
        const key = n8nScopeKey(context);
        const previous = this.mutations.get(key) ?? Promise.resolve();
        const pending = previous.catch(() => {}).then(execute);
        this.mutations.set(key, pending);
        void pending
            .finally(() => {
                if (this.mutations.get(key) === pending) this.mutations.delete(key);
            })
            .catch(() => {});
        return pending;
    }

    private async execute(
        input: N8nWorkspaceCommand,
        context: HermesSurfaceContext,
        signal?: AbortSignal
    ): Promise<any> {
        if (signal?.aborted) throw new Error("Workflow operation cancelled.");
        if (input.operation === "runtime-status") {
            if (!context?.workspaceId || !context.tabId) throw new Error("Open a workspace tab first.");
            const { running, occupiedGeneration } = this.runtime.status(context);
            return { running, occupied: occupiedGeneration != null };
        }
        const bridge = new KronTermNativeToolBridge(() => context);
        const state = this.store.read(context);
        if (context.n8nWorkflowId && input.workflowId && input.workflowId !== context.n8nWorkflowId)
            throw new Error("The workflow worker cannot target another workflow.");
        const workflowId = input.workflowId ?? context.n8nWorkflowId ?? state.selectedWorkflowId;
        if (workflowId != null) n8nSurfacePath("canvas", workflowId);
        const desktopKey = n8nScopeKey(context);
        if (input.operation === "switch-workspace") return this.switchWorkspace(input, context, signal);
        if (
            [
                "workflows",
                "select-workflow",
                "create-workflow",
                "search-nodes",
                "get-node",
                "get-workflow",
                "edit-workflow",
                "validate-workflow",
                "node-ports",
                "executions",
                "execution-detail",
                "run-workflow",
                "run-agent",
            ].includes(input.operation)
        ) {
            if (
                [
                    "select-workflow",
                    "get-workflow",
                    "edit-workflow",
                    "validate-workflow",
                    "node-ports",
                    "executions",
                    "execution-detail",
                    "run-workflow",
                ].includes(input.operation) &&
                !workflowId
            )
                throw new Error("Select a workflow first.");
            await this.ensureConnected(context);
        }
        if (input.operation === "workspace-computers") {
            if (!context.workspaceId || !context.tabId) throw new Error("Open a workspace tab first.");
            const { getLinuxDesktopsRuntime } = await import("./linux-desktops-runtime");
            return (await getLinuxDesktopsRuntime().list()).map((desktop) => ({
                id: desktop.id,
                label: desktop.name || desktop.id,
                ready:
                    desktop.ready &&
                    desktop.controlOwner === "agent" &&
                    desktop.assignedAgentId === `sandbox:${context.tabId}`,
            }));
        }
        if (input.operation === "workspace-widgets") {
            if (!context.workspaceId || !context.tabId) throw new Error("Open a workspace tab first.");
            const blocks = JSON.parse(await bridge.listBlocks(context.tabId));
            return blocks
                .filter(
                    (block: any) => block.tabid === context.tabId && typeof (block.blockid ?? block.oid) === "string"
                )
                .map((block: any) => {
                    const view = String(block.view ?? block.meta?.view ?? "");
                    return {
                        blockId: block.blockid ?? block.oid,
                        label: String(
                            block.meta?.["display:name"] ||
                                block.meta?.["display:label"] ||
                                block.meta?.title ||
                                view ||
                                "Widget"
                        ).slice(0, 160),
                        view,
                    };
                });
        }
        if (input.operation === "editor-state") {
            this.runtime.assertScope(context);
            const value = input.input as {
                path?: string;
                workflowId?: string;
                dirty?: boolean;
                sequence?: number;
                stateId?: string;
            };
            const desktop = this.desktops.get(desktopKey);
            if (desktop) {
                if (value.stateId && value.stateId !== desktop.stateId)
                    return { updated: false, sequence: desktop.sequence };
                if (value.sequence != null && (!Number.isSafeInteger(value.sequence) || value.sequence < 0))
                    throw new Error("Invalid editor state sequence.");
                if (value.sequence != null && value.sequence <= (desktop.sequence ?? -1))
                    return { updated: false, sequence: desktop.sequence };
                if (value.sequence != null) desktop.sequence = value.sequence;
                if (value.path?.startsWith("/") && !value.path.startsWith("//") && !value.path.includes(".."))
                    desktop.url = new URL(value.path, this.runtime.status().url).toString();
                if (value.dirty != null) desktop.dirty = value.dirty;
                if (value.workflowId && value.workflowId !== "new") {
                    n8nSurfacePath("canvas", value.workflowId);
                    this.store.command(context, { action: "select-workflow", workflowId: value.workflowId });
                }
            }
            return { updated: true, sequence: desktop?.sequence };
        }
        if (input.operation === "editor-session") {
            this.runtime.assertScope(context);
            const status = this.runtime.status();
            await workflowAccount(status.url);
            this.runtime.assertScope(context);
            this.registerEditor(desktopKey, context.n8nEditorId);
            const desktop = this.desktops.get(desktopKey);
            if (desktop) {
                desktop.stateId = randomUUID();
                desktop.sequence = -1;
            }
            return {
                stateId: desktop?.stateId,
                backendUrl: status.url,
                browserId: WorkflowBrowserId,
                workflowId,
                path: desktop
                    ? new URL(desktop.url).pathname + new URL(desktop.url).search
                    : n8nSurfacePath("canvas", workflowId),
            };
        }
        if (input.operation === "editor-cancel") {
            const requestId = (input.input as { requestId?: string })?.requestId;
            const key = `${desktopKey}:${context.n8nEditorId ?? "native"}:${requestId}`;
            if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId))
                throw new Error("Invalid request identifier.");
            this.requests.get(key)?.controller.abort();
            this.cancelledRequests.set(key, Date.now());
            for (const [id, time] of this.cancelledRequests)
                if (time < Date.now() - 60000 || this.cancelledRequests.size > 1000) this.cancelledRequests.delete(id);
            return { cancelled: true };
        }
        if (input.operation === "editor-request") {
            this.runtime.assertScope(context);
            const request = input.input as N8nEditorRequest;
            if (context.n8nWorkerId) throw new Error("Workflow workers must use the scoped workflow tools.");
            const key = request?.requestId
                ? `${desktopKey}:${context.n8nEditorId ?? "native"}:${request.requestId}`
                : undefined;
            if (request?.requestId && !/^[a-zA-Z0-9_-]{1,128}$/.test(request.requestId))
                throw new Error("Invalid request identifier.");
            if (key && this.cancelledRequests.delete(key)) throw new Error("Workflow request was cancelled.");
            if (context.n8nEditorId != null) {
                const contents = webContents.fromId(context.n8nEditorId);
                if (!contents || contents.isDestroyed()) throw new Error("Workflow renderer is closed.");
            }
            if (key && this.requests.has(key)) throw new Error("Workflow request is already running.");
            const controller = new AbortController();
            if (key) this.requests.set(key, { controller, senderId: context.n8nEditorId });
            try {
                const origin = this.runtime.status().url;
                const documentMatch = request.route?.match(/^\/rest\/workflows\/([a-zA-Z0-9_-]+)(?:\?|$)/);
                const expectedChecksum = (request.body as { expectedChecksum?: string })?.expectedChecksum;
                if (
                    documentMatch &&
                    ["PATCH", "PUT"].includes(request.method) &&
                    expectedChecksum &&
                    new URL(request.route, origin).searchParams.get("forceSave") !== "true"
                ) {
                    const current = await this.request(context, `/rest/workflows/${documentMatch[1]}`);
                    if (current.checksum && current.checksum !== expectedChecksum)
                        return {
                            status: 409,
                            statusText: "Conflict",
                            data: { message: "Workflow changed. Reload the current document before saving." },
                            headers: {},
                        };
                }
                const result = await requestN8n(
                    origin,
                    request,
                    signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
                );
                if (documentMatch) {
                    const id = documentMatch[1];
                    const desktop = this.desktops.get(desktopKey);
                    const openId = desktop && new URL(desktop.url).pathname.match(/^\/workflow\/([^/]+)/)?.[1];
                    const succeeded = result.status >= 200 && result.status < 300;
                    const deleted = request.method === "DELETE" && succeeded;
                    const missing = request.method === "GET" && result.status === 404 && openId === id;
                    if (deleted || missing) {
                        if (deleted) this.store.removeWorkflow(context, id);
                        else if (this.store.read(context).selectedWorkflowId === id)
                            this.store.command(context, { action: "select-workflow" });
                        if (desktop?.documentWorkflowId === id) delete desktop.documentWorkflowId;
                        if (openId === id) {
                            desktop.surface = "canvas";
                            desktop.url = new URL(n8nSurfacePath("canvas"), origin).toString();
                            desktop.dirty = false;
                        }
                    } else if (succeeded && ["PATCH", "PUT"].includes(request.method)) {
                        this.markDocumentChanged(desktopKey, id);
                    }
                }
                return result;
            } finally {
                if (key) this.requests.delete(key);
            }
        }
        if (input.operation === "hide-desktop") {
            this.desktops.delete(desktopKey);
            return { hidden: true };
        }
        if (input.operation === "attach") {
            this.runtime.assertScope(context);
            const contents = webContents.fromId(input.webContentsId);
            const origin = new URL(this.runtime.status().url).origin;
            if (!contents || contents.getType() !== "webview" || new URL(contents.getURL()).origin !== origin)
                throw new Error("Unknown workflow editor surface.");
            grantManagedRuntimeRequests(origin, "browser-id", WorkflowBrowserId, contents.id);
            await contents.executeJavaScript(
                `localStorage.setItem("n8n-browserId", ${JSON.stringify(WorkflowBrowserId)})`
            );
            return { attached: true };
        }
        if (input.operation === "account") {
            if (input.account)
                throw new Error("Workflow access is managed by your Hermes session. No separate login is needed.");
            const config = JSON.parse(await bridge.listWidgets());
            const status = await this.runtime.start(context, { ...config.defaultwidgets, ...config.widgets });
            await workflowAccount(status.url);
            return { connected: true };
        }
        if (input.operation === "state") {
            const status = this.runtime.status(context);
            if (status.running && !context.n8nWorkerId && !this.desktops.has(desktopKey)) {
                const blocks = JSON.parse(await bridge.listBlocks());
                const canvas = blocks.find((block: any) => block.meta?.["n8n:surface"] === "canvas");
                let selected: string;
                try {
                    const url = new URL(canvas?.meta?.url);
                    if (url.origin === new URL(status.url).origin)
                        selected = url.pathname.match(/^\/workflow\/([a-zA-Z0-9_-]+)/)?.[1];
                } catch {
                    selected = undefined;
                }
                if (selected && selected !== "new" && selected !== state.selectedWorkflowId) {
                    const next = this.store.command(context, { action: "select-workflow", workflowId: selected });
                    for (const block of blocks) {
                        const surface = block.meta?.["n8n:surface"];
                        if (!["executions", "evaluations"].includes(surface)) continue;
                        await bridge.setBlockMeta(block.blockid ?? block.oid, {
                            url: new URL(n8nSurfacePath(surface, selected), status.url).toString(),
                            "n8n:workflowid": selected,
                        });
                    }
                    return { ...status, ...next };
                }
            }
            return {
                ...status,
                ...state,
                desktop: status.running ? this.desktops.get(desktopKey) : undefined,
                accountRequired: false,
                documentRevision: this.desktops.get(desktopKey)?.revision ?? 0,
                documentWorkflowId: this.desktops.get(desktopKey)?.documentWorkflowId ?? state.selectedWorkflowId,
            };
        }
        if (input.operation === "folders") {
            if (!input.action) throw new Error("Choose a folder action.");
            return this.store.command(context, { ...input, action: input.action });
        }
        if (input.operation === "open") {
            const surface = input.surface ?? "canvas";
            if (surface === "evaluations" && !workflowId)
                throw new Error("Select a saved workflow before opening evaluations.");
            const surfacePath = n8nSurfacePath(surface, workflowId);
            const status = await this.ensureConnected(context);
            const url = new URL(surfacePath, status.url).toString();
            const previous = this.desktops.get(desktopKey);
            const documentWorkflowId =
                ["canvas", "executions", "evaluations"].includes(surface) && workflowId && workflowId !== "new"
                    ? workflowId
                    : undefined;
            if (documentWorkflowId)
                this.store.command(context, { action: "select-workflow", workflowId: documentWorkflowId });
            const mounted = previous && new URL(previous.url).origin === new URL(url).origin;
            this.desktops.set(desktopKey, { ...(mounted ? previous : {}), surface, url, documentWorkflowId });
            return { ...status, surface, desktop: true };
        }
        if (input.operation === "select-workflow") {
            if (!workflowId) throw new Error("Choose a workflow.");
            await this.savedCanvases(context);
            const saved = this.store.command(context, { action: "select-workflow", workflowId });
            const desktop = this.desktops.get(desktopKey);
            if (desktop && ["canvas", "executions", "evaluations"].includes(desktop.surface)) {
                desktop.url = new URL(
                    n8nSurfacePath(desktop.surface, workflowId),
                    this.runtime.status().url
                ).toString();
                this.markDocumentChanged(desktopKey, workflowId);
            }
            const blocks = JSON.parse(await bridge.listBlocks());
            for (const block of blocks) {
                const surface = block.meta?.["n8n:surface"];
                if (!["canvas", "executions", "evaluations"].includes(surface)) continue;
                const url = new URL(n8nSurfacePath(surface, workflowId), this.runtime.status().url).toString();
                await bridge.setBlockMeta(block.blockid ?? block.oid, { url, "n8n:workflowid": workflowId });
            }
            return saved;
        }
        if (input.operation === "workflows") return this.request(context, "/rest/workflows?take=200&skip=0");
        if (input.operation === "create-workflow") {
            await this.savedCanvases(context);
            let draft: N8nWorkflowDraft = {
                name: input.name?.trim() || "New KronOS workflow",
                nodes: [
                    {
                        id: "trigger",
                        name: "Start",
                        type: "n8n-nodes-base.manualTrigger",
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {},
                    },
                ],
                connections: {},
                settings: { executionOrder: "v1" },
            };
            if (input.edits != null) {
                if (input.task != null) throw new Error("Use either the KronOS Agent task or graph edits.");
                draft = editN8nDraft(draft, input.edits);
                const validation = await this.runtime.validateDraft(context, draft);
                if (!validation.valid) throw new Error(validation.errors.join("\n"));
            } else {
                const agentName = "KronOS Agent";
                draft.nodes.push({
                    id: "hermes",
                    name: agentName,
                    type: "CUSTOM.hermesAgent",
                    typeVersion: 1,
                    position: [260, 0],
                    parameters: { task: input.task || "Describe the task for this workflow.", timeoutSeconds: 180 },
                });
                draft.connections.Start = { main: [[{ node: agentName, type: "main", index: 0 }]] };
            }
            const created = await this.request(context, "/rest/workflows", "POST", draft);
            if (context.n8nWorkerId) selectWorkflowWorkerTarget(context.n8nWorkerId, created.id);
            this.store.command(context, { action: "select-workflow", workflowId: created.id });
            const desktop = this.desktops.get(desktopKey);
            if (desktop) {
                desktop.url = new URL(n8nSurfacePath("canvas", created.id), this.runtime.status().url).toString();
                desktop.surface = "canvas";
                this.markDocumentChanged(desktopKey, created.id);
            }
            return created;
        }
        if (input.operation === "search-nodes" || input.operation === "get-node") {
            const nodes = await this.runtime.nodes(context);
            if (input.operation === "get-node") {
                const node = nodes.find((entry) => entry.name === input.nodeType);
                if (!node) throw new Error("Node type not found.");
                return node;
            }
            const query = (input.query ?? "").trim().toLowerCase();
            return nodes
                .filter((node) => `${node.name} ${node.displayName} ${node.description}`.toLowerCase().includes(query))
                .slice(0, 60)
                .map(({ name, displayName, description, version, inputs, outputs }) => ({
                    name,
                    displayName,
                    description,
                    version,
                    inputs,
                    outputs,
                }));
        }
        if (input.operation === "run-agent") {
            let scope = context;
            if (input.computerId) {
                const { getLinuxDesktopsRuntime } = await import("./linux-desktops-runtime");
                const desktop = (await getLinuxDesktopsRuntime().list()).find((entry) => entry.id === input.computerId);
                if (
                    !desktop?.ready ||
                    desktop.controlOwner !== "agent" ||
                    desktop.assignedAgentId !== `sandbox:${context.tabId}` ||
                    !Number.isSafeInteger(desktop.controlGeneration) ||
                    (input.computerGeneration != null && input.computerGeneration !== desktop.controlGeneration)
                )
                    throw new Error(
                        "The selected VM is not ready or Computer control is not assigned to this workspace."
                    );
                scope = {
                    ...context,
                    sandboxComputerId: desktop.id,
                    sandboxComputerGeneration: desktop.controlGeneration,
                    sandboxComputerMode: "sandbox",
                    delegationScope: "sandbox",
                };
            }
            return this.runAgent({ ...input, workflowId }, scope, signal);
        }
        if (!workflowId) throw new Error("Select a workflow first.");
        const workflow = (await this.request(
            context,
            `/rest/workflows/${encodeURIComponent(workflowId)}`
        )) as N8nWorkflowDraft;
        if (input.operation === "get-workflow") return workflow;
        if (input.operation === "node-ports") return this.runtime.nodePorts(context, workflow);
        if (input.operation === "validate-workflow") return this.runtime.validateDraft(context, workflow);
        if (input.operation === "edit-workflow") {
            if (!input.expectedVersionId || input.expectedVersionId !== workflow.versionId)
                throw new Error("Workflow changed. Read it again before editing.");
            const canvases = await this.savedCanvases(context, workflowId);
            return this.withEditorLease(context, workflowId, async () => {
                const latest = (await this.request(
                    context,
                    `/rest/workflows/${encodeURIComponent(workflowId)}`
                )) as N8nWorkflowDraft & { checksum?: string };
                if (latest.versionId !== input.expectedVersionId)
                    throw new Error("Workflow changed. Read it again before editing.");
                const edited = editN8nDraft(latest, input.edits);
                const saved = await this.request(
                    context,
                    `/rest/workflows/${encodeURIComponent(workflowId)}`,
                    "PATCH",
                    {
                        name: edited.name,
                        nodes: edited.nodes,
                        connections: edited.connections,
                        settings: edited.settings,
                        versionId: input.expectedVersionId,
                        expectedChecksum: latest.checksum,
                    }
                );
                this.markDocumentChanged(desktopKey, workflowId);
                let refreshRequired = await this.publishNativeDocument(context, workflowId, saved);
                for (const canvas of canvases) {
                    if (canvas.isDestroyed()) continue;
                    const state = await canvas.executeJavaScript("window.krontermWorkflowState?.()");
                    if (state?.dirty) refreshRequired = true;
                    else canvas.reload();
                }
                return { workflow: saved, refreshRequired };
            });
        }
        if (input.operation === "executions") {
            const filter = encodeURIComponent(JSON.stringify({ workflowId }));
            return this.request(context, `/rest/executions?filter=${filter}&limit=50`);
        }
        if (input.operation === "execution-detail") {
            if (!input.executionId || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.executionId))
                throw new Error("Choose a valid execution.");
            const execution = await this.request(
                context,
                `/rest/executions/${encodeURIComponent(input.executionId)}?includeData=true`
            );
            if (execution.workflowId !== workflowId) throw new Error("Execution belongs to another workflow.");
            execution.data = this.runtime.decodeExecutionData(execution.data);
            return execution;
        }
        if (input.operation === "run-workflow") {
            const trigger = workflow.nodes.find((node) => node.type === "n8n-nodes-base.manualTrigger");
            if (!trigger)
                throw new Error("Run this workflow from its trigger in the canvas; no manual trigger is configured.");
            return this.request(context, `/rest/workflows/${encodeURIComponent(workflowId)}/run`, "POST", {
                triggerToStartFrom: { name: trigger.name },
            });
        }
        throw new Error("Unknown workflow operation.");
    }
}
