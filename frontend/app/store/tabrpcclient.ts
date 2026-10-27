// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WaveAIModel } from "@/app/aipanel/waveai-model";
import {
    atoms,
    getApi,
    getBlockComponentModel,
    getConnStatusAtom,
    globalStore,
    refocusNode,
    WOS,
} from "@/app/store/global";
import {
    isWorkspacePresentation,
    publishWorkspacePresentation,
    readWorkspacePresentation,
    type WorkspacePresentation,
} from "@/app/tab/workspace-presentation";
import { controlWorkspaceSurface, getWorkspaceSurfaceModeProvider } from "@/app/tab/workspace-surface-runtime";
import { listAgentWidgets } from "@/app/view/agent-widget-bridge";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import type { TermViewModel } from "@/app/view/term/term-model";
import { hudLocationForMeta } from "@/app/workspace/hud-surface-location";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import { launchKronTermHudIsland, type KronTermHudApp } from "@/app/workspace/kronterm-hud-islands";
import { handleKronTermHudSurfaceAction } from "@/app/workspace/kronterm-hud-surface-actions";
import type {
    LayoutNode,
    LayoutTreeComputeMoveNodeAction,
    LayoutTreeResizeNodeAction,
    LayoutTreeSwapNodeAction,
} from "@/layout/index";
import { DropDirection, getLayoutModelForStaticTab, LayoutTreeActionType, NavigateDirection } from "@/layout/index";
import { base64ToArrayBuffer } from "@/util/util";
import { WebviewTag } from "electron";
import {
    browserElementResolverSource,
    browserHtmlScript,
    browserObservationScript,
    browserTargetPointScript,
    browserTextTargetScript,
    browserWaitConditionScript,
    mergeBrowserObservations,
} from "./browser-observation";
import { sendPointerDrag } from "./pointer-drag";
import { pressMacVmKeys, typeMacVmText } from "@/app/view/linux-vms/macos-vm-input";
import { assessWorkspaceLayout, observeWorkspaceBlock, workspaceSurfaceElement } from "./workspace-surface-observation";
import { RpcResponseHelper, WshClient } from "./wshclient";
import { RpcApi } from "./wshclientapi";

type BrowserInteractionAction = "click" | "hover" | "longpress" | "scroll" | "type" | "press" | "drag" | "scroll-to";

type BrowserInteractionResult = {
    success: boolean;
    message: string;
};

const DefaultKrontermDesktopComputerUseUrl = "http://localhost:9990/computer-use";

export function sandboxComputerUseUrlFromStatus(status: SandboxStatusResponse | null | undefined): string {
    const statusWithUrls = status as
        (SandboxStatusResponse & { mcpUrl?: string; desktopUrl?: string }) | null | undefined;
    if (statusWithUrls?.mcpUrl) {
        return statusWithUrls.mcpUrl.replace(/\/+$/, "");
    }
    if (statusWithUrls?.desktopUrl) {
        try {
            const desktopUrl = new URL(statusWithUrls.desktopUrl);
            return `${desktopUrl.protocol}//${desktopUrl.host}/computer-use`;
        } catch {
            return DefaultKrontermDesktopComputerUseUrl;
        }
    }
    return DefaultKrontermDesktopComputerUseUrl;
}

export function buildSandboxKeyboardPressPayload(keys: string[]): Record<string, unknown> {
    return { action: "type_keys", keys };
}

export function buildSandboxScrollPayload(
    direction: string,
    amount: number,
    originX?: number,
    originY?: number
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        action: "scroll",
        direction: direction || "down",
        scrollCount: Math.max(1, Math.ceil(Math.abs(amount) / 50)),
    };
    if (originX != null && originY != null) {
        payload.coordinates = { x: originX, y: originY };
    }
    return payload;
}

export function buildSandboxDragPayload(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    button = "left"
): Record<string, unknown> {
    return {
        action: "drag_mouse",
        button,
        path: [
            { x: startX, y: startY },
            { x: endX, y: endY },
        ],
    };
}

export function buildBrowserInteractionScript(
    action: BrowserInteractionAction,
    payload: Record<string, unknown>
): string {
    return `
        (async function() {
            const action = ${JSON.stringify(action)};
            const payload = ${JSON.stringify(payload)};
            const buttonNumbers = { left: 0, middle: 1, right: 2 };
            const button = buttonNumbers[payload.button] ?? 0;

            function findByRef(ref) {
                if (!ref) {
                    return null;
                }
                return ${browserElementResolverSource()}(ref);
            }

            function findTarget(ref, x, y) {
                return findByRef(ref) || (x != null && y != null ? document.elementFromPoint(x, y) : null);
            }

            function pointFor(element, x, y) {
                const rect = element.getBoundingClientRect();
                return {
                    clientX: x ?? rect.left + rect.width / 2,
                    clientY: y ?? rect.top + rect.height / 2,
                };
            }

            function pointerEvent(element, type, x, y, buttons) {
                if (typeof PointerEvent !== "function") {
                    return;
                }
                const point = pointFor(element, x, y);
                element.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    pointerId: 1,
                    pointerType: "mouse",
                    isPrimary: true,
                    clientX: point.clientX,
                    clientY: point.clientY,
                    button,
                    buttons,
                }));
            }

            function mouseEvent(element, type, x, y, detail, buttons) {
                const point = pointFor(element, x, y);
                element.dispatchEvent(new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clientX: point.clientX,
                    clientY: point.clientY,
                    button,
                    buttons,
                    detail,
                }));
            }

            function dragEvent(element, type, x, y, dataTransfer) {
                if (typeof DragEvent !== "function") {
                    return;
                }
                const point = pointFor(element, x, y);
                element.dispatchEvent(new DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clientX: point.clientX,
                    clientY: point.clientY,
                    dataTransfer,
                }));
            }

            function setInputValue(element, value) {
                const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
                setter?.call(element, value);
            }

            function insertText(element, text) {
                if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                    const start = element.selectionStart ?? element.value.length;
                    const end = element.selectionEnd ?? start;
                    const next = element.value.slice(0, start) + text + element.value.slice(end);
                    setInputValue(element, next);
                    const position = start + text.length;
                    element.setSelectionRange(position, position);
                    element.dispatchEvent(new InputEvent("input", {
                        bubbles: true,
                        inputType: "insertText",
                        data: text,
                    }));
                    return true;
                }
                if (element instanceof HTMLElement && element.isContentEditable) {
                    element.focus();
                    document.execCommand("insertText", false, text);
                    element.dispatchEvent(new InputEvent("input", {
                        bubbles: true,
                        inputType: "insertText",
                        data: text,
                    }));
                    return true;
                }
                return false;
            }

            function scrollContainer(element) {
                let current = element instanceof Element ? element : null;
                while (current instanceof HTMLElement) {
                    const style = window.getComputedStyle(current);
                    const canScroll = /(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
                    if (canScroll) {
                        return current;
                    }
                    current = current.parentElement;
                }
                return document.scrollingElement || document.documentElement;
            }

            if (action === "click") {
                const target = findTarget(payload.elementref, payload.x, payload.y);
                if (!(target instanceof HTMLElement)) {
                    return { success: false, message: "Click target not found" };
                }
                target.scrollIntoView({ block: "nearest", inline: "nearest" });
                target.focus({ preventScroll: true });
                const count = payload.clickCount ?? (payload.clicktype === "triple" ? 3 : payload.clicktype === "double" ? 2 : 1);
                for (let index = 1; index <= count; index++) {
                    pointerEvent(target, "pointerover", payload.x, payload.y, 0);
                    pointerEvent(target, "pointerenter", payload.x, payload.y, 0);
                    mouseEvent(target, "mouseover", payload.x, payload.y, index, 0);
                    mouseEvent(target, "mouseenter", payload.x, payload.y, index, 0);
                    pointerEvent(target, "pointerdown", payload.x, payload.y, 1 << button);
                    mouseEvent(target, "mousedown", payload.x, payload.y, index, 1 << button);
                    pointerEvent(target, "pointerup", payload.x, payload.y, 0);
                    mouseEvent(target, "mouseup", payload.x, payload.y, index, 0);
                    if (button === 0) {
                        target.click();
                    } else if (button === 2) {
                        mouseEvent(target, "contextmenu", payload.x, payload.y, index, 0);
                    } else {
                        mouseEvent(target, "click", payload.x, payload.y, index, 0);
                    }
                }
                if (button === 0 && count >= 2) {
                    mouseEvent(target, "dblclick", payload.x, payload.y, 2, 0);
                }
                return { success: true, message: "Clicked target " + count + " time(s)" };
            }

            if (action === "type") {
                const target = document.activeElement;
                if (!(target instanceof HTMLElement)) {
                    return { success: false, message: "No focused text target" };
                }
                const text = String(payload.text ?? "");
                const delay = Math.max(0, Number(payload.delayMs ?? 0));
                for (const char of text) {
                    if (!insertText(target, char)) {
                        return { success: false, message: "Focused target does not accept text" };
                    }
                    if (delay > 0) {
                        await new Promise((resolve) => window.setTimeout(resolve, delay));
                    }
                }
                return { success: true, message: "Typed " + text.length + " character(s)" };
            }

            if (action === "press") {
                const target = document.activeElement;
                const keys = Array.isArray(payload.keys) ? payload.keys.map(String) : [];
                const key = keys[keys.length - 1];
                if (!(target instanceof HTMLElement) || !key) {
                    return { success: false, message: "No focused key target" };
                }
                const eventOptions = {
                    key,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    altKey: keys.includes("Alt"),
                    ctrlKey: keys.includes("Control"),
                    metaKey: keys.includes("Meta") || keys.includes("Command"),
                    shiftKey: keys.includes("Shift"),
                };
                const allowed = target.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
                if (allowed && !eventOptions.altKey && !eventOptions.ctrlKey && !eventOptions.metaKey) {
                    if (key === "Enter" && target instanceof HTMLTextAreaElement) {
                        insertText(target, "\\n");
                    } else if (key === "Enter") {
                        const form = target.closest("form");
                        if (form instanceof HTMLFormElement) {
                            form.requestSubmit();
                        } else {
                            target.click();
                        }
                    } else if (key === "Backspace" && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
                        const start = target.selectionStart ?? target.value.length;
                        const end = target.selectionEnd ?? start;
                        const removeFrom = start === end ? Math.max(0, start - 1) : start;
                        target.setSelectionRange(removeFrom, end);
                        insertText(target, "");
                    } else if (key === "Tab") {
                        const focusable = Array.from(document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
                        const index = focusable.indexOf(target);
                        const direction = eventOptions.shiftKey ? -1 : 1;
                        const next = focusable[(index + direction + focusable.length) % focusable.length];
                        if (next instanceof HTMLElement) {
                            next.focus();
                        }
                    }
                }
                target.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
                return { success: true, message: "Pressed " + keys.join("+") };
            }

            if (action === "scroll") {
                const amount = Number(payload.amount ?? 0);
                const hasOrigin = payload.originX != null && payload.originY != null;
                if (hasOrigin) {
                    const pointed = document.elementFromPoint(payload.originX, payload.originY);
                    const target = scrollContainer(pointed);
                    const before = target.scrollTop;
                    target.dispatchEvent(new WheelEvent("wheel", {
                        bubbles: true, cancelable: true, composed: true,
                        deltaY: amount,
                        clientX: payload.originX, clientY: payload.originY,
                    }));
                    target.scrollTop += amount;
                    return {
                        success: target.scrollTop !== before || amount === 0,
                        message: "Scrolled from " + before + " to " + target.scrollTop,
                    };
                }
                const before = window.scrollY;
                window.dispatchEvent(new WheelEvent("wheel", {
                    bubbles: true, cancelable: true, composed: true,
                    deltaY: amount,
                    clientX: 0, clientY: 0,
                }));
                window.scrollBy(0, amount);
                return {
                    success: true,
                    message: "Scrolled from " + before + " to " + window.scrollY,
                };
            }

            if (action === "scroll-to") {
                const target = findTarget(payload.elementref, payload.x, payload.y);
                if (!(target instanceof HTMLElement)) {
                    return { success: false, message: "Scroll target not found" };
                }
                target.scrollIntoView({ block: "center", inline: "nearest" });
                return { success: true, message: "Scrolled target into view" };
            }

            if (action === "drag") {
                const start = findTarget(payload.startref, payload.startx, payload.starty, false);
                const end = findTarget(payload.endref, payload.endx, payload.endy, false);
                if (!(start instanceof HTMLElement) || !(end instanceof HTMLElement)) {
                    return { success: false, message: "Drag targets must both be visible in the current viewport; take a fresh snapshot after scrolling" };
                }
                start.scrollIntoView({ block: "nearest", inline: "nearest" });
                const startPoint = pointFor(start, payload.startx, payload.starty);
                const endPoint = pointFor(end, payload.endx, payload.endy);
                const dataTransfer = typeof DataTransfer === "function" ? new DataTransfer() : undefined;
                pointerEvent(start, "pointerover", payload.startx, payload.starty, 0);
                pointerEvent(start, "pointerenter", payload.startx, payload.starty, 0);
                mouseEvent(start, "mouseover", payload.startx, payload.starty, 1, 0);
                mouseEvent(start, "mouseenter", payload.startx, payload.starty, 1, 0);
                pointerEvent(start, "pointerdown", payload.startx, payload.starty, 1 << button);
                mouseEvent(start, "mousedown", payload.startx, payload.starty, 1, 1 << button);
                dragEvent(start, "dragstart", payload.startx, payload.starty, dataTransfer);
                for (let step = 1; step <= 8; step++) {
                    const ratio = step / 8;
                    const x = startPoint.clientX + (endPoint.clientX - startPoint.clientX) * ratio;
                    const y = startPoint.clientY + (endPoint.clientY - startPoint.clientY) * ratio;
                    const current = document.elementFromPoint(x, y) || end;
                    if (current instanceof HTMLElement) {
                        pointerEvent(current, "pointermove", x, y, 1 << button);
                        mouseEvent(current, "mousemove", x, y, 1, 1 << button);
                        dragEvent(current, "dragover", x, y, dataTransfer);
                    }
                }
                dragEvent(end, "drop", payload.endx, payload.endy, dataTransfer);
                dragEvent(start, "dragend", payload.endx, payload.endy, dataTransfer);
                pointerEvent(end, "pointerup", payload.endx, payload.endy, 0);
                mouseEvent(end, "mouseup", payload.endx, payload.endy, 1, 0);
                return { success: true, message: "Drag events dispatched" };
            }

            return { success: false, message: "Unsupported browser action" };
        })()
    `;
}

export class TabClient extends WshClient {
    constructor(routeId: string) {
        super(routeId);
    }

    private widgetRoot(blockId: string): HTMLElement | null {
        return document.querySelector<HTMLElement>(`div[data-blockid='${CSS.escape(blockId)}']`);
    }

    private observeWidgetForAgent(blockId: string): HTMLElement {
        const root = this.widgetRoot(blockId);
        if (!root)
            throw new Error(`Widget is not mounted: ${blockId}. Focus the widget explicitly before interacting.`);
        return root;
    }

    private async focusWidgetForAgent(blockId: string): Promise<HTMLElement> {
        const mounted = this.widgetRoot(blockId);
        const hud = kronTermHudController.getSnapshot();
        const nativeIsland = new URLSearchParams(window.location.search).get("nativeSurface") === "island";
        if (mounted && (nativeIsland || (hud.active && !hud.keepWorkspaceVisible))) {
            const target = mounted.querySelector<HTMLElement>("webview") ?? mounted.querySelector<HTMLElement>('textarea, input, [contenteditable="true"]');
            target?.focus({ preventScroll: true });
            return mounted;
        }
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(blockId);
        if (!node && mounted) {
            const target = mounted.querySelector<HTMLElement>("webview") ?? mounted.querySelector<HTMLElement>('textarea, input, [contenteditable="true"]');
            target?.focus({ preventScroll: true });
            return mounted;
        }
        if (!node) {
            throw new Error(`Block not found: ${blockId}`);
        }

        const presentation = this.getWorkspacePresentation();
        if (presentation === "canvas" || presentation === "os") {
            const tabId = globalStore.get(atoms.staticTabId);
            await controlWorkspaceSurface(tabId, { action: "focus", blockid: blockId });
        }

        layoutModel.focusNode(node.id);
        refocusNode(blockId);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

        const root = this.widgetRoot(blockId);
        if (!root) {
            throw new Error(`Widget is not mounted after focus: ${blockId}`);
        }
        root.scrollIntoView({ block: "nearest", inline: "nearest" });
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (webview) {
            webview.focus();
        } else {
            const activeElement = document.activeElement;
            const target =
                activeElement instanceof HTMLElement && root.contains(activeElement)
                    ? activeElement
                    : root.querySelector<HTMLElement>(
                          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
                      );
            (target ?? root).focus({ preventScroll: true });
        }
        return root;
    }

    private inputModifiers(keys: string[]): Electron.InputEvent["modifiers"] {
        const values = keys.map((key) => key.toLowerCase());
        const modifiers: NonNullable<Electron.InputEvent["modifiers"]> = [];
        if (values.some((key) => key === "shift")) modifiers.push("shift");
        const platformModifier = values.some((key) => key === "commandorcontrol" || key === "cmdorctrl");
        if (
            values.some((key) => key === "control" || key === "ctrl") ||
            (platformModifier && getApi().getPlatform() !== "darwin")
        ) {
            modifiers.push("control");
        }
        if (values.some((key) => key === "alt" || key === "option")) modifiers.push("alt");
        if (
            values.some((key) => key === "meta" || key === "command" || key === "cmd") ||
            (platformModifier && getApi().getPlatform() === "darwin")
        ) {
            modifiers.push("meta");
        }
        return modifiers;
    }

    private primaryInputKey(keys: string[]): string | undefined {
        const modifierNames = new Set([
            "shift",
            "control",
            "ctrl",
            "alt",
            "option",
            "meta",
            "command",
            "cmd",
            "commandorcontrol",
            "cmdorctrl",
        ]);
        return [...keys].reverse().find((key) => !modifierNames.has(key.toLowerCase()));
    }

    private async sendKeyChord(target: Electron.WebviewTag | null, keys: string[]): Promise<void> {
        const keyCode = this.primaryInputKey(keys);
        if (!keyCode) {
            throw new Error("A non-modifier key is required");
        }
        const modifiers = this.inputModifiers(keys);
        const keyDown: Electron.KeyboardInputEvent = { type: "keyDown", keyCode, modifiers };
        const keyUp: Electron.KeyboardInputEvent = { type: "keyUp", keyCode, modifiers };
        if (target) {
            await target.sendInputEvent(keyDown);
            await target.sendInputEvent(keyUp);
            return;
        }
        await getApi().sendInputEvent(keyDown);
        await getApi().sendInputEvent(keyUp);
    }

    private async webviewPoint(
        webview: Electron.WebviewTag,
        elementRef: unknown,
        x: unknown,
        y: unknown,
        scroll = true
    ): Promise<{ x: number; y: number } | undefined> {
        if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
            return { x: Math.round(x), y: Math.round(y) };
        }
        const ref = typeof elementRef === "string" ? elementRef : "";
        return (await webview.executeJavaScript(browserTargetPointScript(ref, scroll))) ?? undefined;
    }

    private rendererTarget(
        root: HTMLElement,
        elementRef: unknown,
        x: unknown,
        y: unknown
    ): { target: HTMLElement; x: number; y: number } | undefined {
        let target: HTMLElement | null = null;
        if (typeof elementRef === "string" && elementRef) {
            const escaped = CSS.escape(elementRef);
            const candidate =
                document.getElementById(elementRef) ??
                root.querySelector<HTMLElement>(`[name="${escaped}"]`) ??
                root.querySelector<HTMLElement>(`[aria-label="${escaped}"]`) ??
                root.querySelector<HTMLElement>(`[data-wave-ref="${escaped}"]`);
            target = candidate instanceof HTMLElement && root.contains(candidate) ? candidate : null;
        }
        const rootRect = root.getBoundingClientRect();
        const suppliedX = typeof x === "number" && Number.isFinite(x) ? x : undefined;
        const suppliedY = typeof y === "number" && Number.isFinite(y) ? y : undefined;
        const rendererX =
            suppliedX == null ? undefined : suppliedX <= rootRect.width ? rootRect.left + suppliedX : suppliedX;
        const rendererY =
            suppliedY == null ? undefined : suppliedY <= rootRect.height ? rootRect.top + suppliedY : suppliedY;
        target ??=
            rendererX != null && rendererY != null
                ? (document.elementFromPoint(rendererX, rendererY) as HTMLElement)
                : null;
        if (!(target instanceof HTMLElement) || !root.contains(target)) {
            target = root;
        }
        const targetRect = target.getBoundingClientRect();
        return {
            target,
            x: Math.round(rendererX ?? targetRect.left + targetRect.width / 2),
            y: Math.round(rendererY ?? targetRect.top + targetRect.height / 2),
        };
    }

    private rendererElementByRef(root: HTMLElement, elementRef: string): HTMLElement | null {
        if (!elementRef) {
            return null;
        }
        const escaped = CSS.escape(elementRef);
        const candidate =
            document.getElementById(elementRef) ??
            root.querySelector<HTMLElement>(`[name="${escaped}"]`) ??
            root.querySelector<HTMLElement>(`[aria-label="${escaped}"]`) ??
            root.querySelector<HTMLElement>(`[data-wave-ref="${escaped}"]`);
        return candidate instanceof HTMLElement && root.contains(candidate) ? candidate : null;
    }

    private rendererElements(
        root: HTMLElement,
        maxCount: number,
        filters: { role?: string; name?: string; value?: string; text?: string } = {}
    ): WidgetElementData[] {
        const rootRect = root.getBoundingClientRect();
        const candidates = root.querySelectorAll<HTMLElement>(
            'a, button, input, select, textarea, [contenteditable="true"], [role], [tabindex], [onclick], [aria-label]'
        );
        const elements: WidgetElementData[] = [];
        for (let index = 0; index < candidates.length && elements.length < maxCount; index++) {
            const element = candidates[index];
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none") {
                continue;
            }
            const role = element.getAttribute("role") || element.tagName.toLowerCase();
            const name = element.getAttribute("aria-label") || (element as HTMLInputElement).name || "";
            const value = "value" in element ? String((element as HTMLInputElement).value ?? "") : "";
            const content = element.textContent || "";
            if (filters.role && role !== filters.role) continue;
            if (filters.name && !name.includes(filters.name)) continue;
            if (filters.value && !value.includes(filters.value)) continue;
            if (filters.text && !content.includes(filters.text)) continue;
            let ref =
                element.id ||
                (element as HTMLInputElement).name ||
                element.getAttribute("aria-label") ||
                element.getAttribute("data-wave-ref");
            if (!ref) {
                ref = `kronterm-ref-${index}`;
                element.setAttribute("data-wave-ref", ref);
            }
            elements.push({
                ref,
                role,
                name: (name || content).trim().slice(0, 80),
                value: value.slice(0, 200),
                x: Math.round(rect.x - rootRect.x),
                y: Math.round(rect.y - rootRect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                focusable: !(element as HTMLInputElement).disabled && element.tabIndex >= 0,
                visible: true,
            });
        }
        return elements;
    }

    private rendererCondition(root: HTMLElement, elementRef: string, condition: string): boolean {
        const element = elementRef ? this.rendererElementByRef(root, elementRef) : null;
        if (condition === "exists") return elementRef ? element != null : root.isConnected;
        if (condition === "hidden") {
            return (
                !element || element.getBoundingClientRect().width === 0 || element.getBoundingClientRect().height === 0
            );
        }
        if (!element) return !elementRef && root.isConnected;
        if (condition === "visible") {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        }
        if (condition === "enabled") return !(element as HTMLInputElement).disabled;
        if (condition === "disabled") return Boolean((element as HTMLInputElement).disabled);
        if (condition === "focused") return document.activeElement === element;
        if (condition === "text") return Boolean(element.textContent?.length);
        if (condition === "value")
            return Boolean("value" in element && String((element as HTMLInputElement).value).length);
        if (condition.startsWith("text:")) return (element.textContent || "").includes(condition.slice(5));
        if (condition.startsWith("value:")) {
            return "value" in element && String((element as HTMLInputElement).value).includes(condition.slice(6));
        }
        return true;
    }

    private async executeRendererInteraction(
        root: HTMLElement,
        blockId: string,
        action: BrowserInteractionAction,
        payload: Record<string, unknown>
    ): Promise<WidgetMouseActionRtnData> {
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (action === "type") {
            const text = String(payload.text ?? "");
            const delayMs = Math.max(0, Number(payload.delayMs ?? 0));
            if (root.querySelector("[data-macos-vm]")) {
                await typeMacVmText(blockId, text, delayMs);
                return { blockid: blockId, success: true, message: `Typed ${text.length} character(s) in macOS guest` };
            }
            if (webview) {
                if (!(await webview.executeJavaScript(browserTextTargetScript()))) {
                    return {
                        blockid: blockId,
                        success: false,
                        message: "No focused editable browser field; click a writable text target before typing",
                    };
                }
                if (delayMs === 0) {
                    await webview.insertText(text);
                } else {
                    for (const character of text) {
                        await webview.insertText(character);
                        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
                    }
                }
            } else if (delayMs === 0) {
                await getApi().insertText(text);
            } else {
                for (const character of text) {
                    await getApi().insertText(character);
                    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
                }
            }
            return { blockid: blockId, success: true, message: `Typed ${text.length} character(s)` };
        }
        if (action === "press") {
            if (root.querySelector("[data-macos-vm]")) {
                pressMacVmKeys(blockId, Array.isArray(payload.keys) ? payload.keys.map(String) : []);
                return { blockid: blockId, success: true, message: "Keyboard shortcut sent to macOS guest" };
            }
            await this.sendKeyChord(webview, Array.isArray(payload.keys) ? payload.keys.map(String) : []);
            return { blockid: blockId, success: true, message: "Keyboard shortcut sent" };
        }
        if (action === "scroll-to") {
            if (webview) {
                const result = (await webview.executeJavaScript(
                    buildBrowserInteractionScript(action, payload)
                )) as BrowserInteractionResult;
                return { blockid: blockId, success: result.success, message: result.message };
            }
            const point = this.rendererTarget(root, payload.elementref, payload.x, payload.y);
            if (!point) return { blockid: blockId, success: false, message: "Scroll target not found" };
            point.target.scrollIntoView({ block: "center", inline: "nearest" });
            return { blockid: blockId, success: true, message: "Scrolled target into view" };
        }

        if (action === "drag") {
            const start = webview
                ? await this.webviewPoint(webview, payload.startref, payload.startx, payload.starty, false)
                : this.rendererTarget(root, payload.startref, payload.startx, payload.starty);
            const end = webview
                ? await this.webviewPoint(webview, payload.endref, payload.endx, payload.endy, false)
                : this.rendererTarget(root, payload.endref, payload.endx, payload.endy);
            if (!start || !end) {
                return {
                    blockid: blockId,
                    success: false,
                    message:
                        "Drag targets must both be visible in the current viewport; take a fresh snapshot after scrolling",
                };
            }
            const send = (event: Electron.MouseInputEvent) =>
                webview ? webview.sendInputEvent(event) : getApi().sendInputEvent(event);
            const button = ["left", "middle", "right"].includes(String(payload.button))
                ? (payload.button as "left" | "middle" | "right")
                : "left";
            await sendPointerDrag(send, start, end, button, (point) => {
                window.dispatchEvent(
                    new CustomEvent("kron-agent-pointer", {
                        detail: { blockId, point, action },
                    })
                );
            });
            return { blockid: blockId, success: true, message: "Drag completed" };
        }

        const domPoint = webview ? undefined : this.rendererTarget(root, payload.elementref, payload.x, payload.y);
        const point = webview
            ? await this.webviewPoint(
                  webview,
                  payload.elementref,
                  payload.x ?? payload.originX,
                  payload.y ?? payload.originY
              )
            : domPoint;
        if (!point) {
            return { blockid: blockId, success: false, message: "Interaction target not found" };
        }
        if (domPoint) {
            domPoint.target.focus({ preventScroll: true });
        }
        window.dispatchEvent(
            new CustomEvent("kron-agent-pointer", {
                detail: { blockId, point: { x: point.x, y: point.y }, action },
            })
        );
        const send = (event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent) =>
            webview ? webview.sendInputEvent(event) : getApi().sendInputEvent(event);
        if (action === "hover") {
            await send({ type: "mouseMove", x: point.x, y: point.y });
            return { blockid: blockId, success: true, message: "Hover completed" };
        }
        if (action === "scroll") {
            await send({
                type: "mouseWheel",
                x: point.x,
                y: point.y,
                deltaY: Number(payload.amount ?? 0),
                canScroll: true,
            });
            return { blockid: blockId, success: true, message: "Scroll sent" };
        }
        const button = ["left", "middle", "right"].includes(String(payload.button))
            ? (payload.button as Electron.MouseInputEvent["button"])
            : "left";
        const clickCount = Math.max(
            1,
            Number(payload.clickCount ?? (payload.clicktype === "triple" ? 3 : payload.clicktype === "double" ? 2 : 1))
        );
        await send({ type: "mouseMove", x: point.x, y: point.y });
        await send({ type: "mouseDown", x: point.x, y: point.y, button, clickCount });
        if (action === "longpress") {
            await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(payload.duration ?? 500))));
        }
        await send({ type: "mouseUp", x: point.x, y: point.y, button, clickCount });
        return {
            blockid: blockId,
            success: true,
            message: action === "longpress" ? "Long press completed" : "Click completed",
        };
    }

    private async executeBrowserInteraction(
        blockId: string,
        action: BrowserInteractionAction,
        payload: Record<string, unknown>
    ): Promise<WidgetMouseActionRtnData> {
        try {
            const root = await this.focusWidgetForAgent(blockId);
            return await this.executeRendererInteraction(root, blockId, action, payload);
        } catch (e) {
            return { blockid: blockId, success: false, message: `Widget interaction failed: ${e}` };
        }
    }

    private async sandboxClick(
        blockId: string,
        x: number,
        y: number,
        button: string
    ): Promise<WidgetMouseActionRtnData> {
        try {
            await this.focusWidgetForAgent(blockId);
            const payload = {
                action: "click_mouse",
                button: button || "left",
                clickCount: 1,
                coordinates: { x, y },
            };
            const response = await fetch(await this.sandboxComputerUseUrl(blockId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const text = await response.text();
                return {
                    blockid: blockId,
                    success: false,
                    message: `Desktop click failed (${response.status}): ${text}`,
                };
            }
            return { blockid: blockId, success: true, message: "" };
        } catch (e) {
            return { blockid: blockId, success: false, message: `Desktop click error: ${e}` };
        }
    }

    private async sandboxKeyboardType(blockId: string, text: string): Promise<WidgetMouseActionRtnData> {
        try {
            await this.focusWidgetForAgent(blockId);
            const payload = { action: "type_text", text };
            const response = await fetch(await this.sandboxComputerUseUrl(blockId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errText = await response.text();
                return {
                    blockid: blockId,
                    success: false,
                    message: `Desktop type failed (${response.status}): ${errText}`,
                };
            }
            return { blockid: blockId, success: true, message: "" };
        } catch (e) {
            return { blockid: blockId, success: false, message: `Desktop type error: ${e}` };
        }
    }

    private async sandboxKeyboardPress(blockId: string, keys: string[]): Promise<WidgetMouseActionRtnData> {
        try {
            await this.focusWidgetForAgent(blockId);
            const payload = buildSandboxKeyboardPressPayload(keys);
            const response = await fetch(await this.sandboxComputerUseUrl(blockId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errText = await response.text();
                return {
                    blockid: blockId,
                    success: false,
                    message: `Desktop press failed (${response.status}): ${errText}`,
                };
            }
            return { blockid: blockId, success: true, message: "" };
        } catch (e) {
            return { blockid: blockId, success: false, message: `Desktop press error: ${e}` };
        }
    }

    private async sandboxScroll(
        blockId: string,
        direction: string,
        amount: number,
        originX?: number,
        originY?: number
    ): Promise<WidgetMouseActionRtnData> {
        try {
            await this.focusWidgetForAgent(blockId);
            const payload = buildSandboxScrollPayload(direction, amount, originX, originY);
            const response = await fetch(await this.sandboxComputerUseUrl(blockId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errText = await response.text();
                return {
                    blockid: blockId,
                    success: false,
                    message: `Desktop scroll failed (${response.status}): ${errText}`,
                };
            }
            return { blockid: blockId, success: true, message: "" };
        } catch (e) {
            return { blockid: blockId, success: false, message: `Desktop scroll error: ${e}` };
        }
    }

    private async sandboxDrag(
        blockId: string,
        startX: number,
        startY: number,
        endX: number,
        endY: number
    ): Promise<WidgetMouseActionRtnData> {
        try {
            await this.focusWidgetForAgent(blockId);
            const payload = buildSandboxDragPayload(startX, startY, endX, endY);
            const response = await fetch(await this.sandboxComputerUseUrl(blockId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errText = await response.text();
                return {
                    blockid: blockId,
                    success: false,
                    message: `Desktop drag failed (${response.status}): ${errText}`,
                };
            }
            return { blockid: blockId, success: true, message: "" };
        } catch (e) {
            return { blockid: blockId, success: false, message: `Desktop drag error: ${e}` };
        }
    }

    private async sandboxComputerUseUrl(blockId: string): Promise<string> {
        try {
            const status = await RpcApi.SandboxStatusCommand(this, { sessionId: blockId }, { timeout: 5000 });
            return sandboxComputerUseUrlFromStatus(status);
        } catch {
            return DefaultKrontermDesktopComputerUseUrl;
        }
    }

    handle_captureblockscreenshot(rh: RpcResponseHelper, data: CommandCaptureBlockScreenshotData): Promise<string> {
        return this.captureBlockScreenshot(data.blockid, data.passive);
    }

    async captureBlockScreenshot(blockId: string, passive = false): Promise<string> {
        const root = passive ? this.widgetRoot(blockId) : await this.focusWidgetForAgent(blockId);
        const guest = root?.querySelector("webview") as Electron.WebviewTag | null;
        // Browser pointer coordinates and observations use the guest viewport, without workspace chrome.
        if (guest) return (await getApi().captureBrowserPage({ guestId: guest.getWebContentsId() })).dataUrl;
        if (passive) {
            const native = await getApi().captureNativeHudBlock(blockId);
            if (native) return native;
        }
        if (!root) throw new Error("Widget is not mounted");
        const mountedRect = root.getBoundingClientRect();
        if (mountedRect.width > 0 && mountedRect.height > 0) {
            return getApi().captureScreenshot(
                {
                    x: Math.round(mountedRect.x),
                    y: Math.round(mountedRect.y),
                    width: Math.max(1, Math.round(mountedRect.width)),
                    height: Math.max(1, Math.round(mountedRect.height)),
                },
                passive
            );
        }

        if (passive) throw new Error("Widget is not rendered yet");

        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(blockId);
        if (!node) {
            throw new Error(`Block not found: ${blockId}`);
        }

        const displayContainer = layoutModel.displayContainerRef.current;
        if (!displayContainer) {
            throw new Error("Display container not found");
        }

        const containerRect = displayContainer.getBoundingClientRect();
        const additionalProps = layoutModel.getNodeAdditionalProperties(node);

        let electronRect: Electron.Rectangle;

        if (!additionalProps?.rect) {
            // Bug: rect is not set when there is only one block in the layout
            // In this case, use the full container rect
            electronRect = {
                x: Math.round(containerRect.x),
                y: Math.round(containerRect.y),
                width: Math.round(containerRect.width),
                height: Math.round(containerRect.height),
            };
        } else {
            const blockRect = additionalProps.rect;
            electronRect = {
                x: Math.round(containerRect.x + blockRect.left),
                y: Math.round(containerRect.y + blockRect.top),
                width: Math.round(blockRect.width),
                height: Math.round(blockRect.height),
            };
        }

        return await getApi().captureScreenshot(electronRect, passive);
    }

    async handle_workspacesurfacesnapshot(): Promise<string> {
        return JSON.stringify(this.makeWorkspaceSurfaceSnapshot(), null, 2);
    }

    async handle_workspacesurfacescreenshot(): Promise<string> {
        const presentation = this.getWorkspacePresentation();
        const layoutModel = getLayoutModelForStaticTab();
        const container =
            presentation === "os"
                ? document.querySelector<HTMLElement>(".os-mode-root")
                : presentation === "canvas"
                  ? document.querySelector<HTMLElement>(".workspace-canvas")
                  : presentation === "tabs"
                    ? document.querySelector<HTMLElement>(".widget-tabs-layout")
                    : presentation === "web"
                      ? document.querySelector<HTMLElement>(".web-mode")
                      : layoutModel?.displayContainerRef.current;
        if (!container) {
            throw new Error(`Workspace ${presentation} surface is not mounted`);
        }
        const rect = container.getBoundingClientRect();
        return getApi().captureScreenshot({
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.max(1, Math.round(rect.width)),
            height: Math.max(1, Math.round(rect.height)),
        });
    }

    async handle_workspacesurfacecontrol(
        _rh: RpcResponseHelper,
        data: CommandWorkspaceSurfaceControlData
    ): Promise<string> {
        const presentation = this.getWorkspacePresentation();
        const tabId = globalStore.get(atoms.staticTabId);
        if (data.action === "hud.launch") {
            if (!kronTermHudController.getSnapshot().active) throw new Error("KronTerm HUD mode is not active");
            const options = data.text ? JSON.parse(data.text) : {};
            const blockId = await launchKronTermHudIsland(data.view as KronTermHudApp, { ...options, forceNew: true });
            return JSON.stringify({ success: true, blockId, snapshot: this.makeWorkspaceSurfaceSnapshot() });
        }
        const hudResult = await handleKronTermHudSurfaceAction(data, {
            isKnownBlock: (blockId) => {
                const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
                return (
                    ((tab?.blockids ?? []).includes(blockId) || kronTermHudController.isIsland(blockId)) &&
                    globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId))) != null
                );
            },
            isDetached: (blockId) => {
                const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
                return !(tab?.blockids ?? []).includes(blockId) && kronTermHudController.isIsland(blockId);
            },
            setMode: (mode) => {
                if (mode === "workspace") {
                    kronTermHudController.setActive(false);
                    hermesSurfaceController.requestOpenChat();
                    return;
                }
                if (mode === "alongside") kronTermHudController.openAlongsideWorkspace();
                else kronTermHudController.openExclusiveHud();
                hermesSurfaceController.requestOpenHud();
            },
            setBackground: async (blockId, background) => {
                const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
                if (
                    !kronTermHudController.getSnapshot().active &&
                    presentation === "os" &&
                    (tab?.blockids ?? []).includes(blockId)
                ) {
                    await controlWorkspaceSurface(tabId, {
                        action: background ? "spatial.collapse" : "spatial.restore",
                        blockid: blockId,
                    });
                }
                kronTermHudController.setBlockBackground(blockId, background);
                const hud = kronTermHudController.getSnapshot();
                if (hud.active && hud.selectedBlockId === blockId && background)
                    await getApi().selectNativeHudWidget(blockId, false);
            },
            showWorkspaceBlock: async (blockId) => {
                if (!(await getApi().selectNativeHudWidget(blockId, true)))
                    throw new Error("HUD widget is not ready. Retry shortly.");
            },
            showDetachedBlock: async (blockId) => {
                return getApi().selectNativeHudWidget(blockId, true);
            },
            hideDetachedBlock: (blockId) => getApi().setNativeHudIslandVisibility(blockId, false),
        });
        if (hudResult) {
            return JSON.stringify({ ...hudResult, snapshot: this.makeWorkspaceSurfaceSnapshot() }, null, 2);
        }
        if (data.action === "set_presentation") {
            if (!isWorkspacePresentation(data.presentation)) {
                throw new Error(`Invalid workspace presentation: ${data.presentation}`);
            }
            const nextPresentation = publishWorkspacePresentation(data.presentation);
            await RpcApi.SetConfigCommand(this, { "app:layoutmode": nextPresentation });
            return JSON.stringify({
                success: true,
                message: `Workspace presentation changed to ${nextPresentation}.`,
                presentation: nextPresentation,
            });
        }
        if (presentation === "canvas" || presentation === "os") {
            const result = await controlWorkspaceSurface(tabId, {
                action: data.action as any,
                blockid: data.blockid,
                targetblockid: data.targetblockid,
                direction: data.direction as "up" | "right" | "down" | "left",
                x: data.x,
                y: data.y,
                width: data.width,
                height: data.height,
                objectid: data.objectid,
                fromobjectid: data.fromobjectid,
                toobjectid: data.toobjectid,
                text: data.text,
                color: data.color,
                side: data.side as "left" | "right",
                view: data.view,
                appid: data.appid,
                appname: data.appname,
                file: data.file,
                workspaceid: data.workspaceid,
                presentation: data.presentation,
                position: data.position,
            });
            return JSON.stringify({ ...result, snapshot: this.makeWorkspaceSurfaceSnapshot() }, null, 2);
        }

        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = data.blockid ? layoutModel.getNodeByBlockId(data.blockid) : undefined;
        if (["focus", "move", "resize", "swap", "magnify", "navigate"].includes(data.action) && !node) {
            throw new Error(`Block not found in active tab: ${data.blockid || "<missing>"}`);
        }
        if (data.action === "focus") {
            layoutModel.focusNode(node.id);
        } else if (data.action === "move") {
            const target = layoutModel.getNodeByBlockId(data.targetblockid);
            if (!target || target.id === node.id) {
                throw new Error(`A different target block is required: ${data.targetblockid || "<missing>"}`);
            }
            const directionByValue = {
                before: DropDirection.Left,
                after: DropDirection.Right,
                left: DropDirection.Left,
                right: DropDirection.Right,
                up: DropDirection.Top,
                down: DropDirection.Bottom,
            } as const;
            const direction = directionByValue[(data.direction || data.position) as keyof typeof directionByValue];
            if (direction == null) {
                throw new Error("Move requires position before/after or direction up/right/down/left");
            }
            layoutModel.treeReducer({
                type: LayoutTreeActionType.ComputeMove,
                nodeId: target.id,
                nodeToMoveId: node.id,
                direction,
            } as LayoutTreeComputeMoveNodeAction);
            layoutModel.onDrop();
            layoutModel.focusNode(node.id);
        } else if (data.action === "swap") {
            const target = layoutModel.getNodeByBlockId(data.targetblockid);
            if (!target || target.id === node.id) {
                throw new Error(`A different target block is required: ${data.targetblockid || "<missing>"}`);
            }
            layoutModel.treeReducer({
                type: LayoutTreeActionType.Swap,
                node1Id: node.id,
                node2Id: target.id,
            } as LayoutTreeSwapNodeAction);
        } else if (data.action === "resize") {
            if (presentation !== "widgets") {
                throw new Error("Proportional resize is available only in widgets presentation");
            }
            if (data.size == null || !Number.isFinite(data.size)) {
                throw new Error("Widgets resize requires size between 10 and 90");
            }
            const size = Math.min(90, Math.max(10, data.size));
            const parent = this.findWorkspaceSurfaceParent(layoutModel.treeState.rootNode, node.id);
            if (!parent || parent.children.length < 2) {
                throw new Error("The widget is not in a resizable split");
            }
            const total = parent.children.reduce((sum, child) => sum + child.size, 0);
            const targetSize = (total * size) / 100;
            const otherTotal = total - node.size;
            layoutModel.treeReducer({
                type: LayoutTreeActionType.ResizeNode,
                resizeOperations: parent.children.map((child) => ({
                    nodeId: child.id,
                    size:
                        child.id === node.id
                            ? targetSize
                            : otherTotal > 0
                              ? (child.size / otherTotal) * (total - targetSize)
                              : (total - targetSize) / (parent.children.length - 1),
                })),
            } as LayoutTreeResizeNodeAction);
        } else if (data.action === "magnify") {
            if (presentation !== "widgets") {
                throw new Error("Magnification is available only in widgets presentation");
            }
            layoutModel.magnifyNodeToggle(node.id);
        } else if (data.action === "navigate") {
            const direction = data.direction as "up" | "right" | "down" | "left";
            if (!direction) {
                throw new Error("Navigate requires a direction");
            }
            if (presentation === "tabs") {
                const order = globalStore.get(layoutModel.leafOrder);
                const index = order.findIndex((entry) => entry.nodeid === node.id);
                const delta = direction === "left" || direction === "up" ? -1 : 1;
                const next = order[(index + delta + order.length) % order.length];
                layoutModel.focusNode(next.nodeid);
            } else {
                const directionMap = {
                    up: NavigateDirection.Up,
                    right: NavigateDirection.Right,
                    down: NavigateDirection.Down,
                    left: NavigateDirection.Left,
                };
                const result = layoutModel.switchNodeFocusInDirection(directionMap[direction], false);
                if (!result.success) {
                    throw new Error(`No widget exists ${direction} of ${data.blockid}`);
                }
            }
        } else if (data.action === "fit" || data.action === "arrange") {
            throw new Error(`${data.action} is available only in canvas presentation`);
        } else {
            throw new Error(`Unknown workspace surface action: ${data.action}`);
        }
        return JSON.stringify({ success: true, snapshot: this.makeWorkspaceSurfaceSnapshot() }, null, 2);
    }

    private getWorkspacePresentation(): WorkspacePresentation {
        return readWorkspacePresentation("widgets");
    }

    private findWorkspaceSurfaceParent(root: LayoutNode, nodeId: string): LayoutNode | undefined {
        if (!root?.children?.length) {
            return undefined;
        }
        if (root.children.some((child) => child.id === nodeId)) {
            return root;
        }
        for (const child of root.children) {
            const parent = this.findWorkspaceSurfaceParent(child, nodeId);
            if (parent) {
                return parent;
            }
        }
        return undefined;
    }

    private makeWorkspaceSurfaceSnapshot(): Record<string, unknown> {
        const presentation = this.getWorkspacePresentation();
        const tabId = globalStore.get(atoms.staticTabId);
        const tabAtom = WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId));
        const tab = globalStore.get(tabAtom);
        const layoutModel = getLayoutModelForStaticTab();
        const modeState = getWorkspaceSurfaceModeProvider(tabId)?.snapshot();
        const leafOrder = layoutModel ? globalStore.get(layoutModel.leafOrder) : [];
        const workspaceBlockIds =
            presentation === "canvas" || presentation === "os"
                ? (tab?.blockids ?? [])
                : leafOrder.map((entry) => entry.blockid);
        const hud = kronTermHudController.getSnapshot();
        const orderedBlockIds = [
            ...new Set([...workspaceBlockIds, ...(tab?.blockids ?? []), ...hud.islandBlockIds]),
        ].filter((blockId) => globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId))) != null);
        const focusedNode = layoutModel ? globalStore.get(layoutModel.focusedNode) : undefined;
        const focusedBlockId =
            presentation === "canvas" || presentation === "os"
                ? modeState?.selectedblockid
                : focusedNode?.data?.blockId;
        const surface = workspaceSurfaceElement(presentation, layoutModel?.displayContainerRef.current);
        const containerRect = surface?.getBoundingClientRect();
        const canvasRect = document.querySelector<HTMLElement>(".workspace-canvas")?.getBoundingClientRect();
        const osRect = document.querySelector<HTMLElement>(".os-mode-root")?.getBoundingClientRect();
        const activities = new Map(listAgentWidgets().map((widget) => [widget.id, widget]));
        const blocks = orderedBlockIds.map((blockId, index) => {
            const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId));
            const block = globalStore.get(blockAtom);
            const node = layoutModel?.getNodeByBlockId(blockId);
            const localRect = node ? layoutModel.getNodeRect(node) : undefined;
            const worldBounds = modeState?.rects?.[blockId];
            const camera = modeState?.camera;
            const observation = observeWorkspaceBlock(blockId, hud.islandBlockIds.includes(blockId));
            const modelBounds =
                (presentation === "canvas" || presentation === "os") && worldBounds && camera && (canvasRect || osRect)
                    ? {
                          x: (canvasRect ?? osRect).x + camera.x + worldBounds.x * camera.zoom,
                          y: (canvasRect ?? osRect).y + camera.y + worldBounds.y * camera.zoom,
                          width: worldBounds.width * camera.zoom,
                          height: worldBounds.height * camera.zoom,
                      }
                    : localRect && containerRect
                      ? {
                            x: containerRect.x + localRect.left,
                            y: containerRect.y + localRect.top,
                            width: localRect.width,
                            height: localRect.height,
                        }
                      : undefined;
            const view = String(block?.meta?.view ?? "unknown");
            const title =
                String(
                    block?.meta?.["frame:title"] ??
                        block?.meta?.["web:title"] ??
                        block?.meta?.["appstream:appname"] ??
                        ""
                ).trim() || view;
            const background =
                hud.backgroundBlockIds.includes(blockId) || modeState?.presentations?.[blockId] === "collapsed";
            return {
                order: index + 1,
                blockid: blockId,
                nodeid: node?.id,
                view,
                title,
                focused: focusedBlockId === blockId,
                visible: !background && (!hud.active || hud.keepWorkspaceVisible) && observation.visible,
                uservisible:
                    document.visibilityState === "visible" &&
                    !background &&
                    (!hud.active || hud.keepWorkspaceVisible) &&
                    observation.visible,
                background,
                hudisland: hud.islandBlockIds.includes(blockId),
                ownerroute: hud.islandBlockIds.includes(blockId) ? `tab:${tabId}:island:${blockId}` : `tab:${tabId}`,
                hudselected: hud.selectedBlockId === blockId,
                hudvisible: hud.active && hud.selectedBlockId === blockId && hud.expanded !== false,
                bounds: observation.bounds,
                modelbounds: modelBounds,
                geometryscope: observation.geometryscope,
                availability: observation.availability,
                visiblefraction: observation.visibleFraction,
                clipped: observation.clipped,
                centeroccluded: observation.centerOccluded,
                worldbounds: worldBounds,
                active: activities.get(blockId)?.active ?? false,
                location: hudLocationForMeta(block?.meta ?? {}, blockId),
                meta: block?.meta ?? {},
            };
        });
        return {
            version: 2,
            timestamp: Date.now(),
            tabid: tabId,
            workspaceid: globalStore.get(atoms.workspaceId),
            userview: {
                rendererVisible: document.visibilityState === "visible",
                rendererFocused: document.hasFocus(),
                coordinateSpace: "renderer-viewport-css-pixels",
                viewport: { width: window.innerWidth, height: window.innerHeight },
                devicePixelRatio: window.devicePixelRatio,
            },
            visualassessment: assessWorkspaceLayout(blocks),
            presentation,
            hud,
            focusedblockid: focusedBlockId,
            magnifiedblockid: layoutModel?.magnifiedNodeId
                ? globalStore.get(layoutModel.leafs).find((leaf) => leaf.id === layoutModel.magnifiedNodeId)?.data
                      ?.blockId
                : undefined,
            viewport:
                (presentation === "canvas" || presentation === "os") && (canvasRect || osRect)
                    ? {
                          x: (canvasRect ?? osRect).x,
                          y: (canvasRect ?? osRect).y,
                          width: (canvasRect ?? osRect).width,
                          height: (canvasRect ?? osRect).height,
                      }
                    : containerRect
                      ? {
                            x: containerRect.x,
                            y: containerRect.y,
                            width: containerRect.width,
                            height: containerRect.height,
                        }
                      : undefined,
            camera: modeState?.camera,
            canvasobjects: modeState?.objects ?? [],
            selectedcanvasobjectid: modeState?.selectedobjectid,
            canvascontextids: modeState?.contextids ?? [],
            canvascontextmode: modeState?.contextmode,
            osscene: modeState?.scene,
            osgroups: modeState?.groups,
            ospresentations: modeState?.presentations,
            osview: modeState?.osview,
            layouttree: presentation === "widgets" ? layoutModel?.treeState.rootNode : undefined,
            blocks,
            capabilities: {
                presentation: ["set_presentation"],
                hud: ["hud.mode", "hud.open", "hud.background", "hud.restore", "hud.launch"],
                widgets: ["focus", "move", "swap", "resize", "magnify", "navigate", "screenshot"],
                tabs: ["focus", "move", "swap", "navigate", "screenshot"],
                web: ["screenshot", "set_presentation"],
                canvas: [
                    "focus",
                    "move",
                    "resize",
                    "navigate",
                    "fit",
                    "arrange",
                    "add_note",
                    "update_object",
                    "delete_object",
                    "connect_objects",
                    "screenshot",
                ],
                os: [
                    "focus",
                    "move",
                    "resize",
                    "fit",
                    "navigate",
                    "arrange",
                    "connect_objects",
                    "add_note",
                    "update_object",
                    "delete_object",
                    "spatial.dock",
                    "spatial.detach",
                    "spatial.collapse",
                    "spatial.restore",
                    "spatial.showOverview",
                    "os.view.set",
                    "spatial.openApp",
                    "spatial.openFile",
                    "spatial.openCommandCenter",
                    "os.app.launch",
                    "os.space.switch",
                    "os.resource.open",
                    "os.window.focus",
                    "os.window.move",
                    "os.window.resize",
                    "os.window.snap",
                    "os.window.minimize",
                    "os.window.restore",
                    "os.window.maximize",
                    "os.window.close",
                    "os.window.overview",
                    "os.window.place",
                    "os.window.arrange",
                    "screenshot",
                ],
            },
            guidance:
                presentation === "os"
                    ? "Use osscene, osgroups, ospresentations, worldbounds, and canvasobjects to control the live hybrid OS workspace. Presentation actions preserve canonical block identity."
                    : presentation === "canvas"
                      ? "Use worldbounds for widget geometry, canvasobjects for whiteboard object IDs and geometry, selectedcanvasobjectid and canvascontextids for the user's active spatial context, and bounds for on-screen interactions. Requested placements are moved to open space to prevent overlap."
                      : presentation === "tabs"
                        ? "Visible panes can include the agent and a companion widget; inspect each block's visible flag and bounds before interaction."
                        : presentation === "web"
                          ? "The full-screen web shell owns this viewport. Workspace blocks are parked; use browser tools for the active web surface or change presentation. HUD island geometry belongs to a separate desktop window."
                          : "Use layouttree and bounds for split-aware move, resize, magnify, and directional navigation.",
        };
    }

    async handle_waveaiaddcontext(rh: RpcResponseHelper, data: CommandWaveAIAddContextData): Promise<void> {
        hermesSurfaceController.requestOpenChat();

        const model = WaveAIModel.getInstance();

        if (data.newchat) {
            model.clearChat();
        }

        if (data.files && data.files.length > 0) {
            for (const fileData of data.files) {
                const decodedData = base64ToArrayBuffer(fileData.data64);
                const blob = new Blob([decodedData], { type: fileData.type });
                const file = new File([blob], fileData.name, { type: fileData.type });
                await model.addFile(file);
            }
        }

        if (data.text) {
            model.appendText(data.text);
        }

        if (data.submit) {
            await model.handleSubmit();
        }
    }

    async handle_setblockfocus(rh: RpcResponseHelper, blockId: string): Promise<void> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(blockId);
        if (!node) {
            throw new Error(`Block not found in tab: ${blockId}`);
        }

        layoutModel.focusNode(node.id);
    }

    async handle_getfocusedblockdata(rh: RpcResponseHelper): Promise<FocusedBlockData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const focusedNode = globalStore.get(layoutModel.focusedNode);
        const blockId = focusedNode?.data?.blockId;

        if (!blockId) {
            return null;
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId));
        const blockData = globalStore.get(blockAtom);

        if (!blockData) {
            return null;
        }

        const viewType = blockData.meta?.view ?? "";
        const controller = blockData.meta?.controller ?? "";
        const connName = blockData.meta?.connection ?? "";

        const result: FocusedBlockData = {
            blockid: blockId,
            viewtype: viewType,
            controller: controller,
            connname: connName,
            blockmeta: blockData.meta ?? {},
        };

        if (viewType === "term" && controller === "shell") {
            const jobStatus = await RpcApi.BlockJobStatusCommand(this, blockId);
            if (jobStatus) {
                result.termjobstatus = jobStatus;
            }
        }

        if (connName) {
            const connStatusAtom = getConnStatusAtom(connName);
            const connStatus = globalStore.get(connStatusAtom);
            if (connStatus) {
                result.connstatus = connStatus;
            }
        }

        if (viewType === "term") {
            try {
                const bcm = getBlockComponentModel(blockId);
                if (bcm?.viewModel) {
                    const termViewModel = bcm.viewModel as TermViewModel;
                    if (termViewModel.termRef?.current?.shellIntegrationStatusAtom) {
                        const shellIntegrationStatus = globalStore.get(
                            termViewModel.termRef.current.shellIntegrationStatusAtom
                        );
                        result.termshellintegrationstatus = shellIntegrationStatus || "";
                    }
                    if (termViewModel.termRef?.current?.lastCommandAtom) {
                        const lastCommand = globalStore.get(termViewModel.termRef.current.lastCommandAtom);
                        result.termlastcommand = lastCommand || "";
                    }
                }
            } catch (e) {
                console.log("error getting term-specific data", e);
            }
        }

        return result;
    }

    // =========================================================================
    // Human Simulation Widget Handlers
    // =========================================================================

    async handle_widgetgetelements(
        rh: RpcResponseHelper,
        data: CommandWidgetGetElementsData
    ): Promise<WidgetGetElementsRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            throw new Error(`Block not found: ${data.blockid}`);
        }
        const root = this.observeWidgetForAgent(data.blockid);

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";

        const elements: WidgetElementData[] = [];

        if (viewType === "term") {
            const bcm = getBlockComponentModel(data.blockid);
            if (bcm?.viewModel) {
                const termViewModel = bcm.viewModel as TermViewModel;
                elements.push({
                    ref: "terminal",
                    role: "terminal",
                    name: "Terminal",
                    value: "",
                    x: 0,
                    y: 0,
                    width: 800,
                    height: 600,
                    focusable: true,
                    visible: true,
                });
            }
        } else if (viewType === "web") {
            const webview = document.querySelector(`div[data-blockid='${data.blockid}'] webview`) as WebviewTag;
            if (webview) {
                const bounds = webview.getBoundingClientRect();
                elements.push({
                    ref: "webview",
                    role: "browser",
                    name: "Web Browser",
                    value: "",
                    x: Math.round(bounds.x),
                    y: Math.round(bounds.y),
                    width: Math.round(bounds.width),
                    height: Math.round(bounds.height),
                    focusable: true,
                    visible: true,
                });
            }
        } else if (viewType === "sandbox") {
            const sandboxMode = blockData?.meta?.["sandbox:mode"] ?? "desktop";
            const sandboxUrl = blockData?.meta?.["sandbox:browserurl"] ?? "";
            const sandboxBlockId = blockData?.meta?.["sandbox:browserblockid"] ?? "";

            elements.push({
                ref: "sandbox-desktop",
                role: "desktop",
                name: "Sandbox Desktop",
                value: `mode: ${sandboxMode}, browser: ${sandboxUrl || "none"}, browserBlock: ${sandboxBlockId || "none"}`,
                x: 0,
                y: 0,
                width: 800,
                height: 600,
                focusable: false,
                visible: true,
            });

            // For kronterm-desktop runtime, try to fetch a screenshot
            try {
                const response = await fetch(await this.sandboxComputerUseUrl(data.blockid), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "screenshot" }),
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data?.image) {
                        elements.push({
                            ref: "screenshot",
                            role: "image",
                            name: "Desktop Screenshot",
                            value: `data:image/png;base64,${data.image}`,
                            x: 0,
                            y: 0,
                            width: 800,
                            height: 600,
                            focusable: false,
                            visible: true,
                        });
                    }
                }
            } catch {
                // Sandbox API not available — return basic info only
            }
        } else {
            elements.push(...this.rendererElements(root, 50));
        }

        return {
            blockid: data.blockid,
            elements: elements,
            count: elements.length,
            timestamp: Date.now(),
        };
    }

    async handle_widgetgetstate(
        rh: RpcResponseHelper,
        data: CommandWidgetGetStateData
    ): Promise<WidgetGetStateRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            throw new Error(`Block not found: ${data.blockid}`);
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";
        const root = this.observeWidgetForAgent(data.blockid);

        const additionalProps = node ? layoutModel.getNodeAdditionalProperties(node) : undefined;
        const mountedRect = root.getBoundingClientRect();
        const guest = root.querySelector("webview") as Electron.WebviewTag;
        const viewport = guest ? await guest.executeJavaScript("({width:innerWidth,height:innerHeight})") : undefined;
        const width = viewport?.width || mountedRect.width || additionalProps?.rect?.width || 800;
        const height = viewport?.height || mountedRect.height || additionalProps?.rect?.height || 600;

        const focusedNode = globalStore.get(layoutModel.focusedNode);
        const isFocused = focusedNode?.data?.blockId === data.blockid;

        return {
            blockid: data.blockid,
            viewtype: viewType,
            state: {},
            focused: isFocused,
            x: Math.round(mountedRect.x),
            y: Math.round(mountedRect.y),
            width: width,
            height: height,
        };
    }

    async handle_widgetmouseclick(
        rh: RpcResponseHelper,
        data: CommandWidgetMouseClickData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";

        // Route sandbox clicks to the kronterm-desktop API
        if (viewType === "sandbox") {
            return this.sandboxClick(data.blockid, data.x ?? 0, data.y ?? 0, data.button ?? "left");
        }

        return this.executeBrowserInteraction(data.blockid, "click", {
            x: data.x,
            y: data.y,
            button: data.button,
            clickCount: data.clickcount,
        });
    }

    async handle_widgetmousescroll(
        rh: RpcResponseHelper,
        data: CommandWidgetMouseScrollData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";

        if (viewType === "sandbox") {
            const direction = (data.amount ?? 0) >= 0 ? "down" : "up";
            return this.sandboxScroll(data.blockid, direction, data.amount ?? 0, data.originx, data.originy);
        }

        return this.executeBrowserInteraction(data.blockid, "scroll", {
            amount: data.amount,
            originX: data.originx,
            originY: data.originy,
        });
    }

    async handle_widgetmousedrag(
        rh: RpcResponseHelper,
        data: CommandWidgetMouseDragData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";

        if (viewType === "sandbox") {
            return this.sandboxDrag(data.blockid, data.startx ?? 0, data.starty ?? 0, data.endx ?? 0, data.endy ?? 0);
        }

        return this.executeBrowserInteraction(data.blockid, "drag", {
            startx: data.startx,
            starty: data.starty,
            endx: data.endx,
            endy: data.endy,
            button: data.button,
        });
    }

    async handle_widgetkeyboardtype(
        rh: RpcResponseHelper,
        data: CommandWidgetKeyboardTypeData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";

        if (viewType === "sandbox") {
            return this.sandboxKeyboardType(data.blockid, data.text);
        }

        return this.executeBrowserInteraction(data.blockid, "type", { text: data.text, delayMs: data.delayms });
    }

    async handle_widgetkeyboardpress(
        rh: RpcResponseHelper,
        data: CommandWidgetKeyboardPressData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }

        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }

        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", data.blockid));
        const blockData = globalStore.get(blockAtom);
        const viewType = blockData?.meta?.view ?? "";

        if (viewType === "sandbox") {
            return this.sandboxKeyboardPress(data.blockid, data.keys);
        }

        return this.executeBrowserInteraction(data.blockid, "press", { keys: data.keys });
    }

    async handle_widgetwaitforelement(
        rh: RpcResponseHelper,
        data: CommandWidgetWaitForElementData
    ): Promise<WidgetWaitForElementRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return {
                blockid: data.blockid,
                condition: data.condition || "visible",
                met: false,
                wait_time_ms: 0,
                message: "Block not found",
            };
        }

        const startTime = Date.now();
        const timeout = data.timeoutms || 5000;
        const condition = data.condition || "visible";
        const ref = data.elementref || "";

        const root = await this.focusWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            while (Date.now() - startTime < timeout) {
                if (this.rendererCondition(root, ref, condition)) {
                    return {
                        blockid: data.blockid,
                        condition,
                        met: true,
                        wait_time_ms: Date.now() - startTime,
                        message: "Condition met",
                    };
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return {
                blockid: data.blockid,
                condition: condition,
                met: false,
                wait_time_ms: Date.now() - startTime,
                message: "Element wait timeout - condition not met",
            };
        }

        while (Date.now() - startTime < timeout) {
            try {
                const checkResult = await webview.executeJavaScript(`
                    (function() {
                        var ref = ${JSON.stringify(ref)};
                        var condition = ${JSON.stringify(condition)};
                        var el = null;
                        if (ref) {
                            el = document.getElementById(ref) || document.querySelector('[name="' + ref + '"]') || document.querySelector('[aria-label="' + ref + '"]');
                        }
                        if (!el) return false;
                        if (condition === 'visible') {
                            var rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0;
                        }
                        if (condition === 'hidden') return el.offsetWidth === 0 && el.offsetHeight === 0;
                        if (condition === 'enabled') return !el.disabled;
                        if (condition === 'focused') return document.activeElement === el;
                        return true;
                    })()
                `);
                if (checkResult) {
                    return {
                        blockid: data.blockid,
                        condition: condition,
                        met: true,
                        wait_time_ms: Date.now() - startTime,
                        message: "Condition met",
                    };
                }
            } catch (_) {
                // webview may not be ready yet, keep polling
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        return {
            blockid: data.blockid,
            condition: condition,
            met: false,
            wait_time_ms: Date.now() - startTime,
            message: "Element wait timeout - condition not met",
        };
    }

    async handle_widgetscreenshotannotated(
        rh: RpcResponseHelper,
        data: CommandWidgetScreenshotAnnotatedData
    ): Promise<WidgetScreenshotAnnotatedRtnData> {
        const screenshot = await this.captureBlockScreenshot(data.blockid);
        return {
            blockid: data.blockid,
            imageurl: screenshot,
        };
    }

    async handle_webselector(_rh: RpcResponseHelper, data: CommandWebSelectorData): Promise<string[]> {
        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag;
        if (!webview) throw new Error("Target is not a browser widget");
        return webview.executeJavaScript(browserHtmlScript(data.selector, data.opts?.inner, data.opts?.all));
    }

    async handle_widgetsnapshot(
        rh: RpcResponseHelper,
        data: CommandWidgetSnapshotData
    ): Promise<WidgetSnapshotRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            throw new Error("Browser snapshot unavailable: block is not mounted; refresh workspace inventory");
        }
        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            const elements = this.rendererElements(root, 50);
            return { blockid: data.blockid, elements, count: elements.length, timestamp: Date.now() };
        }
        try {
            const domElements = await webview.executeJavaScript(browserObservationScript(250));
            const accessibility = getApi()?.browserAccessibilitySnapshot;
            const axElements = accessibility ? await accessibility(webview.getWebContentsId()).catch(() => null) : null;
            const elements = mergeBrowserObservations(domElements, axElements);
            return {
                blockid: data.blockid,
                elements: elements || [],
                count: (elements || []).length,
                timestamp: Date.now(),
            };
        } catch (e) {
            throw new Error(`Browser snapshot failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async handle_widgetfind(rh: RpcResponseHelper, data: CommandWidgetFindData): Promise<WidgetFindRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, elements: [], count: 0 };
        }
        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            const elements = this.rendererElements(root, data.maxcount || 10, {
                role: data.role,
                name: data.name,
                value: data.value,
                text: data.text,
            });
            return { blockid: data.blockid, elements, count: elements.length };
        }
        try {
            const maxCount = data.maxcount || 10;
            const roleFilter = data.role || "";
            const nameFilter = data.name || "";
            const valueFilter = data.value || "";
            const textFilter = data.text || "";
            const candidates = await webview.executeJavaScript(browserObservationScript(1000));
            const elements = candidates
                .filter(
                    (element) =>
                        (!roleFilter || element.role === roleFilter) &&
                        (!nameFilter || element.name.includes(nameFilter)) &&
                        (!valueFilter || element.value.includes(valueFilter)) &&
                        (!textFilter || element.name.includes(textFilter))
                )
                .slice(0, maxCount);
            return { blockid: data.blockid, elements: elements || [], count: (elements || []).length };
        } catch (e) {
            return { blockid: data.blockid, elements: [], count: 0 };
        }
    }

    async handle_widgetinspect(rh: RpcResponseHelper, data: CommandWidgetInspectData): Promise<WidgetInspectRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return {
                blockid: data.blockid,
                elementref: data.elementref,
                role: "",
                name: "",
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                focusable: false,
                visible: false,
                enabled: false,
            };
        }
        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            const element = this.rendererElementByRef(root, data.elementref || "");
            if (element) {
                const rootRect = root.getBoundingClientRect();
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return {
                    blockid: data.blockid,
                    elementref: data.elementref,
                    role: element.getAttribute("role") || element.tagName.toLowerCase(),
                    name:
                        element.getAttribute("aria-label") ||
                        (element as HTMLInputElement).name ||
                        element.textContent?.trim().slice(0, 80) ||
                        "",
                    x: Math.round(rect.x - rootRect.x),
                    y: Math.round(rect.y - rootRect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    focusable: !(element as HTMLInputElement).disabled && element.tabIndex >= 0,
                    visible:
                        rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
                    enabled: !(element as HTMLInputElement).disabled,
                };
            }
            return {
                blockid: data.blockid,
                elementref: data.elementref,
                role: "",
                name: "",
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                focusable: false,
                visible: false,
                enabled: false,
            };
        }
        try {
            const ref = data.elementref || "";
            const result = await webview.executeJavaScript(`
                (function() {
                    var ref = ${JSON.stringify(ref)};
                    var el = null;
                    if (ref) {
                        el = ${browserElementResolverSource()}(ref);
                    }
                    if (!el) return null;
                    var rect = el.getBoundingClientRect();
                    return {
                        role: el.getAttribute('role') || el.tagName.toLowerCase(),
                        name: el.getAttribute('aria-label') || el.name || el.textContent?.substring(0, 80) || '',
                        value: el.value || '',
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        focusable: !el.disabled && el.tabIndex >= 0,
                        visible: rect.width > 0 && rect.height > 0,
                        enabled: !el.disabled
                    };
                })()
            `);
            if (!result) {
                return {
                    blockid: data.blockid,
                    elementref: data.elementref,
                    role: "",
                    name: "",
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 0,
                    focusable: false,
                    visible: false,
                    enabled: false,
                };
            }
            return {
                blockid: data.blockid,
                elementref: data.elementref,
                role: result.role || "",
                name: result.name || "",
                x: result.x || 0,
                y: result.y || 0,
                width: result.width || 0,
                height: result.height || 0,
                focusable: result.focusable || false,
                visible: result.visible || false,
                enabled: result.enabled || false,
            };
        } catch (e) {
            return {
                blockid: data.blockid,
                elementref: data.elementref,
                role: "",
                name: "",
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                focusable: false,
                visible: false,
                enabled: false,
            };
        }
    }

    async handle_widgetelementat(
        rh: RpcResponseHelper,
        data: CommandWidgetElementAtData
    ): Promise<WidgetElementAtRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, x: data.x, y: data.y, found: false };
        }
        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            const rootRect = root.getBoundingClientRect();
            const rendererX = data.x <= rootRect.width ? rootRect.x + data.x : data.x;
            const rendererY = data.y <= rootRect.height ? rootRect.y + data.y : data.y;
            const element = document.elementFromPoint(rendererX, rendererY);
            if (!(element instanceof HTMLElement) || !root.contains(element)) {
                return { blockid: data.blockid, x: data.x, y: data.y, found: false };
            }
            let ref =
                element.id ||
                (element as HTMLInputElement).name ||
                element.getAttribute("aria-label") ||
                element.getAttribute("data-wave-ref");
            if (!ref) {
                ref = "kronterm-ref-element-at";
                element.setAttribute("data-wave-ref", ref);
            }
            return {
                blockid: data.blockid,
                x: data.x,
                y: data.y,
                found: true,
                elementref: ref,
                role: element.getAttribute("role") || element.tagName.toLowerCase(),
                name:
                    element.getAttribute("aria-label") ||
                    (element as HTMLInputElement).name ||
                    element.textContent?.trim().slice(0, 80) ||
                    "",
            };
        }
        try {
            const result = await webview.executeJavaScript(`
                (function() {
                    var x = ${data.x};
                    var y = ${data.y};
                    var el = document.elementFromPoint(x, y);
                    if (!el) return null;
                    var rect = el.getBoundingClientRect();
                    var ref = el.id || el.name || el.getAttribute('aria-label') || el.getAttribute('data-wave-ref');
                    if (!ref) {
                        ref = 'wave-ref-element-at';
                        el.setAttribute('data-wave-ref', ref);
                    }
                    return {
                        ref: ref,
                        role: el.getAttribute('role') || el.tagName.toLowerCase(),
                        name: el.getAttribute('aria-label') || el.name || el.textContent?.substring(0, 80) || '',
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    };
                })()
            `);
            if (!result) {
                return { blockid: data.blockid, x: data.x, y: data.y, found: false };
            }
            return {
                blockid: data.blockid,
                x: data.x,
                y: data.y,
                found: true,
                elementref: result.ref,
                role: result.role,
                name: result.name,
            };
        } catch (e) {
            return { blockid: data.blockid, x: data.x, y: data.y, found: false };
        }
    }

    async handle_widgetclick(rh: RpcResponseHelper, data: CommandWidgetClickData): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        return this.executeBrowserInteraction(data.blockid, "click", {
            elementref: data.elementref,
            x: data.x,
            y: data.y,
            button: data.button,
            clicktype: data.clicktype,
        });
    }

    async handle_widgethover(rh: RpcResponseHelper, data: CommandWidgetHoverData): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        return this.executeBrowserInteraction(data.blockid, "hover", {
            elementref: data.elementref,
            x: data.x,
            y: data.y,
        });
    }

    async handle_widgetlongpress(
        rh: RpcResponseHelper,
        data: CommandWidgetLongPressData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        return this.executeBrowserInteraction(data.blockid, "longpress", {
            elementref: data.elementref,
            x: data.x,
            y: data.y,
            duration: data.duration,
        });
    }

    async handle_widgetdrag(rh: RpcResponseHelper, data: CommandWidgetDragData): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        return this.executeBrowserInteraction(data.blockid, "drag", {
            startref: data.startref,
            startx: data.startx,
            starty: data.starty,
            endref: data.endref,
            endx: data.endx,
            endy: data.endy,
            button: data.button,
        });
    }

    async handle_widgetscrollto(
        rh: RpcResponseHelper,
        data: CommandWidgetScrollToData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        return this.executeBrowserInteraction(data.blockid, "scroll-to", {
            elementref: data.elementref,
            x: data.x,
            y: data.y,
        });
    }

    async handle_widgetgetvalue(
        rh: RpcResponseHelper,
        data: CommandWidgetGetValueData
    ): Promise<WidgetGetValueRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, elementref: data.elementref, value: "" };
        }
        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            const element = this.rendererElementByRef(root, data.elementref || "");
            const value =
                element && "value" in element
                    ? String((element as HTMLInputElement).value ?? "")
                    : element?.textContent || "";
            return { blockid: data.blockid, elementref: data.elementref, value };
        }
        try {
            const ref = data.elementref || "";
            const value = await webview.executeJavaScript(`
                (function() {
                    var ref = ${JSON.stringify(ref)};
                    var el = null;
                    if (ref) {
                        el = ${browserElementResolverSource()}(ref);
                    }
                    if (!el) return '';
                    if (el.tagName === 'SELECT') return el.value || '';
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || '';
                    return el.textContent || '';
                })()
            `);
            return { blockid: data.blockid, elementref: data.elementref, value: value || "" };
        } catch (e) {
            return { blockid: data.blockid, elementref: data.elementref, value: "" };
        }
    }

    async handle_widgetsetvalue(
        rh: RpcResponseHelper,
        data: CommandWidgetSetValueData
    ): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        try {
            const root = await this.focusWidgetForAgent(data.blockid);
            const webview = root.querySelector("webview") as Electron.WebviewTag | null;
            if (!webview) {
                const target = this.rendererTarget(root, data.elementref, undefined, undefined)?.target;
                if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
                    return { blockid: data.blockid, success: false, message: "Element does not accept text input" };
                }
                const prototype =
                    target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, data.value);
                target.dispatchEvent(
                    new InputEvent("input", { bubbles: true, inputType: "insertText", data: data.value })
                );
                target.dispatchEvent(new Event("change", { bubbles: true }));
                return { blockid: data.blockid, success: true, message: "Value set" };
            }
            const result = await webview.executeJavaScript(`
                (function() {
                    var ref = ${JSON.stringify(data.elementref || "")};
                    var value = ${JSON.stringify(data.value)};
                    var el = ${browserElementResolverSource()}(ref);
                    if (!el) return { success: false, message: 'Element not found' };
                    if (el.disabled || el.readOnly) return { success: false, message: 'Text control is disabled or read-only' };
                    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
                        return { success: false, message: 'Element does not accept text input' };
                    }
                    var proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                    var setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    setter?.call(el, value);
                    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    return { success: true, message: 'Value set' };
                })()
            `);
            return {
                blockid: data.blockid,
                success: !!result?.success,
                message: result?.message ?? "Failed to set value",
            };
        } catch (e) {
            return { blockid: data.blockid, success: false, message: `Failed to set value: ${e}` };
        }
    }

    async handle_widgetclear(rh: RpcResponseHelper, data: CommandWidgetClearData): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        try {
            const root = await this.focusWidgetForAgent(data.blockid);
            const webview = root.querySelector("webview") as Electron.WebviewTag | null;
            if (webview) {
                const result = (await webview.executeJavaScript(`
                    (() => {
                        const ref = ${JSON.stringify(data.elementref || "")};
                        const target = ${browserElementResolverSource()}(ref);
                        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
                            return false;
                        }
                        if (target.disabled || target.readOnly) return false;
                        target.focus();
                        target.select();
                        return true;
                    })()
                `)) as boolean;
                if (!result) {
                    return { blockid: data.blockid, success: false, message: "Text element not found" };
                }
                await this.sendKeyChord(webview, ["CommandOrControl", "A"]);
                await webview.insertText("");
                await this.sendKeyChord(webview, ["Backspace"]);
                return { blockid: data.blockid, success: true, message: "Value cleared" };
            }
            const target = this.rendererTarget(root, data.elementref, undefined, undefined)?.target;
            if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
                return { blockid: data.blockid, success: false, message: "Text element not found" };
            }
            const prototype =
                target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, "");
            target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
            target.dispatchEvent(new Event("change", { bubbles: true }));
            return { blockid: data.blockid, success: true, message: "Value cleared" };
        } catch (e) {
            return { blockid: data.blockid, success: false, message: `Failed to clear: ${e}` };
        }
    }

    async handle_widgetselect(rh: RpcResponseHelper, data: CommandWidgetSelectData): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        try {
            const root = await this.focusWidgetForAgent(data.blockid);
            const webview = root.querySelector("webview") as Electron.WebviewTag | null;
            if (!webview) {
                const target = this.rendererTarget(root, data.elementref, undefined, undefined)?.target;
                if (!(target instanceof HTMLSelectElement)) {
                    return { blockid: data.blockid, success: false, message: "Select element not found" };
                }
                const option = Array.from(target.options).find(
                    (item) => item.value === data.option || item.text === data.option
                );
                if (!option) {
                    return { blockid: data.blockid, success: false, message: "Option not found" };
                }
                Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(target, option.value);
                target.dispatchEvent(new Event("input", { bubbles: true }));
                target.dispatchEvent(new Event("change", { bubbles: true }));
                return { blockid: data.blockid, success: true, message: "Select executed" };
            }
            const result = await webview.executeJavaScript(`
                (function() {
                    var ref = ${JSON.stringify(data.elementref || "")};
                    var requested = ${JSON.stringify(data.option)};
                    var el = ${browserElementResolverSource()}(ref);
                    if (!(el instanceof HTMLSelectElement)) {
                        return { success: false, message: 'Select element not found' };
                    }
                    if (el.disabled) return { success: false, message: 'Select is disabled' };
                    var option = Array.from(el.options).find(function(item) {
                        return item.value === requested || item.text === requested;
                    });
                    if (!option) return { success: false, message: 'Option not found' };
                    el.value = option.value;
                    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    return { success: true, message: 'Select executed' };
                })()
            `);
            return {
                blockid: data.blockid,
                success: !!result?.success,
                message: result?.message ?? "Failed to select",
            };
        } catch (e) {
            return { blockid: data.blockid, success: false, message: `Failed to select: ${e}` };
        }
    }

    async handle_widgettoggle(rh: RpcResponseHelper, data: CommandWidgetToggleData): Promise<WidgetMouseActionRtnData> {
        const layoutModel = getLayoutModelForStaticTab();
        if (!layoutModel) {
            throw new Error("Layout model not found");
        }
        const node = layoutModel.getNodeByBlockId(data.blockid);
        if (!node && !this.widgetRoot(data.blockid)) {
            return { blockid: data.blockid, success: false, message: `Block not found: ${data.blockid}` };
        }
        return this.executeBrowserInteraction(data.blockid, "click", { elementref: data.elementref });
    }

    async handle_widgetclipboardget(
        rh: RpcResponseHelper,
        data: CommandWidgetClipboardGetData
    ): Promise<WidgetClipboardGetRtnData> {
        try {
            await this.focusWidgetForAgent(data.blockid);
            const text = await getApi().readClipboard();
            return { blockid: data.blockid, text };
        } catch (e) {
            return { blockid: data.blockid, text: "" };
        }
    }

    async handle_widgetclipboardset(
        rh: RpcResponseHelper,
        data: CommandWidgetClipboardSetData
    ): Promise<WidgetMouseActionRtnData> {
        try {
            await this.focusWidgetForAgent(data.blockid);
            await getApi().writeClipboard(data.text);
            return { blockid: data.blockid, success: true, message: "Clipboard set" };
        } catch (e) {
            return { blockid: data.blockid, success: false, message: `Failed to set clipboard: ${e}` };
        }
    }

    async handle_widgetwaitcondition(
        rh: RpcResponseHelper,
        data: CommandWidgetWaitConditionData
    ): Promise<WidgetWaitConditionRtnData> {
        const startTime = Date.now();
        const timeout = data.timeoutms || 10000;
        const condition = data.condition || "";
        const elementref = data.elementref || "";

        const root = this.observeWidgetForAgent(data.blockid);
        const webview = root.querySelector("webview") as Electron.WebviewTag | null;
        if (!webview) {
            while (Date.now() - startTime < timeout) {
                if (this.rendererCondition(root, elementref, condition)) {
                    return {
                        blockid: data.blockid,
                        condition,
                        met: true,
                        wait_time_ms: Date.now() - startTime,
                        message: "Condition met",
                    };
                }
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            return {
                blockid: data.blockid,
                condition,
                met: false,
                wait_time_ms: Date.now() - startTime,
                message: "Element wait timeout - condition not met",
            };
        }

        while (Date.now() - startTime < timeout) {
            try {
                const checkResult = await webview.executeJavaScript(browserWaitConditionScript(elementref, condition));
                if (checkResult) {
                    return {
                        blockid: data.blockid,
                        condition,
                        met: true,
                        wait_time_ms: Date.now() - startTime,
                        message: "Condition met",
                    };
                }
            } catch (_) {
                // webview may not be ready yet, keep polling
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
        }

        return {
            blockid: data.blockid,
            condition,
            met: false,
            wait_time_ms: Date.now() - startTime,
            message: "Condition timeout",
        };
    }
}
