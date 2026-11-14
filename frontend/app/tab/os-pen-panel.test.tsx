// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { OSPenPanel, penLayerTree } from "./os-pen-panel";
import { OSPenProperties } from "./os-pen-properties";
import type { OSCanvasObject } from "./os-workspace-model";

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

const layer = (id: string, parentId?: string): OSCanvasObject => ({
    id,
    name: id,
    kind: "pen-layer",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    text: "Hello",
    pen: { documentId: "doc", type: "text", parentId, fill: "#123456", fontSize: 16 },
});

it("builds the layer hierarchy when children precede their parent, including broken parent cycles", () => {
    const result = penLayerTree([layer("child", "parent"), layer("parent"), layer("a", "b"), layer("b", "a")]);
    expect(result.map(({ layer, depth }) => [layer.id, depth])).toEqual([
        ["parent", 0],
        ["child", 1],
        ["a", 0],
        ["b", 1],
    ]);
});

it("collapses a layer group without dropping its sibling", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () =>
            root.render(
                <OSPenPanel
                    objects={[layer("parent"), layer("child", "parent"), layer("sibling")]}
                    status=""
                    onSelect={() => {}}
                />
            )
        );
        await act(async () => (host.querySelector('[aria-label="Collapse parent"]') as HTMLButtonElement).click());
        expect(host.querySelector('[title="child"]')).toBeNull();
        expect(host.querySelector('[title="sibling"]')).not.toBeNull();
        await act(async () => (host.querySelector('[aria-label="Expand parent"]') as HTMLButtonElement).click());
        expect(host.querySelector('[title="child"]')).not.toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("commits typography and opacity while retaining the existing layer metadata", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    const selected = layer("title");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    try {
        await act(async () => root.render(<OSPenProperties layer={selected} onChange={onChange} />));
        const input = host.querySelector('[aria-label="Opacity %"]') as HTMLInputElement;
        await act(async () => {
            input.focus();
            setValue.call(input, "60");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => input.blur());
        expect(onChange).toHaveBeenCalledWith({ pen: { ...selected.pen, opacity: 0.6 } });
        onChange.mockClear();
        const width = host.querySelector('[aria-label="W"]') as HTMLInputElement;
        await act(async () => {
            width.focus();
            setValue.call(width, "-1");
            width.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => width.blur());
        expect(onChange).not.toHaveBeenCalled();
        expect(width.value).toBe("100");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
