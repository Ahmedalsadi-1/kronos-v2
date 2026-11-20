// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SwarmTarget } from "../frontend/types/swarm";
import { ToolFailure } from "../mcp-kron-term/src/tool-execution";
import type { HermesSurfaceContext } from "./hermes-runtime";

export type { SwarmTarget };

const WidgetTools = new Set([
    "widget_snapshot",
    "widget_find",
    "widget_inspect",
    "widget_element_at",
    "widget_screenshot",
    "widget_screenshot_annotated",
    "widget_get_state",
    "widget_get_value",
    "widget_hover",
    "widget_mouse_move",
    "widget_scroll",
    "widget_scroll_to",
    "widget_wait_for",
]);
const BrowserTools = new Set([
    "browser_navigate",
    "browser_get_html",
    "widget_click",
    "widget_type",
    "widget_press",
    "widget_drag",
    "widget_long_press",
    "widget_set_value",
    "widget_clear",
    "widget_select",
    "widget_toggle",
    "widget_sequence",
]);
const DeviceTools = new Set([
    "device_observe",
    "device_pick_element",
    "device_step",
    "device_screenshot",
    "device_tap",
    "device_type",
    "device_key",
    "device_back",
    "device_home",
    "device_swipe",
    "device_rotate",
]);
const VmTools = new Set([
    "linux_desktop_screenshot",
    "linux_desktop_click",
    "linux_desktop_drag",
    "linux_desktop_type",
    "linux_desktop_key",
    "linux_desktop_scroll",
    "linux_desktop_batch",
    "sandbox_vm_status",
    "sandbox_vm_exec",
    "sandbox_vm_files",
    "sandbox_vm_browser",
    "sandbox_vm_desktop",
]);
const VmDesktopActions = new Set(["screenshot", "click", "drag", "type", "key", "scroll"]);
const InspectableWidgetViews = new Set(["helpview", "sysinfo", "kronoscanvas"]);

export function isSwarmScoped(context: HermesSurfaceContext): boolean {
    return Boolean(context?.swarmRunId || context?.swarmAttemptId || context?.swarmPlanning || context?.swarmTarget);
}

export function swarmWorkerContext(
    parent: HermesSurfaceContext,
    runId: string,
    target: SwarmTarget
): HermesSurfaceContext {
    if (!parent?.tabId || isSwarmScoped(parent) || parent.delegationScope || parent.n8nWorkerId || !runId)
        throw new ToolFailure("SCOPE_DENIED", "Swarm execution requires an unrestricted parent chat.");
    if (target.tabId && target.tabId !== parent.tabId)
        throw new ToolFailure("TARGET_MISMATCH", "Swarm target is outside the parent tab.");
    if (
        target.kind === "vm" &&
        (!target.desktopId ||
            (parent.sandboxComputerId &&
                parent.sandboxComputerMode !== "hybrid" &&
                target.desktopId !== parent.sandboxComputerId))
    )
        throw new ToolFailure("SCOPE_DENIED", "Swarm VM requires the parent tab's active Computer grant.");
    return {
        ...parent,
        agentRuntime: "hermes",
        swarmRunId: runId,
        swarmPlanning: false,
        swarmTarget: structuredClone(target),
        blockId: target.blockId,
        sandboxComputerId: target.kind === "vm" ? target.desktopId : parent.sandboxComputerId,
        sandboxComputerGeneration: target.kind === "vm" ? target.generation : parent.sandboxComputerGeneration,
    };
}

export function isSwarmToolAllowed(context: HermesSurfaceContext, name: string): boolean {
    if (!isSwarmScoped(context)) return true;
    if (context.swarmPlanning || !context.swarmRunId) return false;
    switch (context.swarmTarget?.kind) {
        case "browser":
            return WidgetTools.has(name) || BrowserTools.has(name);
        case "widget":
            return WidgetTools.has(name);
        case "device":
            return DeviceTools.has(name);
        case "vm":
            return VmTools.has(name);
        default:
            return false;
    }
}

export function assertSwarmToolCall(context: HermesSurfaceContext, name: string, args: Record<string, unknown>): void {
    if (!isSwarmScoped(context)) return;
    if (!isSwarmToolAllowed(context, name))
        throw new ToolFailure("SCOPE_DENIED", "This tool is outside the swarm attempt's target grant.");
    const target = context.swarmTarget;
    if (
        (args.targetTabId != null && args.targetTabId !== context.tabId) ||
        (args.targetWorkspaceId != null && args.targetWorkspaceId !== context.workspaceId)
    )
        throw new ToolFailure("TARGET_MISMATCH", "Swarm tools cannot change the target's tab or workspace.");
    switch (target.kind) {
        case "browser":
        case "widget":
            if (target.blockId && args.blockId === target.blockId) return;
            break;
        case "device":
            if (target.deviceId && args.targetId === target.deviceId) {
                if (
                    ["device_screenshot", "device_observe"].includes(name) ||
                    args.expectedGeneration === target.generation
                )
                    return;
                throw new ToolFailure("STALE_TARGET", "Device control generation changed.");
            }
            break;
        case "vm":
            if (
                name.startsWith("sandbox_vm_") &&
                target.desktopId &&
                context.sandboxComputerId === target.desktopId &&
                (args.desktopId == null || args.desktopId === target.desktopId)
            ) {
                if (name === "sandbox_vm_desktop" && !VmDesktopActions.has(String(args.action)))
                    throw new ToolFailure("SCOPE_DENIED", "Swarm attempts cannot start or stop their assigned VM.");
                return;
            }
            if (target.desktopId && args.desktopId === target.desktopId) {
                if (
                    args.assignedAgentId === `sandbox:${context.tabId}` &&
                    args.expectedGeneration === target.generation
                )
                    return;
                throw new ToolFailure("STALE_TARGET", "VM control grant changed.");
            }
            break;
    }
    throw new ToolFailure("TARGET_MISMATCH", "Swarm tool requires the attempt's exact target ID.");
}

export function swarmBlockTarget(block: Pick<BlocksListEntry, "blockid" | "tabid" | "meta">): SwarmTarget | undefined {
    const view = block.meta?.view;
    const browser = view === "web";
    if (browser ? !/^https?:\/\//i.test(String(block.meta?.url ?? "")) : !InspectableWidgetViews.has(view)) return;
    const kind = browser ? "browser" : "widget";
    const id = `${kind}:${block.blockid}`;
    const resourceKeys = [`block:${block.blockid}`, `tab-input:${block.tabid}`];
    if (browser) resourceKeys.push(`browser-session:${block.meta?.["web:partition"] || "default"}`);
    return {
        id,
        kind,
        resourceKeys,
        generation: 0,
        label: String(block.meta?.["frame:title"] || block.meta?.["web:title"] || view).slice(0, 160),
        blockId: block.blockid,
        tabId: block.tabid,
    };
}
