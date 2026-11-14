// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceService } from "@/app/store/services";
import { desktopCapturer } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AgentActivityEvent } from "../frontend/types/agent-activity";
import { reusableTerminal } from "../mcp-kron-term/src/terminal-reuse";
import { ToolFailure, ToolOperationContext, type ToolTarget } from "../mcp-kron-term/src/tool-execution";
import {
    validateWorkspaceSurfaceControl,
    WshBridge,
    type SurfaceCapability,
    type WorkspaceSurfaceControl,
} from "../mcp-kron-term/src/wsh-bridge";
import { createAgentPreviewPublisher } from "./agent-native-preview";
import { attributeAgentSurfaceActivity } from "./agent-surface-context";
import {
    arrangeNativeHudIslands,
    closeNativeHudIsland,
    focusNativeHudIsland,
    listNativeHudIslands,
    nativeDesktopHudActive,
    nativeHudViewingContext,
    nativeHudWidgetRoute,
    setNativeHudIslandBounds,
    type NativeHudIslandLayout,
} from "./emain-hud";
import { notifyDesktopPetActivity, notifyDesktopPetSurfaceActivity } from "./emain-pet";
import * as windows from "./emain-window";
import { ElectronWshClient } from "./emain-wsh";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { selectNativeSurfaceSource } from "./native-surface-selection";
import { isSwarmScoped, swarmBlockTarget, type SwarmTarget } from "./swarm-target-scope";
import { resolveToolRequestContext, withToolRequestContext } from "./tool-request-context";

let nativePreviewSources: ReturnType<typeof desktopCapturer.getSources>;
const publishWithPreview = createAgentPreviewPublisher(notifyDesktopPetSurfaceActivity, async (appName) => {
    nativePreviewSources ??= desktopCapturer
        .getSources({
            types: ["window"],
            thumbnailSize: { width: 1280, height: 800 },
        })
        .finally(() => {
            nativePreviewSources = undefined;
        });
    const sources = await nativePreviewSources;
    const source = selectNativeSurfaceSource(sources, appName);
    if (!source || source.thumbnail.isEmpty()) throw new Error("App preview unavailable");
    return source.thumbnail.toDataURL();
});

type SurfaceContextProvider = () => HermesSurfaceContext | null;

function blockId(value: string): string {
    return value.startsWith("block:") ? value.slice("block:".length) : value;
}

function blockIdFromCreateResult(value: string): string | null {
    const normalized = blockId(value.trim());
    if (/^[a-z0-9][a-z0-9-]{7,}$/i.test(normalized)) return normalized;
    return value.match(/block:([a-z0-9-]+)/i)?.[1] ?? value.match(/\b([a-f0-9]{8}-[a-f0-9-]{20,})\b/i)?.[1] ?? null;
}

function json(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

function dataUrlFromSandboxResult(value: unknown): string {
    const result = value as { image?: unknown; mimeType?: unknown; encoding?: unknown };
    if (typeof result.image !== "string" || !result.image) {
        return json(value);
    }
    if (result.image.startsWith("data:image/")) {
        return result.image;
    }
    return `data:${typeof result.mimeType === "string" ? result.mimeType : "image/png"};base64,${result.image}`;
}

function normalizeBrowserUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`Unsupported browser URL protocol: ${url.protocol}`);
    }
    return url.href;
}

export { runWithAgentActivitySource } from "./agent-surface-context";

export class KronTermNativeToolBridge extends WshBridge {
    private contextProvider: SurfaceContextProvider;
    private sandboxUrls = new Map<string, string>();
    private acpDelegationActive = false;
    private inventoryPending: Promise<WorkspaceInfoData[]>;
    private discoveryPending: Promise<any[]>;
    private workspaceOperations = new Map<string, Promise<unknown>>();
    private ownersPending = new Map<string, Promise<BlockInfoData>>();

    private async owner(target: string): Promise<BlockInfoData> {
        const normalized = this.assertBlockScope(target);
        const pending = this.ownersPending.get(normalized);
        if (pending) return pending;
        const request = this.rpc("blockinfo", normalized) as Promise<BlockInfoData>;
        this.ownersPending.set(normalized, request);
        try {
            return await request;
        } finally {
            this.ownersPending.delete(normalized);
        }
    }

    async withToolTarget<T>(target: ToolTarget, operation: () => Promise<T>): Promise<T> {
        const routingStart = performance.now();
        const caller = structuredClone(this.context());
        if (
            caller.sandboxComputerId &&
            ((target.targetTabId && target.targetTabId !== caller.tabId) ||
                (target.targetWorkspaceId && target.targetWorkspaceId !== caller.workspaceId))
        )
            throw new ToolFailure("SCOPE_DENIED", "Computer mode cannot target another workspace.");
        if (caller.hostMode === "web-fullscreen") {
            if (
                (target.targetTabId && target.targetTabId !== caller.tabId) ||
                (target.targetWorkspaceId && target.targetWorkspaceId !== caller.workspaceId)
            ) {
                throw new ToolFailure("SCOPE_DENIED", "Target is outside the active web surface capability");
            }
            if (target.blockId) this.assertBlockScope(target.blockId);
            return withToolRequestContext(caller, operation);
        }
        if (ToolOperationContext.getStore()?.name === "workspace_inventory") {
            return withToolRequestContext(caller, operation);
        }
        let tabId = target.targetTabId;
        let workspaceId = target.targetWorkspaceId;
        let targetBlock = target.blockId && target.blockId !== "this" ? blockId(target.blockId) : undefined;
        if (targetBlock) {
            const owner = await this.owner(targetBlock);
            if (!owner?.tabid || !owner.workspaceid)
                throw new ToolFailure("TARGET_CLOSED", "Widget has no owning workspace/tab");
            if (isSwarmScoped(caller) && (owner.tabid !== caller.tabId || owner.workspaceid !== caller.workspaceId))
                throw new ToolFailure("STALE_TARGET", "Swarm block moved out of its assigned tab or workspace.");
            if ((tabId && tabId !== owner.tabid) || (workspaceId && workspaceId !== owner.workspaceid)) {
                throw new ToolFailure(
                    "TARGET_MISMATCH",
                    "Widget does not belong to the explicitly requested workspace/tab"
                );
            }
            tabId = owner.tabid;
            workspaceId = owner.workspaceid;
        } else if (tabId || workspaceId) {
            const entries = await this.workspaces();
            const entry = entries.find((entry) =>
                workspaceId ? entry.workspacedata.oid === workspaceId : entry.workspacedata.tabids.includes(tabId)
            );
            if (!entry || (tabId && !entry.workspacedata.tabids.includes(tabId)))
                throw new ToolFailure("TARGET_CLOSED", "Requested workspace/tab does not exist");
            workspaceId = entry.workspacedata.oid;
            tabId = tabId ?? entry.workspacedata.activetabid;
        }
        if (!workspaceId && !caller.workspaceId) {
            const entries = await this.workspaces();
            const entry = entries.find((entry) => entry.workspacedata.tabids.includes(tabId ?? caller.tabId));
            if (!entry) throw new ToolFailure("TARGET_CLOSED", "Caller tab no longer belongs to a workspace");
            workspaceId = entry.workspacedata.oid;
        }
        const resolved = {
            ...caller,
            tabId: tabId ?? caller.tabId,
            workspaceId: workspaceId ?? caller.workspaceId,
            blockId: targetBlock ?? (tabId && tabId !== caller.tabId ? undefined : caller.blockId),
        };
        const execution = ToolOperationContext.getStore();
        if (execution) {
            execution.routingMs = performance.now() - routingStart;
            execution.target = { workspaceId: resolved.workspaceId, tabId: resolved.tabId, blockId: resolved.blockId };
            execution.transport = "electron-rpc";
        }
        if (
            execution?.readOnly &&
            /^(workspace_inventory|list_blocks|list_widgets|block_info|file_)/.test(execution.name)
        ) {
            return withToolRequestContext(resolved, operation);
        }
        const key = resolved.workspaceId ?? resolved.tabId;
        const previous = this.workspaceOperations.get(key) ?? Promise.resolve();
        const pending = previous
            .catch(() => undefined)
            .then(() => {
                if (ToolOperationContext.getStore()?.signal.aborted)
                    throw new ToolFailure("CANCELLED", "Cancelled before target execution");
                return withToolRequestContext(resolved, async () => {
                    const result = await operation();
                    if (result && typeof result === "object" && "content" in result) {
                        return { ...result, _meta: { ...(result as any)._meta, resolvedTarget: execution?.target } };
                    }
                    return result;
                });
            });
        this.workspaceOperations.set(key, pending);
        try {
            return await pending;
        } finally {
            if (this.workspaceOperations.get(key) === pending) this.workspaceOperations.delete(key);
        }
    }

    private async workspaces(): Promise<WorkspaceInfoData[]> {
        if (this.inventoryPending) return this.inventoryPending;
        this.inventoryPending = this.rpc("workspacelist", null) as Promise<WorkspaceInfoData[]>;
        try {
            return await this.inventoryPending;
        } finally {
            this.inventoryPending = undefined;
        }
    }

    async workspaceInventory(): Promise<string> {
        const caller = this.context();
        if (caller.hostMode === "web-fullscreen") return this.workspaceSurfaceSnapshot();
        const inventory = await this.discoverWorkspaces();
        const nativeView = nativeHudViewingContext();
        const nativeWorkspace = inventory.find((workspace) =>
            workspace.tabs.some((tab) => tab.tabId === nativeView?.tabId)
        );
        return json({
            caller: { workspaceId: caller.workspaceId, tabId: caller.tabId },
            userView: {
                workspaceId: nativeWorkspace?.workspaceId ?? windows.focusedWaveWindow?.workspaceId,
                tabId: nativeView?.tabId ?? windows.focusedWaveWindow?.activeTabView?.waveTabId,
                appFocused: Boolean(nativeView) || (windows.focusedWaveWindow?.isFocused() ?? false),
                nativeSurface: nativeView,
                viewEvidence:
                    nativeView || windows.focusedWaveWindow?.isFocused()
                        ? "current-window-focus"
                        : "last-known-window-focus",
            },
            workspaces: inventory,
        });
    }

    async swarmTargets(): Promise<SwarmTarget[]> {
        const context = this.context();
        if (isSwarmScoped(context) || context.hostMode === "web-fullscreen" || !context.workspaceId) return [];
        const blocks = (await this.rpc("blockslist", { workspaceid: context.workspaceId })) as BlocksListEntry[];
        return blocks.flatMap((block) => {
            if (block.tabid !== context.tabId) return [];
            const target = swarmBlockTarget(block);
            return target ? [target] : [];
        });
    }

    private async discoverWorkspaces(): Promise<any[]> {
        if (this.discoveryPending) return this.discoveryPending;
        const request = (async () => {
            const entries = await this.workspaces();
            return Promise.all(
                entries.map(async (entry) => {
                    const workspace = entry.workspacedata;
                    const window = windows.getWaveWindowByWorkspaceId(workspace.oid);
                    const blocks = (await this.rpc("blockslist", { workspaceid: workspace.oid })) as BlocksListEntry[];
                    return {
                        workspaceId: workspace.oid,
                        name: workspace.name,
                        windowId: window?.waveWindowId,
                        activeTabId: window?.activeTabView?.waveTabId ?? workspace.activetabid,
                        windowVisible: window?.isVisible() ?? false,
                        windowFocused: window?.isFocused() ?? false,
                        tabs: workspace.tabids.map((tabId) => {
                            const islands = listNativeHudIslands(tabId);
                            return {
                                tabId,
                                widgets: blocks
                                    .filter((block) => block.tabid === tabId)
                                    .map((block) => {
                                        const island = islands.find((island) => island.blockId === block.blockid);
                                        return {
                                            blockId: block.blockid,
                                            view: block.meta?.view,
                                            title: block.meta?.["frame:title"] ?? block.meta?.["web:title"],
                                            ownerRoute: nativeHudWidgetRoute(tabId, block.blockid),
                                            availability: island
                                                ? "detached"
                                                : window?.allLoadedTabViews.has(tabId)
                                                  ? "mounted"
                                                  : "unmounted",
                                            nativeVisible: island?.visible,
                                            nativeBounds: island?.bounds,
                                            geometry: "Read workspace_snapshot for rendered visibility and bounds",
                                        };
                                    }),
                            };
                        }),
                    };
                })
            );
        })();
        this.discoveryPending = request;
        try {
            return await request;
        } finally {
            this.discoveryPending = undefined;
        }
    }

    private async ensureTabReady(tabId: string): Promise<void> {
        const context = this.context();
        if (context.hostMode === "web-fullscreen") return;
        let window = windows.getWaveWindowByTabId(tabId) ?? windows.getWaveWindowByWorkspaceId(context.workspaceId);
        if (nativeDesktopHudActive(tabId)) {
            if (window?.allLoadedTabViews?.has(tabId)) return;
            throw new ToolFailure(
                "SURFACE_UNAVAILABLE",
                "The assigned HUD tab is not mounted. Select its workspace before controlling its widgets."
            );
        }
        if (!window && context.workspaceId) {
            await windows.createWindowForWorkspace(context.workspaceId);
            window = windows.getWaveWindowByWorkspaceId(context.workspaceId);
        }
        if (!window) throw new ToolFailure("SURFACE_UNAVAILABLE", "No window owns the requested workspace");
        const operation = ToolOperationContext.getStore();
        const foregroundRequired = !operation?.readOnly || operation.name.includes("screenshot");
        if (!foregroundRequired && window.allLoadedTabViews?.has(tabId)) return;
        if (window.activeTabView?.waveTabId !== tabId) await window.setActiveTab(tabId, true);
    }

    constructor(contextProvider: SurfaceContextProvider) {
        super();
        this.contextProvider = contextProvider;
    }

    protected async getSurfaceCapability(): Promise<SurfaceCapability> {
        const context = this.context();
        const token = (await this.rpc("createsurfacetoken", {
            tabid: context.tabId,
            blockid: context.blockId ?? "",
        })) as CommandCreateSurfaceTokenRtnData;
        if (!token?.token || token.tabid !== context.tabId || (token.blockid ?? "") !== (context.blockId ?? "")) {
            throw new Error("KronOS could not issue a capability for the active workspace tab");
        }
        return {
            nativeCallerId: context.nativeCallerId,
            sandboxComputerId: context.sandboxComputerId,
            sandboxComputerMode: context.sandboxComputerMode,
            delegationScope: context.delegationScope,
            token: token.token,
            tabId: token.tabid,
            blockId: token.blockid || undefined,
            workspaceId: context.workspaceId,
            hostMode: context.hostMode,
            capabilities: context.capabilities,
        };
    }

    getDiagnostics(): string {
        const context = resolveToolRequestContext(this.contextProvider);
        const cli = JSON.parse(super.getDiagnostics()) as {
            wshPath: string;
            configuredWsh: string;
            wshReadiness: string;
        };
        return json({
            transport: "electron-typescript",
            persistent: true,
            cliProcessesPerNativeCall: 0,
            cliProcessesPerFallbackCall: 1,
            cliFallbackMethods: [
                "aiAppend",
                "clearBadge",
                "clearTabBackground",
                "connectionConnect",
                "connectionDisconnect",
                "connectionDisconnectAll",
                "connectionStatus",
                "getVariables",
                "notify",
                "removeVariables",
                "runCommand",
                "secretDelete",
                "secretGet",
                "secretList",
                "secretSet",
                "setBadge",
                "setConfig",
                "setTabBackground",
                "setVariables",
            ],
            wshPath: cli.wshPath,
            wshReadiness: cli.wshReadiness,
            configuredWsh: cli.configuredWsh,
            cliAuthentication: "fresh-tab-scoped-token-per-call",
            tabId: context?.tabId ?? null,
            blockId: context?.blockId ?? null,
            workspaceId: context?.workspaceId ?? null,
            hostMode: context?.hostMode ?? "kronterm",
        });
    }

    private context(): HermesSurfaceContext {
        const context = resolveToolRequestContext(this.contextProvider);
        if (!context?.tabId) {
            throw new Error("KronOS surface is not attached to a workspace tab");
        }
        if (!ElectronWshClient) {
            throw new Error("KronOS TypeScript RPC client is not ready");
        }
        return context;
    }

    private tabRoute(): string {
        return `tab:${this.context().tabId}`;
    }

    private blockRoute(targetBlockId: string): string {
        return `feblock:${this.assertBlockScope(targetBlockId)}`;
    }

    private assertBlockScope(targetBlockId: string): string {
        const normalized = blockId(targetBlockId);
        const context = this.context();
        if (isSwarmScoped(context) && normalized !== context.swarmTarget?.blockId)
            throw new ToolFailure("SCOPE_DENIED", "Block is outside the swarm attempt's target grant.");
        if (context.hostMode === "web-fullscreen" && context.blockId && normalized !== blockId(context.blockId)) {
            throw new Error(`Block ${normalized} is outside the active web surface capability`);
        }
        return normalized;
    }

    private async rpc(command: string, data: unknown, route?: string): Promise<unknown> {
        const context = this.context();
        if (isSwarmScoped(context)) {
            const target = context.swarmTarget;
            const input = data as { blockid?: string; oref?: string; meta?: Record<string, string>; action?: string };
            const navigation =
                command === "setmeta" &&
                target?.kind === "browser" &&
                Object.keys(input.meta ?? {}).length === 1 &&
                /^https?:\/\//i.test(input.meta?.url ?? "");
            const focus =
                command === "workspacesurfacecontrol" &&
                input?.action === "focus" &&
                Object.entries(input).every(([key, value]) => key === "action" || key === "blockid" || value == null);
            const id = command === "blockinfo" ? data : navigation ? blockId(input.oref ?? "") : input?.blockid;
            if (!target?.blockId || id !== target.blockId)
                throw new ToolFailure("SCOPE_DENIED", "RPC is outside the swarm attempt's block grant.");
            if (command !== "blockinfo") {
                if (
                    !navigation &&
                    !focus &&
                    !["captureblockscreenshot", "webselector"].includes(command) &&
                    (!command.startsWith("widget") || command.startsWith("widgetclipboard"))
                )
                    throw new ToolFailure("SCOPE_DENIED", "RPC is outside the swarm attempt's operation grant.");
                const info = await this.owner(id);
                const current = swarmBlockTarget({ blockid: id, tabid: info?.tabid, meta: info?.block?.meta });
                if (
                    current?.kind !== target.kind ||
                    info?.tabid !== target.tabId ||
                    info?.workspaceid !== context.workspaceId ||
                    !current.resourceKeys.every((key) => target.resourceKeys.includes(key))
                )
                    throw new ToolFailure("STALE_TARGET", "Swarm block or browser session changed.");
            }
        }
        if (
            ((context.sandboxComputerId && context.sandboxComputerMode !== "hybrid") ||
                context.delegationScope === "widgets") &&
            command.startsWith("widget")
        ) {
            const id = (data as { blockid?: string })?.blockid;
            if (!id) throw new Error("Computer mode requires an explicit widget target.");
            const info = (await this.rpc("blockinfo", id)) as BlockInfoData;
            if (info.block?.meta?.view === "web" && !/^https?:\/\//.test(String(info.block.meta.url || "")))
                throw new Error("Computer mode cannot inspect local-file browser widgets.");
            if (
                info.tabid !== context.tabId ||
                !["web", "kronoscanvas", "sysinfo", "helpview"].includes(info.block?.meta?.view)
            )
                throw new Error(
                    "Computer mode cannot read or write host terminals, files, native apps or agent/settings widgets. Use the sandbox_vm tools for terminal, files and desktop actions."
                );
        }
        const operation = ToolOperationContext.getStore();
        if (operation?.signal.aborted)
            throw new ToolFailure("CANCELLED", "Tool execution was cancelled", false, !operation.readOnly);
        const target =
            (data as { blockid?: string })?.blockid ?? (command === "setblockfocus" ? String(data) : undefined);
        if ((route || command === "controllerinput") && target && operation) {
            const owner =
                context.blockId === target
                    ? { tabid: context.tabId, workspaceid: context.workspaceId }
                    : await this.owner(target);
            if (owner.tabid !== context.tabId)
                throw new ToolFailure("TARGET_MISMATCH", "Routed widget is outside the resolved tab");
        }
        if (
            target &&
            (command.startsWith("widget") || command === "captureblockscreenshot" || command === "webselector")
        )
            route = nativeHudWidgetRoute(context.tabId, target);
        if (route && operation && !route.includes(":island:")) await this.ensureTabReady(context.tabId);
        if (operation?.signal.aborted)
            throw new ToolFailure("CANCELLED", "Tool execution was cancelled", false, !operation.readOnly);
        const options: RpcOpts & { signal?: AbortSignal; waitForCancelAck?: boolean } = route ? { route } : {};
        if (operation) {
            options.timeout = Math.max(1, operation.deadline - Date.now());
            // A dispatched write still owns the target until its remote response arrives.
            if (!operation.tracksSettlement || operation.readOnly) options.signal = operation.signal;
            options.waitForCancelAck = operation.tracksSettlement && command === "widgetwaitcondition";
        }
        const rpcStart = performance.now();
        let result: any;
        try {
            result = await ElectronWshClient.wshRpcCall(command, data, options);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const staleRoute = /(?:no route for|route.*(?:not found|unavailable|disconnected))/i.test(message);
            if (operation)
                operation.failure = {
                    code: staleRoute
                        ? "STALE_ROUTE"
                        : /timeout|EC-TIME/i.test(message)
                          ? "DEADLINE_EXCEEDED"
                          : "TRANSPORT_FAILED",
                    retryable: operation.readOnly && staleRoute,
                    uncertain: !operation.readOnly && !staleRoute,
                };
            if (!operation?.readOnly || operation.attempts > 0 || !route || !staleRoute) throw error;
            operation.attempts++;
            const recoveryRoute = target ? nativeHudWidgetRoute(context.tabId, target) : this.tabRoute();
            if (recoveryRoute.includes(":island:")) throw error;
            await this.ensureTabReady(context.tabId);
            options.route = recoveryRoute;
            if (operation.signal.aborted) throw new ToolFailure("CANCELLED", "Cancelled during route recovery");
            options.timeout = Math.max(1, operation.deadline - Date.now());
            result = await ElectronWshClient.wshRpcCall(command, data, options);
            operation.failure = undefined;
        }
        if (operation) operation.rpcMs = (operation.rpcMs ?? 0) + performance.now() - rpcStart;
        let parsed = result;
        if (typeof result === "string") {
            try {
                parsed = JSON.parse(result);
            } catch {}
        }
        if (operation && (parsed?.presentation || parsed?.snapshot?.presentation))
            operation.presentation = parsed.presentation ?? parsed.snapshot.presentation;
        if (parsed?.success === false || parsed?.met === false || parsed?.error)
            throw new ToolFailure("ACTION_FAILED", String(parsed.error ?? parsed.message ?? "Action failed"));
        return result;
    }

    async organizeWorkspace(input: {
        action: "create" | "rename";
        workspaceId?: string;
        name: string;
    }): Promise<string> {
        const name = input.name.trim();
        if (!name || name.length > 80) throw new Error("Workspace name must contain 1 to 80 characters");
        if (input.action === "create") {
            const id = await WorkspaceService.CreateWorkspace(name, "", "", true);
            return json({ workspaceId: id, name });
        }
        const workspace = (await this.workspaces()).find(
            (entry) => entry.workspacedata.oid === input.workspaceId
        )?.workspacedata;
        if (!workspace) throw new ToolFailure("TARGET_CLOSED", "Workspace no longer exists");
        await WorkspaceService.UpdateWorkspace(workspace.oid, name, workspace.icon, workspace.color, false);
        return json({ workspaceId: workspace.oid, name });
    }

    async getWorkspaceInfo(): Promise<string> {
        return json(await this.rpc("workspacelist", null));
    }

    async workspaceSurfaceSnapshot(): Promise<string> {
        return String(await this.rpc("workspacesurfacesnapshot", null, this.tabRoute()));
    }

    async workspaceSurfaceScreenshot(): Promise<string> {
        return String(await this.rpc("workspacesurfacescreenshot", null, this.tabRoute()));
    }

    async workspaceSurfaceControl(input: WorkspaceSurfaceControl): Promise<string> {
        validateWorkspaceSurfaceControl(input);
        if (input.targetBlockId && ToolOperationContext.getStore()) {
            const owner = await this.owner(input.targetBlockId);
            if (owner.tabid !== this.context().tabId)
                throw new ToolFailure("TARGET_MISMATCH", "Destination widget belongs to another tab");
        }
        const data = {
            action: input.action,
            presentation: input.presentation,
            blockid: input.blockId ? this.assertBlockScope(input.blockId) : undefined,
            targetblockid: input.targetBlockId ? this.assertBlockScope(input.targetBlockId) : undefined,
            index: input.index,
            position: input.position,
            direction: input.direction,
            size: input.size,
            x: input.x,
            y: input.y,
            width: input.width,
            height: input.height,
            objectid: input.objectId,
            fromobjectid: input.fromObjectId,
            toobjectid: input.toObjectId,
            text: input.text,
            color: input.color,
            side: input.side,
            view: input.view,
            appid: input.appId,
            appname: input.appName,
            file: input.file,
            workspaceid: input.workspaceId,
        };
        return String(await this.rpc("workspacesurfacecontrol", data, this.tabRoute()));
    }

    async hudListIslands(): Promise<string> {
        const snapshot = JSON.parse(await this.workspaceSurfaceSnapshot());
        const islands = new Map(listNativeHudIslands(this.context().tabId).map((island) => [island.blockId, island]));
        return json(
            (snapshot.blocks ?? [])
                .filter((block) => !["hermes", "waveai", "ai"].includes(block.view))
                .map((block) => {
                    const island = islands.get(block.blockid);
                    return {
                        blockId: block.blockid,
                        view: block.view,
                        title: block.title,
                        location: block.location,
                        focused: block.focused,
                        selected: block.hudselected,
                        hudVisible: block.hudvisible,
                        workspaceVisible: block.visible,
                        availability: block.availability,
                        ownerRoute: nativeHudWidgetRoute(this.context().tabId, block.blockid),
                        detached: !!island,
                        ...(island ? { bounds: island.bounds, nativeVisible: island.visible } : {}),
                    };
                })
        );
    }

    async hudOpenIsland(
        app: "browser" | "files" | "terminal" | "widget" | "editor" | "diff" | "sandbox",
        url?: string,
        options: { file?: string; chatId?: string; toolCallId?: string } = {}
    ): Promise<string> {
        if (url && app !== "browser") throw new Error("url is supported only for browser islands");
        const result = String(
            await this.rpc(
                "workspacesurfacecontrol",
                {
                    action: "hud.launch",
                    view: app === "browser" ? "web" : app,
                    text: JSON.stringify({ ...options, ...(url ? { url: normalizeBrowserUrl(url) } : {}) }),
                },
                this.tabRoute()
            )
        );
        const parsed = JSON.parse(result);
        if (!parsed.success) throw new Error(parsed.message || parsed.error || "HUD launch failed");
        return json({ ...parsed, app, islands: listNativeHudIslands(this.context().tabId) });
    }

    async hudFocusIsland(targetBlockId: string): Promise<string> {
        const blockId = this.assertBlockScope(targetBlockId);
        if (!focusNativeHudIsland(this.context().tabId, blockId)) throw new Error(`HUD island ${blockId} not found`);
        return json(listNativeHudIslands(this.context().tabId));
    }

    async hudMoveIsland(targetBlockId: string, x: number, y: number): Promise<string> {
        const blockId = this.assertBlockScope(targetBlockId);
        if (!setNativeHudIslandBounds(this.context().tabId, blockId, { x, y })) {
            throw new Error(`HUD island ${blockId} not found`);
        }
        return json(listNativeHudIslands(this.context().tabId));
    }

    async hudResizeIsland(targetBlockId: string, width: number, height: number): Promise<string> {
        const blockId = this.assertBlockScope(targetBlockId);
        if (!setNativeHudIslandBounds(this.context().tabId, blockId, { width, height })) {
            throw new Error(`HUD island ${blockId} not found`);
        }
        return json(listNativeHudIslands(this.context().tabId));
    }

    async hudArrangeIslands(layout: NativeHudIslandLayout): Promise<string> {
        if (!arrangeNativeHudIslands(this.context().tabId, layout)) throw new Error("No HUD islands are open");
        return json(listNativeHudIslands(this.context().tabId));
    }

    async hudCloseIsland(targetBlockId: string): Promise<string> {
        const blockId = this.assertBlockScope(targetBlockId);
        if (!closeNativeHudIsland(this.context().tabId, blockId)) throw new Error(`HUD island ${blockId} not found`);
        await this.rpc("deleteblock", { blockid: blockId });
        return `closed HUD island block:${blockId}`;
    }

    async workflowCommand(command: import("../frontend/types/workflow").WorkflowCommand): Promise<string> {
        if (command.action === "permission")
            throw new Error("Workflow permissions require an explicit decision in the desktop or HUD UI");
        const { workflowCommand } = await import("./workflow-runtime");
        return json(await workflowCommand(command));
    }

    async desktopWindowAction(input: import("./desktop-tiling").DesktopWindowAction): Promise<string> {
        const { nativeDesktopHudActive } = await import("./emain-hud");
        if (!nativeDesktopHudActive(this.context().tabId))
            throw new Error(
                "Native tiling is available only in Coucou desktop HUD mode. Use os.* actions for OS widgets."
            );
        const { desktopTiling } = await import("./desktop-tiling");
        return json(await desktopTiling.perform(input, [process.pid]));
    }
    async desktopAnnotation(input: unknown): Promise<string> {
        const { desktopAnnotations } = await import("./emain-overlay");
        return json(desktopAnnotations.command(input));
    }

    async withWorkflowRun<T>(name: string, args: Record<string, unknown>, operation: () => Promise<T>): Promise<T> {
        const context = resolveToolRequestContext(this.contextProvider);
        if (!context?.workflowRunId) {
            if (/^(kron_computer_|linux_desktop_)/.test(name)) {
                const { workflowStore } = await import("./workflow-runtime");
                const owner = workflowStore().controlOwner(
                    name.startsWith("kron_computer_") ? "native" : "vm",
                    String(args.desktopId ?? "")
                );
                if (owner)
                    throw new ToolFailure(
                        "SCOPE_DENIED",
                        "A workflow owns this computer; pause or take over before controlling it"
                    );
            }
            return operation();
        }
        if (name.startsWith("kron_computer_background_workspace_"))
            throw new ToolFailure(
                "SCOPE_DENIED",
                "Native background workspace sessions are not bound to workflow capabilities; use the desktop agent outside a workflow"
            );
        const { workflowStore } = await import("./workflow-runtime");
        const run = workflowStore().get(context.workflowRunId);
        if (run.status !== "running") throw new ToolFailure("CANCELLED", "Workflow is paused or no longer running");
        if (/^(workflow_|acp_run_agent|workspace_switch|workspace_organize|hud_set_mode)/.test(name))
            throw new ToolFailure("SCOPE_DENIED", "Specialists cannot change workflow or viewing context");
        if (
            (args.targetWorkspaceId && args.targetWorkspaceId !== run.target.workspaceId) ||
            (args.targetTabId && args.targetTabId !== run.target.tabId) ||
            (args.tabId && args.tabId !== run.target.tabId) ||
            (args.workspaceId && args.workspaceId !== run.target.workspaceId) ||
            (typeof args.blockId === "string" && !run.target.blockIds.includes(blockId(args.blockId)))
        )
            throw new ToolFailure("SCOPE_DENIED", "Tool target is outside the bound workflow");
        if (
            name.startsWith("kron_computer_") &&
            (run.target.environment !== "native" || (args.app != null && args.app !== run.target.computerId))
        )
            throw new ToolFailure("SCOPE_DENIED", "Native computer control is not assigned to this workflow");
        if (
            name.startsWith("linux_desktop_") &&
            (run.target.environment !== "vm" || (args.desktopId != null && args.desktopId !== run.target.computerId))
        )
            throw new ToolFailure("SCOPE_DENIED", "VM is outside the bound workflow");
        return operation();
    }

    async acpListAgents(): Promise<string> {
        const { detectInstalledAgents } = await import("./acp/acp-connector");
        const agents = (await detectInstalledAgents())
            .filter((agent) => agent.available && agent.backend !== "hermes")
            .map((agent) => ({
                backend: agent.backend,
                name: agent.name,
                description: agent.description,
                supportsStreaming: agent.supportsStreaming,
                skillsDirs: agent.skillsDirs,
            }));
        return json({
            preferred: agents.some((agent) => agent.backend === "kronoscode") ? "kronoscode" : null,
            agents,
        });
    }

    async acpRunAgent(
        backend = "kronoscode",
        task: string,
        timeoutSeconds = 180,
        options: {
            workspace?: string;
            signal?: AbortSignal;
            onPermission?: (confirmation: any) => Promise<string>;
            onTool?: (event: { type: string; data?: unknown }) => void;
        } = {}
    ): Promise<string> {
        const signal = options.signal ?? ToolOperationContext.getStore()?.signal;
        if (signal?.aborted) throw new Error("ACP delegation cancelled (caller stopped or workflow paused)");
        if (this.acpDelegationActive) {
            throw new Error("An ACP specialist is already active; nested or concurrent ACP delegation is not allowed");
        }
        const context = this.context();
        const timeoutMs = timeoutSeconds * 1000;
        let deadlineTimer: NodeJS.Timeout | undefined;
        let interruption: Error | undefined;
        let manager: import("./acp/acp-agent-manager").AcpAgentManager | undefined;
        let onEvent: ((event: { type: string; data?: unknown }) => void) | undefined;
        let rejectAgentFailure: ((error: Error) => void) | undefined;
        let rejectInterruption: (error: Error) => void;
        const interrupted = new Promise<never>((_, reject) => {
            rejectInterruption = reject;
        });
        const interrupt = (error: Error) => {
            interruption ??= error;
            rejectInterruption(interruption);
        };
        const onAbort = () => interrupt(new Error("ACP delegation cancelled (caller stopped or workflow paused)"));
        signal?.addEventListener("abort", onAbort, { once: true });
        deadlineTimer = setTimeout(
            () => interrupt(new Error(`ACP specialist timed out after ${timeoutSeconds} seconds`)),
            timeoutMs
        );
        this.acpDelegationActive = true;
        try {
            const operation = (async () => {
                const [{ AcpAgentManager }, { detectInstalledAgents }] = await Promise.all([
                    import("./acp/acp-agent-manager"),
                    import("./acp/acp-connector"),
                ]);
                if (interruption) throw interruption;
                const agents = await detectInstalledAgents(backend);
                if (interruption) throw interruption;
                const agent = agents.find((candidate) => candidate.backend === backend && candidate.available);
                if (!agent || backend === "hermes") {
                    throw new Error(`ACP specialist ${backend} is not installed or is unavailable`);
                }

                let surfaceContext = {
                    tabId: context.tabId,
                    blockId: context.blockId,
                    workspaceId: context.workspaceId,
                    workflowRunId: context.workflowRunId,
                };
                let customArgs: string[] | undefined = agent.acpArgs;
                let customEnv: Record<string, string> | undefined;
                if (backend === "kronoscode") {
                    const { KronosCodeRuntime, isKronosCodeLoopbackUrl, withKronosCodeAttachArgs } =
                        await import("./kronoscode-runtime");
                    const connection = await KronosCodeRuntime.revalidate();
                    const internal = KronosCodeRuntime.getInternalConnection();
                    surfaceContext = isKronosCodeLoopbackUrl(connection.baseUrl) ? surfaceContext : undefined;
                    customArgs = withKronosCodeAttachArgs(agent.acpArgs, connection.baseUrl);
                    customEnv = {
                        KRONOSCODE_SERVER_USERNAME: internal?.username ?? "kronoscode",
                        ...(internal?.password ? { KRONOSCODE_SERVER_PASSWORD: internal.password } : {}),
                    };
                }
                if (interruption) throw interruption;

                const conversationId = `hermes-acp-${randomUUID()}`;
                const managerOptions = {
                    conversationId,
                    backend,
                    cliPath: agent.cliPath,
                    workspace: options.workspace || process.env.KRONTERM_WORKSPACE || process.cwd(),
                    surfaceContext,
                    disableBuiltInSurface: !surfaceContext?.tabId,
                    maxReconnectAttempts: 0,
                    customArgs,
                    customEnv,
                };
                manager = new AcpAgentManager(managerOptions);
                const answer: string[] = [];
                const rejectedPermissions: string[] = [];
                const agentFailure = new Promise<never>((_, reject) => {
                    rejectAgentFailure = reject;
                });
                agentFailure.catch(() => undefined);
                onEvent = (event: { type: string; data?: unknown }) => {
                    // Delegated specialists drive the same surfaces; show their cursor and task cards too.
                    try {
                        notifyDesktopPetActivity(event as import("./acp").AcpEvent);
                    } catch (error) {
                        console.warn("[kronterm-tools] delegated activity publish failed", error);
                    }
                    if (event.type === "agent_message_chunk") {
                        const text = (event.data as { text?: unknown } | undefined)?.text;
                        if (typeof text === "string") answer.push(text);
                        return;
                    }
                    if (event.type === "tool_call" || event.type === "tool_call_update") {
                        try {
                            options.onTool?.(event);
                        } catch (error) {
                            rejectAgentFailure(error instanceof Error ? error : new Error(String(error)));
                        }
                        return;
                    }
                    if (event.type === "error") {
                        const message = (event.data as { error?: unknown } | undefined)?.error;
                        rejectAgentFailure(new Error(typeof message === "string" ? message : "ACP specialist failed"));
                        return;
                    }
                    if (event.type !== "tool_permission") return;
                    const confirmation = (event.data as { confirmation?: any } | undefined)?.confirmation;
                    const rejected = confirmation?.options?.find(
                        (option: { kind?: string }) => option.kind === "reject_once" || option.kind === "reject_always"
                    );
                    if (!confirmation?.callId) return;
                    if (options.onPermission) {
                        void options
                            .onPermission(confirmation)
                            .then(
                                (optionId) =>
                                    !interruption &&
                                    manager?.confirmTool({
                                        conversationId,
                                        msgId: confirmation.msgId,
                                        callId: confirmation.callId,
                                        optionId,
                                    })
                            )
                            .catch((error) => rejectAgentFailure?.(error));
                        return;
                    }
                    if (!rejected?.optionId) {
                        rejectAgentFailure(new Error("ACP specialist requested approval without a reject option"));
                        return;
                    }
                    rejectedPermissions.push(String(confirmation.title || "approval-required action"));
                    void manager
                        ?.confirmTool({
                            conversationId,
                            msgId: confirmation.msgId,
                            callId: confirmation.callId,
                            optionId: rejected.optionId,
                        })
                        .catch((error) => rejectAgentFailure?.(error));
                };
                manager.on("event", onEvent);
                await Promise.race([manager.initialize(managerOptions), agentFailure]);
                if (interruption) throw interruption;
                const stopReason = await Promise.race([
                    manager.sendMessage({ conversationId, content: task }),
                    agentFailure,
                ]);
                if (interruption) throw interruption;
                if (stopReason != null && stopReason !== "end_turn") {
                    throw new Error(
                        `ACP specialist stopped before finishing (${stopReason}). Inspect the target for partial changes before retrying.`
                    );
                }
                const response = answer.join("").trim();
                if (!response && rejectedPermissions.length === 0) {
                    throw new Error(
                        `ACP specialist ${backend} completed without an answer. Check its model/provider configuration and runtime logs.`
                    );
                }
                return json({
                    backend,
                    name: agent.name,
                    answer: response,
                    rejectedPermissions,
                    sessionId: manager.sessionId,
                    toolAccess: manager.hasSurfaceMcp ? "tab-scoped-kronterm-mcp" : "none",
                });
            })();
            return await Promise.race([operation, interrupted]);
        } finally {
            signal?.removeEventListener("abort", onAbort);
            clearTimeout(deadlineTimer);
            interruption ??= new Error("ACP specialist stopped");
            rejectAgentFailure?.(new Error("ACP specialist stopped"));
            if (manager && onEvent) manager.off("event", onEvent);
            await manager?.stop().catch(() => undefined);
            this.acpDelegationActive = false;
        }
    }

    async listWidgets(): Promise<string> {
        const config = (await this.rpc("getfullconfig", null)) as FullConfigType;
        return json({ widgets: config.widgets, defaultwidgets: config.defaultwidgets });
    }

    async launchWidget(widgetKey: string, magnified?: boolean): Promise<string> {
        const config = (await this.rpc("getfullconfig", null)) as FullConfigType;
        const widget = config.widgets?.[widgetKey] ?? config.defaultwidgets?.[widgetKey];
        if (!widget) throw new ToolFailure("WIDGET_NOT_FOUND", `Widget ${widgetKey} is not configured`);
        const result = await this.rpc("createblock", {
            tabid: this.context().tabId,
            blockdef: widget.blockdef,
            magnified: Boolean(magnified || widget.magnified),
            focused: true,
        });
        return `launched widget ${widgetKey}: ${String(result)}`;
    }

    async listBlocks(tabId?: string, _json = false): Promise<string> {
        const context = this.context();
        const selectedTabId = tabId ?? context.tabId;
        if (context.hostMode === "web-fullscreen" && selectedTabId !== context.tabId)
            throw new ToolFailure("SCOPE_DENIED", "Tab is outside the active web surface capability");
        let workspaceId = context.workspaceId;
        if (!workspaceId || selectedTabId !== context.tabId) {
            const entries = await this.workspaces();
            workspaceId = entries.find((entry) => entry.workspacedata.tabids.includes(selectedTabId))?.workspacedata
                .oid;
            if (!workspaceId) throw new ToolFailure("TARGET_CLOSED", "Requested tab no longer belongs to a workspace");
        }
        const entries = (await this.rpc("blockslist", { workspaceid: workspaceId })) as
            Array<Record<string, unknown>> | undefined;
        const blocks = (entries ?? [])
            .filter((entry) => !selectedTabId || entry.tabid === selectedTabId)
            .map((entry) => ({
                ...entry,
                view:
                    typeof entry.meta === "object" && entry.meta != null
                        ? (entry.meta as Record<string, unknown>).view
                        : undefined,
            }));
        return json(blocks);
    }

    async getBlockInfo(targetBlockId: string): Promise<string> {
        return json(await this.rpc("blockinfo", this.assertBlockScope(targetBlockId)));
    }

    async getBlockContent(targetBlockId?: string): Promise<string> {
        const target = this.assertBlockScope(
            targetBlockId && targetBlockId !== "this" ? targetBlockId : (this.context().blockId ?? "")
        );
        if (!target) {
            throw new Error("A block ID is required to read block content");
        }
        return json(await this.rpc("getblockcontent", target));
    }

    async closeBlock(targetBlockId: string): Promise<string> {
        const target = this.assertBlockScope(targetBlockId);
        await this.rpc("deleteblock", { blockid: target });
        return "block deleted";
    }

    async focusBlock(targetBlockId: string): Promise<string> {
        const target = this.assertBlockScope(targetBlockId);
        await this.workspaceSurfaceControl({ action: "focus", blockId: target });
        return `focused block:${target}`;
    }

    async createBlock(
        view: string,
        meta: Record<string, string> = {},
        magnified?: boolean,
        ephemeral?: boolean
    ): Promise<string> {
        const context = this.context();
        const result = await this.rpc("createblock", {
            tabid: context.tabId,
            blockdef: { meta: { ...meta, view } },
            magnified: Boolean(magnified),
            ephemeral: Boolean(ephemeral),
            focused: true,
        });
        return `block created: ${String(result)}`;
    }

    async setBlockMeta(targetBlockId: string, meta: Record<string, string>): Promise<string> {
        const target = this.assertBlockScope(targetBlockId);
        await this.rpc("setmeta", { oref: `block:${target}`, meta });
        return `updated block:${target}`;
    }

    async openTerminal(cwd?: string, magnified?: boolean, newSurface = false): Promise<string> {
        return this.serializeTerminalOpen(this.context().tabId, async () => {
            if (!newSurface) {
                const existing = reusableTerminal(JSON.parse(await this.listBlocks()), cwd);
                if (existing) {
                    await this.focusBlock(existing);
                    return `reused block block:${existing}; inspect terminal_scrollback before sending input`;
                }
            }
            return this.createBlock("term", { controller: "shell", ...(cwd ? { "cmd:cwd": cwd } : {}) }, magnified);
        });
    }

    async terminalScrollback(targetBlockId: string, start = 0, end = 0, lastCommand = false): Promise<string> {
        const result = (await this.rpc(
            "termgetscrollbacklines",
            { linestart: start, lineend: end, lastcommand: lastCommand },
            this.blockRoute(targetBlockId)
        )) as { lines?: string[] };
        return result.lines?.join("\n") ?? "";
    }

    async terminalInput(targetBlockId: string, text: string, submit?: boolean): Promise<string> {
        const target = this.assertBlockScope(targetBlockId);
        await this.rpc(
            "controllerinput",
            { blockid: target, inputdata64: Buffer.from(`${text}${submit ? "\n" : ""}`).toString("base64") }
        );
        return "terminal input sent";
    }

    async openWeb(url: string, magnified?: boolean, newSurface = false): Promise<string> {
        const normalizedUrl = normalizeBrowserUrl(url);
        if (!newSurface && !magnified) {
            const blocks = JSON.parse(await this.listBlocks()) as Array<Record<string, any>>;
            const existing =
                blocks.find((entry) => entry.view === "web" && entry.focused) ??
                blocks.find((entry) => entry.view === "web");
            const existingId = existing?.blockid ?? existing?.blockId;
            if (typeof existingId === "string" && existingId) {
                await this.navigateWeb(existingId, normalizedUrl);
                await this.focusBlock(existingId);
                return `reused block block:${existingId}`;
            }
        }
        return this.createBlock("web", { url: normalizedUrl }, magnified);
    }

    async navigateWeb(targetBlockId: string, url: string): Promise<string> {
        const normalizedUrl = normalizeBrowserUrl(url);
        await this.setBlockMeta(targetBlockId, { url: normalizedUrl });
        return `navigated browser block:${this.assertBlockScope(targetBlockId)} to ${normalizedUrl}`;
    }

    async openWebTab(url: string, targetBlockId?: string): Promise<string> {
        if (targetBlockId) {
            await this.navigateWeb(targetBlockId, url);
            await this.focusBlock(targetBlockId);
            return `navigated browser block:${this.assertBlockScope(targetBlockId)} to ${normalizeBrowserUrl(url)}`;
        }
        return this.openWeb(url);
    }

    async browserGetHtml(targetBlockId: string, selector: string, inner?: boolean, all?: boolean): Promise<string> {
        const context = this.context();
        return json(
            await this.rpc(
                "webselector",
                {
                    workspaceid: context.workspaceId ?? "",
                    blockid: this.assertBlockScope(targetBlockId),
                    tabid: context.tabId,
                    selector,
                    opts: { inner: Boolean(inner), all: Boolean(all) },
                },
                this.tabRoute()
            )
        );
    }

    async openPath(filePath: string, edit?: boolean, magnified?: boolean): Promise<string> {
        const absolutePath = path.resolve(filePath);
        return this.createBlock("preview", { file: absolutePath, ...(edit ? { edit: "true" } : {}) }, magnified);
    }

    async fileList(filePath = "."): Promise<string> {
        return json((await this.rpc("filelist", { path: filePath, opts: {} })) ?? []);
    }

    async fileRead(filePath: string): Promise<string> {
        const result = (await this.rpc("fileread", { info: { path: filePath } })) as FileData;
        if (result?.info?.notfound) throw new Error(`File not found: ${filePath}`);
        if (result?.info?.isdir) throw new Error(`Path is a directory; use file_list: ${filePath}`);
        if (typeof result?.data64 !== "string") {
            if (result?.info?.size === 0) return "";
            throw new Error(`File read returned no content: ${filePath}`);
        }
        return Buffer.from(result.data64, "base64").toString("utf8");
    }

    async fileInfo(filePath: string): Promise<string> {
        const result = (await this.rpc("fileinfo", { info: { path: filePath } })) as FileInfo;
        if (result?.notfound) throw new Error(`File not found: ${filePath}`);
        if (!result) throw new Error(`File metadata unavailable: ${filePath}`);
        return json(result);
    }

    async lspQuery(
        filePath: string,
        language: string,
        query: string,
        line = 0,
        character = 0,
        maxResults = 100
    ): Promise<string> {
        const result = (await this.rpc("lspquery", {
            workspacepath: process.cwd(),
            filepath: filePath,
            language,
            query,
            line,
            character,
            maxresults: maxResults,
        })) as { resultjson?: unknown; truncated?: unknown };
        return typeof result.resultjson === "string" ? result.resultjson : json(result);
    }

    async canvasLoad(workspaceId: string, targetBlockId: string): Promise<string> {
        return json(
            await this.rpc("canvasload", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
            })
        );
    }

    async canvasSnapshot(workspaceId: string, targetBlockId: string, includeContent?: boolean): Promise<string> {
        return json(
            await this.rpc("canvassnapshot", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
                includecontent: Boolean(includeContent),
            })
        );
    }

    async canvasSave(workspaceId: string, targetBlockId: string, document: Record<string, unknown>): Promise<string> {
        await this.rpc("canvassave", {
            workspaceid: workspaceId,
            blockid: this.assertBlockScope(targetBlockId),
            document,
        });
        return "canvas saved";
    }

    async canvasCreateNode(workspaceId: string, targetBlockId: string, node: Record<string, unknown>): Promise<string> {
        return json(
            await this.rpc("canvascreatenode", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
                node,
            })
        );
    }

    async canvasUpdateNode(workspaceId: string, targetBlockId: string, node: Record<string, unknown>): Promise<string> {
        return json(
            await this.rpc("canvasupdatenode", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
                node,
            })
        );
    }

    async canvasDeleteNode(workspaceId: string, targetBlockId: string, nodeId: string): Promise<string> {
        await this.rpc("canvasdeletenode", {
            workspaceid: workspaceId,
            blockid: this.assertBlockScope(targetBlockId),
            nodeid: nodeId,
        });
        return `deleted canvas node ${nodeId}`;
    }

    async canvasConnectNodes(
        workspaceId: string,
        targetBlockId: string,
        fromNode: string,
        toNode: string,
        label?: string
    ): Promise<string> {
        return json(
            await this.rpc("canvasconnectnodes", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
                fromnode: fromNode,
                tonode: toNode,
                label,
            })
        );
    }

    async canvasLaunchNode(workspaceId: string, targetBlockId: string, nodeId: string, tabId: string): Promise<string> {
        return json(
            await this.rpc("canvaslaunchnode", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
                nodeid: nodeId,
                tabid: tabId,
            })
        );
    }

    async canvasUploadAsset(
        workspaceId: string,
        targetBlockId: string,
        filePath: string,
        mimeType = "application/octet-stream"
    ): Promise<string> {
        const data64 = await fs.promises.readFile(filePath, { encoding: "base64" });
        return json(
            await this.rpc("canvasassetupload", {
                workspaceid: workspaceId,
                blockid: this.assertBlockScope(targetBlockId),
                filename: path.basename(filePath),
                mimetype: mimeType,
                data64,
            })
        );
    }

    async widgetSnapshot(targetBlockId: string): Promise<string> {
        const blockid = this.assertBlockScope(targetBlockId);
        const snapshot = await this.rpc("widgetsnapshot", { blockid }, this.tabRoute());
        const screenshot = await this.widgetScreenshot(blockid);
        return json({ ...(snapshot as Record<string, unknown>), screenshot });
    }

    async widgetFind(
        targetBlockId: string,
        role?: string,
        name?: string,
        value?: string,
        text?: string,
        maxCount?: number
    ): Promise<string> {
        return json(
            await this.rpc(
                "widgetfind",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    role,
                    name,
                    value,
                    text,
                    maxcount: maxCount,
                },
                this.tabRoute()
            )
        );
    }

    async widgetInspect(targetBlockId: string, elementRef: string): Promise<string> {
        return json(
            await this.rpc(
                "widgetinspect",
                { blockid: this.assertBlockScope(targetBlockId), elementref: this.normalizeElementRef(elementRef) },
                this.tabRoute()
            )
        );
    }

    async widgetElementAt(targetBlockId: string, x: number, y: number): Promise<string> {
        return json(
            await this.rpc("widgetelementat", { blockid: this.assertBlockScope(targetBlockId), x, y }, this.tabRoute())
        );
    }

    async widgetScreenshot(targetBlockId: string): Promise<string> {
        return String(
            await this.rpc("captureblockscreenshot", { blockid: this.assertBlockScope(targetBlockId) }, this.tabRoute())
        );
    }

    async widgetScreenshotAnnotated(targetBlockId: string, showElements = true): Promise<string> {
        return json(
            await this.rpc(
                "widgetscreenshotannotated",
                { blockid: this.assertBlockScope(targetBlockId), showelements: showElements },
                this.tabRoute()
            )
        );
    }

    async widgetClick(
        targetBlockId: string,
        elementRef?: string,
        x?: number,
        y?: number,
        button?: string,
        clickType?: string
    ): Promise<string> {
        return json(
            await this.rpc(
                "widgetclick",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    elementref: elementRef ? this.normalizeElementRef(elementRef) : undefined,
                    x,
                    y,
                    button,
                    clicktype: clickType,
                },
                this.tabRoute()
            )
        );
    }

    async widgetHover(targetBlockId: string, elementRef?: string, x?: number, y?: number): Promise<string> {
        return json(
            await this.rpc(
                "widgethover",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    elementref: elementRef ? this.normalizeElementRef(elementRef) : undefined,
                    x,
                    y,
                },
                this.tabRoute()
            )
        );
    }

    async widgetMouseMove(targetBlockId: string, elementRef?: string, x?: number, y?: number): Promise<string> {
        return this.widgetHover(targetBlockId, elementRef, x, y);
    }

    async widgetType(targetBlockId: string, text: string, delayMs = 0): Promise<string> {
        return json(
            await this.rpc(
                "widgetkeyboardtype",
                { blockid: this.assertBlockScope(targetBlockId), text, delayms: delayMs },
                this.tabRoute()
            )
        );
    }

    async widgetPress(targetBlockId: string, keys: string[]): Promise<string> {
        return json(
            await this.rpc(
                "widgetkeyboardpress",
                { blockid: this.assertBlockScope(targetBlockId), keys },
                this.tabRoute()
            )
        );
    }

    async widgetScroll(targetBlockId: string, amount: number, originX?: number, originY?: number): Promise<string> {
        return json(
            await this.rpc(
                "widgetmousescroll",
                { blockid: this.assertBlockScope(targetBlockId), amount, originx: originX, originy: originY },
                this.tabRoute()
            )
        );
    }

    async widgetScrollTo(targetBlockId: string, elementRef?: string, x?: number, y?: number): Promise<string> {
        return json(
            await this.rpc(
                "widgetscrollto",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    elementref: elementRef ? this.normalizeElementRef(elementRef) : undefined,
                    x,
                    y,
                },
                this.tabRoute()
            )
        );
    }

    async widgetDrag(
        targetBlockId: string,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        button = "left"
    ): Promise<string> {
        return json(
            await this.rpc(
                "widgetdrag",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    startx: startX,
                    starty: startY,
                    endx: endX,
                    endy: endY,
                    button,
                },
                this.tabRoute()
            )
        );
    }

    async widgetLongPress(
        targetBlockId: string,
        elementRef?: string,
        x?: number,
        y?: number,
        duration?: number
    ): Promise<string> {
        return json(
            await this.rpc(
                "widgetlongpress",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    elementref: elementRef ? this.normalizeElementRef(elementRef) : undefined,
                    x,
                    y,
                    duration,
                },
                this.tabRoute()
            )
        );
    }

    async widgetGetValue(targetBlockId: string, elementRef: string): Promise<string> {
        return json(
            await this.rpc(
                "widgetgetvalue",
                { blockid: this.assertBlockScope(targetBlockId), elementref: this.normalizeElementRef(elementRef) },
                this.tabRoute()
            )
        );
    }

    async widgetSetValue(targetBlockId: string, elementRef: string, value: string): Promise<string> {
        return json(
            await this.rpc(
                "widgetsetvalue",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    elementref: this.normalizeElementRef(elementRef),
                    value,
                },
                this.tabRoute()
            )
        );
    }

    async widgetClear(targetBlockId: string, elementRef: string): Promise<string> {
        return json(
            await this.rpc(
                "widgetclear",
                { blockid: this.assertBlockScope(targetBlockId), elementref: this.normalizeElementRef(elementRef) },
                this.tabRoute()
            )
        );
    }

    async widgetSelect(targetBlockId: string, elementRef: string, option: string): Promise<string> {
        return json(
            await this.rpc(
                "widgetselect",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    elementref: this.normalizeElementRef(elementRef),
                    option,
                },
                this.tabRoute()
            )
        );
    }

    async widgetToggle(targetBlockId: string, elementRef: string): Promise<string> {
        return json(
            await this.rpc(
                "widgettoggle",
                { blockid: this.assertBlockScope(targetBlockId), elementref: this.normalizeElementRef(elementRef) },
                this.tabRoute()
            )
        );
    }

    async widgetWaitFor(
        targetBlockId: string,
        condition: string,
        elementRef?: string,
        timeoutMs = 10_000
    ): Promise<string> {
        return json(
            await this.rpc(
                "widgetwaitcondition",
                {
                    blockid: this.assertBlockScope(targetBlockId),
                    condition,
                    elementref: elementRef ? this.normalizeElementRef(elementRef) : undefined,
                    timeoutms: timeoutMs,
                },
                this.tabRoute()
            )
        );
    }

    async widgetGetState(targetBlockId: string): Promise<string> {
        return json(
            await this.rpc("widgetgetstate", { blockid: this.assertBlockScope(targetBlockId) }, this.tabRoute())
        );
    }

    async widgetClipboardGet(targetBlockId: string): Promise<string> {
        return json(
            await this.rpc("widgetclipboardget", { blockid: this.assertBlockScope(targetBlockId) }, this.tabRoute())
        );
    }

    async widgetClipboardSet(targetBlockId: string, text: string): Promise<string> {
        return json(
            await this.rpc(
                "widgetclipboardset",
                { blockid: this.assertBlockScope(targetBlockId), text },
                this.tabRoute()
            )
        );
    }

    async sandboxStart(
        sessionId = "default",
        mode = "desktop",
        browserUrl?: string,
        runtime = "auto",
        image?: string
    ): Promise<string> {
        const result = await this.rpc("sandboxstart", { sessionId, mode, browserUrl, runtime, image });
        this.rememberSandboxUrl(sessionId, result);
        return json(result);
    }

    async sandboxStatus(sessionId = "default"): Promise<string> {
        const result = await this.rpc("sandboxstatus", { sessionId });
        this.rememberSandboxUrl(sessionId, result);
        return json(result);
    }

    async sandboxStop(sessionId = "default"): Promise<string> {
        const result = await this.rpc("sandboxstop", { sessionId });
        this.sandboxUrls.delete(sessionId);
        return json(result);
    }

    async sandboxScreenshot(sessionId = "default"): Promise<string> {
        return dataUrlFromSandboxResult(await this.sandboxAction(sessionId, { action: "screenshot" }));
    }

    async sandboxMouseMove(sessionId: string, x: number, y: number): Promise<string> {
        return json(await this.sandboxAction(sessionId, { action: "move_mouse", coordinates: { x, y } }));
    }

    async sandboxClick(sessionId: string, x?: number, y?: number, button = "left", count = 1): Promise<string> {
        return json(
            await this.sandboxAction(sessionId, {
                action: "click_mouse",
                button,
                clickCount: count,
                ...(x != null && y != null ? { coordinates: { x, y } } : {}),
            })
        );
    }

    async sandboxType(sessionId: string, text: string, delayMs = 0): Promise<string> {
        return json(await this.sandboxAction(sessionId, { action: "type_text", text, delay: delayMs }));
    }

    async sandboxPaste(sessionId: string, text: string): Promise<string> {
        return json(await this.sandboxAction(sessionId, { action: "paste_text", text }));
    }

    async sandboxPress(sessionId: string, keys: string[]): Promise<string> {
        return json(await this.sandboxAction(sessionId, { action: "type_keys", keys }));
    }

    async sandboxScroll(sessionId: string, direction = "down", count = 1, x?: number, y?: number): Promise<string> {
        return json(
            await this.sandboxAction(sessionId, {
                action: "scroll",
                direction,
                scrollCount: count,
                ...(x != null && y != null ? { coordinates: { x, y } } : {}),
            })
        );
    }

    async sandboxDrag(
        sessionId: string,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        button = "left"
    ): Promise<string> {
        return json(
            await this.sandboxAction(sessionId, {
                action: "drag_mouse",
                button,
                path: [
                    { x: startX, y: startY },
                    { x: endX, y: endY },
                ],
            })
        );
    }

    async publishAgentSurfaceActivity(activity: Record<string, unknown>): Promise<void> {
        publishWithPreview(attributeAgentSurfaceActivity(activity as AgentActivityEvent));
    }

    private rememberSandboxUrl(sessionId: string, value: unknown): void {
        const status = value as { mcpUrl?: unknown; desktopUrl?: unknown };
        if (typeof status.mcpUrl === "string" && status.mcpUrl) {
            this.sandboxUrls.set(sessionId, status.mcpUrl.replace(/\/+$/, ""));
            return;
        }
        if (typeof status.desktopUrl !== "string" || !status.desktopUrl) {
            return;
        }
        const url = new URL(status.desktopUrl);
        this.sandboxUrls.set(sessionId, `${url.protocol}//${url.host}/computer-use`);
    }

    private async sandboxAction(sessionId: string, payload: Record<string, unknown>): Promise<unknown> {
        let url = this.sandboxUrls.get(sessionId);
        if (!url) {
            const status = await this.rpc("sandboxstatus", { sessionId });
            this.rememberSandboxUrl(sessionId, status);
            url = this.sandboxUrls.get(sessionId);
        }
        if (!url) {
            throw new Error(`Sandbox ${sessionId} does not expose the native TypeScript computer-use endpoint`);
        }
        const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`Sandbox action failed (${response.status}): ${text || response.statusText}`);
        }
        if (!text) {
            return { success: true };
        }
        const result = JSON.parse(text) as { success?: boolean; error?: unknown };
        if (result.success === false) {
            throw new Error(`Sandbox action failed: ${String(result.error ?? "unknown error")}`);
        }
        return result;
    }
}
