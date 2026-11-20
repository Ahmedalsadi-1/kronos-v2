// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it, vi } from "vitest";
import { browserElementToolScript } from "./browser-element-tool";

vi.mock("../node_modules/react-grab/dist/index.global.js?raw", () => ({ default: "" }));
vi.mock("../frontend/app/lib/selector-toolbar-chrome", () => ({
    installSelectorToolbarChrome: () => {},
    SelectorToolbarStyles: "",
}));
vi.mock("./browser/grab-guest-script", () => ({
    buildBrowserElementExtractor: () => "(element) => ({target:{tagName:element.tagName,selector:element.localName}})",
}));

it("selects clicks and drag bounds while allowing clicks through when Space is held", () => {
    const guest = window as Window & {
        __KRONTERM_BROWSER_ELEMENT_TOOL__?: {
            setIntent: (intent: string) => void;
            consume: () => { target?: unknown; payload: { target: unknown } } | undefined;
        };
    };
    const globals = Object.assign(window, {
        __REACT_GRAB__: {
            setOptions() {},
            registerPlugin() {},
            onToolbarStateChange() {},
            setToolbarState() {},
            deactivate() {},
        },
        __REACT_GRAB_MODULE__: { setGlobalApi() {} },
    });
    const element = document.createElement("button");
    const click = vi.fn();
    element.addEventListener("click", click);
    document.body.append(element);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });
    const pointer = (type: string, x: number, y: number) => {
        const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
        Object.assign(event, { isPrimary: true, pointerId: 1 });
        element.dispatchEvent(event);
    };
    const space = (type: string) =>
        element.dispatchEvent(new KeyboardEvent(type, { code: "Space", bubbles: true, cancelable: true }));
    try {
        new Function(browserElementToolScript())();
        const tool = guest.__KRONTERM_BROWSER_ELEMENT_TOOL__;
        tool.setIntent("annotate");
        pointer("pointerdown", 10, 20);
        pointer("pointerup", 10, 20);
        element.click();
        expect(click).not.toHaveBeenCalled();
        expect(tool.consume()?.payload.target).toMatchObject({
            selector: "button",
            annotationPoint: { x: 10, y: 20 },
        });
        space("keydown");
        pointer("pointerdown", 10, 20);
        pointer("pointerup", 30, 50);
        element.click();
        expect(click).toHaveBeenCalledOnce();
        expect(tool.consume()).toBeUndefined();
        space("keyup");
        pointer("pointerdown", 30, 50);
        pointer("pointermove", 10, 20);
        pointer("pointerup", 10, 20);
        expect(tool.consume()?.payload.target).toMatchObject({
            rectViewport: { x: 10, y: 20, width: 20, height: 30 },
        });
        tool.setIntent(null);
        element.click();
        expect(click).toHaveBeenCalledTimes(2);
    } finally {
        guest.__KRONTERM_BROWSER_ELEMENT_TOOL__?.setIntent(null);
        delete guest.__KRONTERM_BROWSER_ELEMENT_TOOL__;
        delete globals.__REACT_GRAB__;
        delete globals.__REACT_GRAB_MODULE__;
        Reflect.deleteProperty(document, "elementFromPoint");
        element.remove();
    }
});
