// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KronOSV2LayerControls } from "./os-kronos-v2-layer-controls";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("routes Layers window controls to their widget even after minimizing it", () => {
    const onToggleVisibility = vi.fn();
    const onToggleFocus = vi.fn();
    const onClose = vi.fn();
    const browser = { blockId: "browser", title: "Browser", x: 0, y: 0, width: 600, height: 400, visible: true };
    const handlers = { onToggleVisibility, onToggleFocus, onClose };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const click = (label: string) => {
        const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
        expect(button).not.toBeNull();
        act(() => button.click());
    };
    try {
        act(() =>
            root.render(<KronOSV2LayerControls widgets={[browser]} selectedBlockId={browser.blockId} {...handlers} />)
        );

        click("Maximize Browser");
        click("Minimize Browser");
        expect(onToggleFocus).toHaveBeenCalledWith("browser");
        expect(onToggleVisibility).toHaveBeenCalledWith("browser", false);

        act(() => root.render(<KronOSV2LayerControls widgets={[{ ...browser, visible: false }]} {...handlers} />));
        click("Restore Browser");
        click("Close Browser");
        expect(onToggleVisibility).toHaveBeenLastCalledWith("browser", true);
        expect(onClose).toHaveBeenCalledWith("browser");
    } finally {
        act(() => root.unmount());
        host.remove();
    }
});
