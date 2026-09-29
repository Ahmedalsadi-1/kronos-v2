// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    DropDirection,
    LayoutNode,
    LayoutTreeActionType,
    type LayoutTreeComputeMoveNodeAction,
    type LayoutTreeSwapNodeAction,
} from "@/layout/lib/types";

interface WidgetTabMoveLayout {
    treeReducer: (action: LayoutTreeComputeMoveNodeAction) => void;
    onDrop: () => void;
    focusNode: (nodeId: string) => void;
}

interface WidgetTabCloseAccessibility {
    ariaHidden: boolean;
    tabIndex: 0 | -1;
}

interface WidgetWorkbenchPair {
    agentNodeId: string;
    companionNodeId: string;
}

export interface WidgetTabStripScrollMetrics {
    hasOverflow: boolean;
    canScrollStart: boolean;
    canScrollEnd: boolean;
}

export type WidgetTabCloseScope = "others" | "right";

export function getWidgetTabCloseTargets(
    nodeIds: readonly string[],
    selectedNodeId: string,
    scope: WidgetTabCloseScope,
    protectedNodeIds: ReadonlySet<string> = new Set()
): string[] {
    const selectedIndex = nodeIds.indexOf(selectedNodeId);
    if (selectedIndex < 0) {
        return [];
    }
    if (scope === "right") {
        return nodeIds
            .slice(selectedIndex + 1)
            .filter((nodeId) => !protectedNodeIds.has(nodeId))
            .reverse();
    }
    return nodeIds.filter((nodeId) => nodeId !== selectedNodeId && !protectedNodeIds.has(nodeId)).reverse();
}

export function orderWidgetTabsByPinned<T extends { id: string }>(
    nodes: readonly T[],
    pinnedNodeIds: ReadonlySet<string>
): T[] {
    return nodes
        .map((node, index) => ({ node, index, pinned: pinnedNodeIds.has(node.id) }))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.index - b.index)
        .map(({ node }) => node);
}

export function resolveWidgetNativePath(meta: Record<string, unknown> | undefined): string | undefined {
    const candidate = meta?.file ?? meta?.["cmd:cwd"];
    if (typeof candidate !== "string") {
        return undefined;
    }
    const value = candidate.trim();
    if (!value) {
        return undefined;
    }
    if (/^file:\/\//i.test(value)) {
        try {
            return decodeURIComponent(new URL(value).pathname);
        } catch {
            return undefined;
        }
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        return undefined;
    }
    return value;
}

export function computeWidgetTabStripScrollMetrics(
    element: Pick<HTMLElement, "scrollWidth" | "clientWidth" | "scrollLeft">
): WidgetTabStripScrollMetrics {
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const hasOverflow = maxScrollLeft > 1;
    return {
        hasOverflow,
        canScrollStart: hasOverflow && element.scrollLeft > 1,
        canScrollEnd: hasOverflow && element.scrollLeft < maxScrollLeft - 1,
    };
}

function getVisibleWidgetPaneIds(
    activeNodeId: string | undefined,
    workbenchPair: WidgetWorkbenchPair | null
): Set<string> {
    if (workbenchPair) {
        return new Set([workbenchPair.agentNodeId, workbenchPair.companionNodeId]);
    }
    return new Set(activeNodeId ? [activeNodeId] : []);
}

function getWidgetTabCloseAccessibility(active: boolean): WidgetTabCloseAccessibility {
    return {
        ariaHidden: !active,
        tabIndex: active ? 0 : -1,
    };
}

function getWidgetFocusAfterClose(
    nodes: LayoutNode[],
    closingNodeId: string,
    activeNodeId: string | undefined
): string | null {
    if (closingNodeId !== activeNodeId) {
        return activeNodeId ?? null;
    }
    const closingIndex = nodes.findIndex((node) => node.id === closingNodeId);
    if (closingIndex === -1) {
        return activeNodeId ?? null;
    }
    return nodes[closingIndex + 1]?.id ?? nodes[closingIndex - 1]?.id ?? null;
}

function moveWidgetTab(
    layout: WidgetTabMoveLayout,
    movingNodeId: string,
    targetNodeId: string,
    direction: DropDirection
): boolean {
    if (!movingNodeId || !targetNodeId || movingNodeId === targetNodeId) {
        return false;
    }
    layout.treeReducer({
        type: LayoutTreeActionType.ComputeMove,
        nodeId: targetNodeId,
        nodeToMoveId: movingNodeId,
        direction,
    });
    layout.onDrop();
    layout.focusNode(movingNodeId);
    return true;
}

type WidgetTabDropSide = "before" | "after";

/**
 * The layout tree only swaps leaves, so an insertion is expressed as adjacent swaps; that keeps every other tab in its
 * relative order, which is what an insertion bar promises.
 */
function planWidgetTabReorder(
    orderIds: readonly string[],
    sourceId: string,
    targetId: string,
    side: WidgetTabDropSide
): Array<[string, string]> {
    const from = orderIds.indexOf(sourceId);
    const target = orderIds.indexOf(targetId);
    if (from < 0 || target < 0 || sourceId === targetId) {
        return [];
    }
    let to = side === "after" ? target + 1 : target;
    if (from < to) {
        to -= 1;
    }
    const order = [...orderIds];
    const swaps: Array<[string, string]> = [];
    const step = to > from ? 1 : -1;
    for (let i = from; i !== to; i += step) {
        swaps.push([order[i], order[i + step]]);
        [order[i], order[i + step]] = [order[i + step], order[i]];
    }
    return swaps;
}

function reorderWidgetTab(
    layout: { treeReducer: (action: LayoutTreeSwapNodeAction) => void },
    orderIds: readonly string[],
    sourceId: string,
    targetId: string,
    side: WidgetTabDropSide
): boolean {
    const swaps = planWidgetTabReorder(orderIds, sourceId, targetId, side);
    for (const [node1Id, node2Id] of swaps) {
        layout.treeReducer({ type: LayoutTreeActionType.Swap, node1Id, node2Id });
    }
    return swaps.length > 0;
}

export {
    getVisibleWidgetPaneIds,
    getWidgetFocusAfterClose,
    getWidgetTabCloseAccessibility,
    moveWidgetTab,
    planWidgetTabReorder,
    reorderWidgetTab,
    type WidgetTabDropSide,
};
