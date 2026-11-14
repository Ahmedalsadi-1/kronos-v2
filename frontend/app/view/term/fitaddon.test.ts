// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import { FitAddon } from "./fitaddon";

function makeFitAddon(width: string, height: string) {
    const parent = document.createElement("div");
    parent.style.width = width;
    parent.style.height = height;
    const element = document.createElement("div");
    element.style.padding = "0px";
    parent.appendChild(element);
    document.body.appendChild(parent);
    const terminal = {
        element,
        cols: 80,
        rows: 24,
        resize: vi.fn(),
        _core: {
            _renderService: {
                clear: vi.fn(),
                dimensions: { css: { cell: { width: 10, height: 20 } } },
            },
        },
    };
    const addon = new FitAddon();
    addon.activate(terminal as unknown as Terminal);
    addon.scrollbarWidth = 0;
    return { addon, terminal, parent };
}

describe("terminal fitting", () => {
    it.each([
        ["0px", "480px"],
        ["800px", "0px"],
        ["auto", "480px"],
    ])("retains terminal geometry when the surface is %s by %s", (width, height) => {
        const { addon, terminal, parent } = makeFitAddon(width, height);
        addon.fit();
        expect(terminal.resize).not.toHaveBeenCalled();
        expect(terminal._core._renderService.clear).not.toHaveBeenCalled();
        parent.remove();
    });

    it("fits again when a hidden surface becomes measurable", () => {
        const { addon, terminal, parent } = makeFitAddon("0px", "0px");
        addon.fit();
        parent.style.width = "1000px";
        parent.style.height = "600px";
        addon.fit();
        expect(terminal.resize).toHaveBeenCalledExactlyOnceWith(100, 30);
        parent.remove();
    });
});
