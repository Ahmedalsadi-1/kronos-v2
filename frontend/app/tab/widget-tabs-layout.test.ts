// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { FlexDirection, type LayoutNode } from "@/layout/lib/types";
import { describe, expect, test } from "vitest";
import {
    computeWidgetTabStripScrollMetrics,
    getVisibleWidgetPaneIds,
    getWidgetFocusAfterClose,
    getWidgetTabCloseAccessibility,
    getWidgetTabCloseTargets,
    moveWidgetTab,
    orderWidgetTabsByPinned,
    planWidgetTabReorder,
    resolveWidgetNativePath,
} from "./widget-tabs-layout-utils";

function node(id: string): LayoutNode {
    return { id, flexDirection: FlexDirection.Row, size: 10 };
}

describe("getWidgetFocusAfterClose", () => {
    const nodes = [node("first"), node("second"), node("third")];

    test("focuses the following tab when the active widget closes", () => {
        expect(getWidgetFocusAfterClose(nodes, "second", "second")).toBe("third");
    });

    test("falls back to the previous tab when the last widget closes", () => {
        expect(getWidgetFocusAfterClose(nodes, "third", "third")).toBe("second");
    });

    test("keeps the active tab when a background widget closes", () => {
        expect(getWidgetFocusAfterClose(nodes, "first", "second")).toBe("second");
    });
});

describe("getWidgetTabCloseAccessibility", () => {
    test("keeps the active close action visible to keyboard and assistive technology", () => {
        expect(getWidgetTabCloseAccessibility(true)).toEqual({ ariaHidden: false, tabIndex: 0 });
    });

    test("removes an inactive close action from keyboard and assistive technology", () => {
        expect(getWidgetTabCloseAccessibility(false)).toEqual({ ariaHidden: true, tabIndex: -1 });
    });
});

describe("moveWidgetTab", () => {
    test("reorders the layout without requesting another presentation mode", () => {
        const actions: unknown[] = [];
        const focused: string[] = [];
        let dropCount = 0;
        const layout = {
            treeReducer: (action: unknown) => actions.push(action),
            onDrop: () => {
                dropCount += 1;
            },
            focusNode: (nodeId: string) => focused.push(nodeId),
        };

        expect(moveWidgetTab(layout, "first", "second", 1)).toBe(true);
        expect(actions).toHaveLength(1);
        expect(dropCount).toBe(1);
        expect(focused).toEqual(["first"]);
    });
});

describe("getVisibleWidgetPaneIds", () => {
    test("mounts only the active pane outside an agent workbench", () => {
        expect(getVisibleWidgetPaneIds("browser", null)).toEqual(new Set(["browser"]));
    });

    test("mounts only the agent and companion panes inside an agent workbench", () => {
        expect(
            getVisibleWidgetPaneIds("terminal", {
                agentNodeId: "hermes",
                companionNodeId: "browser",
            })
        ).toEqual(new Set(["hermes", "browser"]));
    });
});

describe("computeWidgetTabStripScrollMetrics", () => {
    test("reports no controls when the tab strip fits", () => {
        expect(computeWidgetTabStripScrollMetrics({ scrollWidth: 400, clientWidth: 400, scrollLeft: 0 })).toEqual({
            hasOverflow: false,
            canScrollStart: false,
            canScrollEnd: false,
        });
    });

    test("exposes only the available direction at either edge", () => {
        expect(computeWidgetTabStripScrollMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 0 })).toEqual({
            hasOverflow: true,
            canScrollStart: false,
            canScrollEnd: true,
        });
        expect(computeWidgetTabStripScrollMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 400 })).toEqual({
            hasOverflow: true,
            canScrollStart: true,
            canScrollEnd: false,
        });
    });
});

describe("getWidgetTabCloseTargets", () => {
    const nodeIds = ["one", "two", "three", "four"];

    test("closes other tabs from the far edge inward", () => {
        expect(getWidgetTabCloseTargets(nodeIds, "two", "others")).toEqual(["four", "three", "one"]);
    });

    test("closes only tabs to the right", () => {
        expect(getWidgetTabCloseTargets(nodeIds, "two", "right")).toEqual(["four", "three"]);
    });

    test("preserves pinned tabs during bulk close actions", () => {
        expect(getWidgetTabCloseTargets(nodeIds, "two", "others", new Set(["one", "four"]))).toEqual(["three"]);
        expect(getWidgetTabCloseTargets(nodeIds, "two", "right", new Set(["four"]))).toEqual(["three"]);
    });
});

describe("orderWidgetTabsByPinned", () => {
    test("moves pinned tabs first without changing relative order", () => {
        const nodes = [node("one"), node("two"), node("three"), node("four")];
        expect(orderWidgetTabsByPinned(nodes, new Set(["two", "four"])).map((entry) => entry.id)).toEqual([
            "two",
            "four",
            "one",
            "three",
        ]);
    });
});

describe("resolveWidgetNativePath", () => {
    test("uses preview files and terminal working directories", () => {
        expect(resolveWidgetNativePath({ file: "/tmp/report.md", "cmd:cwd": "/tmp/project" })).toBe("/tmp/report.md");
        expect(resolveWidgetNativePath({ "cmd:cwd": "/tmp/project" })).toBe("/tmp/project");
    });

    test("accepts file URLs while rejecting web URLs", () => {
        expect(resolveWidgetNativePath({ file: "file:///tmp/My%20Report.md" })).toBe("/tmp/My Report.md");
        expect(resolveWidgetNativePath({ file: "https://example.com/report.md" })).toBeUndefined();
    });
});

describe("planWidgetTabReorder", () => {
    const apply = (order: string[], swaps: Array<[string, string]>) => {
        const next = [...order];
        for (const [a, b] of swaps) {
            const i = next.indexOf(a);
            const j = next.indexOf(b);
            [next[i], next[j]] = [next[j], next[i]];
        }
        return next;
    };
    const order = ["a", "b", "c", "d"];

    test("moves a tab right, preserving the relative order of the others", () => {
        expect(apply(order, planWidgetTabReorder(order, "a", "c", "after"))).toEqual(["b", "c", "a", "d"]);
        expect(apply(order, planWidgetTabReorder(order, "a", "d", "after"))).toEqual(["b", "c", "d", "a"]);
    });

    test("moves a tab left", () => {
        expect(apply(order, planWidgetTabReorder(order, "d", "b", "before"))).toEqual(["a", "d", "b", "c"]);
        expect(apply(order, planWidgetTabReorder(order, "c", "a", "before"))).toEqual(["c", "a", "b", "d"]);
    });

    test("is a no-op when dropped onto its own slot or an unknown tab", () => {
        expect(planWidgetTabReorder(order, "b", "c", "before")).toEqual([]);
        expect(planWidgetTabReorder(order, "b", "a", "after")).toEqual([]);
        expect(planWidgetTabReorder(order, "b", "b", "after")).toEqual([]);
        expect(planWidgetTabReorder(order, "x", "b", "after")).toEqual([]);
    });
});
