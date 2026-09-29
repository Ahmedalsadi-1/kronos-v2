// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/block/block", () => ({
    BlockView: () => null,
    BlockFrame: () => null,
}));

vi.mock("@/app/store/wos", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/store/wos")>()),
    getWaveObjectAtom: () => NullBlockAtom as never,
}));

import { FlexDirection, type LayoutNode } from "@/layout/lib/types";
import { atom } from "jotai";
import { WidgetTab } from "./widget-tabs-layout";

const NullBlockAtom = atom(null);

function makeNode(id: string): LayoutNode {
    return { id, flexDirection: FlexDirection.Row, size: 10, data: { blockId: "b-" + id } };
}

function renderTab(props: Partial<Parameters<typeof WidgetTab>[0]> = {}): string {
    const base: Parameters<typeof WidgetTab>[0] = {
        node: makeNode("n1"),
        active: false,
        pinned: false,
        dropSide: null,
        onSelect: () => null,
        onClose: () => null,
        onRename: () => null,
        onTogglePin: () => null,
        onTabDragOver: () => null,
        onTabDragLeave: () => null,
        onTabDrop: () => null,
        onContextMenu: () => null,
        onKeyDown: () => null,
        onDragStart: () => null,
        onDragEnd: () => null,
        ...props,
    };
    return renderToStaticMarkup(<WidgetTab {...base} />);
}

describe("WidgetTab Orca-parity markup", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders a single-line label, icon, and a bottom indicator only when active", () => {
        expect(renderTab()).not.toContain("widget-surface-tab-indicator");
        const markup = renderTab({ active: true });
        expect(markup).toContain("widget-surface-tab-indicator");
        expect(markup).toContain("widget-surface-tab-label");
        expect(markup).not.toContain("widget-surface-tab-copy");
        expect(markup).not.toContain("widget-surface-tab-split");
        expect(markup).toContain("widget-surface-tab-close");
    });

    it("shows the blue insertion bar classes while a drop side is targeted", () => {
        expect(renderTab({ dropSide: "before" })).toContain("is-drop-before");
        expect(renderTab({ dropSide: "after" })).toContain("is-drop-after");
        expect(renderTab({ dropSide: null })).not.toContain("is-drop-");
    });

    it("pins show an unpin affordance and omit the close button", () => {
        const pinned = renderTab({ pinned: true });
        expect(pinned).toContain("widget-surface-tab-pin");
        expect(pinned).toContain("widget-surface-tab-unpin");
        expect(pinned).not.toContain("widget-surface-tab-close");
    });
});
