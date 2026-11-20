// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WebContents } from "electron";
import { installSelectorToolbarChrome, SelectorToolbarStyles } from "../frontend/app/lib/selector-toolbar-chrome";
import ReactGrabSource from "../node_modules/react-grab/dist/index.global.js?raw";
import ReactGrabStyles from "../node_modules/react-grab/dist/styles.css?raw";
import { clampGrabPayload } from "./browser/browser-grab-payload";
import { buildBrowserElementExtractor } from "./browser/grab-guest-script";

const BrowserSelectorStyles = `${SelectorToolbarStyles}
[data-react-grab-toolbar], [data-react-grab-toolbar-panel] { display: none !important; }
[data-react-grab-selection-label]:has(textarea[data-react-grab-input]),
[data-react-grab-edit-panel] {
    --rg-panel-bg: #202020;
    --rg-text-primary: #f3f3f3;
    --rg-text-secondary: #bdbdbd;
    --rg-border-subtle: #ffffff24;
    --rg-surface-hover: #ffffff18;
    --rg-surface-active: #ffffff24;
    --rg-submit-bg: #171717;
    color-scheme: dark;
}
`;

const SelectionMessage = "kronterm:browser-element-selection";
const ObservedGuests = new WeakSet<WebContents>();

export function browserElementToolScript(): string {
    return `(() => {
        if (window.__KRONTERM_BROWSER_ELEMENT_TOOL__) return;
        const disabled = window.__REACT_GRAB_DISABLED__;
        window.__REACT_GRAB_DISABLED__ = true;
        try {
            ${ReactGrabSource}
            const api = window.__REACT_GRAB__ ?? window.__REACT_GRAB_MODULE__.init({
                telemetry: false, freezeReactUpdates: false
            });
            window.__REACT_GRAB_MODULE__.setGlobalApi(api);
            const extract = ${buildBrowserElementExtractor()};
            api.setOptions({
                getContent: (elements) => elements.slice(0, 3).map((element) => JSON.stringify(extract(element))).join("\\n"),
            });
            let pendingSelection;
            let picker;
            const annotate = () => {
                const controller = new AbortController();
                const options = { capture: true, signal: controller.signal };
                const box = document.createElement("div");
                box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;display:none;border:1px solid #a88aff;background:#a88aff26;box-sizing:border-box";
                document.documentElement.append(box);
                let start, paused = false;
                const cancel = () => { start = undefined; box.style.display = "none"; };
                const stop = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
                const region = (event) => new DOMRect(Math.min(start.x, event.clientX), Math.min(start.y, event.clientY),
                    Math.abs(start.x - event.clientX), Math.abs(start.y - event.clientY));
                const draw = ({x,y,width,height}) => Object.assign(box.style, {
                    display:"block", left:x+"px", top:y+"px", width:width+"px", height:height+"px"
                });
                window.addEventListener("keydown", (event) => {
                    if (event.code === "Space") { paused = true; cancel(); stop(event); }
                }, options);
                window.addEventListener("keyup", (event) => {
                    if (event.code === "Space") { paused = false; stop(event); }
                }, options);
                window.addEventListener("blur", () => { paused = false; cancel(); }, options);
                window.addEventListener("pointercancel", cancel, options);
                window.addEventListener("pointerdown", (event) => {
                    if (paused || event.button !== 0 || !event.isPrimary) return;
                    start = { x:event.clientX, y:event.clientY, id:event.pointerId };
                    stop(event);
                }, options);
                window.addEventListener("pointermove", (event) => {
                    if (paused || !event.isPrimary) return;
                    if (start?.id === event.pointerId) { draw(region(event)); stop(event); return; }
                    const element = document.elementFromPoint(event.clientX, event.clientY);
                    if (element) draw(element.getBoundingClientRect());
                }, options);
                window.addEventListener("pointerup", (event) => {
                    if (paused || start?.id !== event.pointerId) return;
                    const {x,y,width,height} = region(event);
                    cancel();
                    stop(event);
                    const area = width >= 5 && height >= 5;
                    const element = area ? document.documentElement : document.elementFromPoint(event.clientX, event.clientY);
                    if (!element) return;
                    const payload = extract(element);
                    if (!payload) return;
                    if (area) Object.assign(payload.target, {
                        textSnippet:"Selected page area", rectViewport:{x,y,width,height},
                        rectPage:{x:x+scrollX,y:y+scrollY,width,height},
                    });
                    payload.target.annotationPoint = { x: event.clientX, y: event.clientY };
                    pendingSelection = { intent:"annotate", payload, comment:"" };
                    console.debug(${JSON.stringify(SelectionMessage)});
                }, options);
                window.addEventListener("click", (event) => { if (!paused) stop(event); }, options);
                return () => { controller.abort(); box.remove(); };
            };
            const copiedContext = new WeakMap();
            api.registerPlugin({
                name: "kronterm-browser-selection",
                hooks: {
                    transformCopyContent: (content, elements) => {
                        if (elements[0]) copiedContext.set(elements[0], content);
                        return content;
                    },
                    onCopySuccess: (elements, text) => {
                        const element = elements[0];
                        const context = element && copiedContext.get(element);
                        if (!context) return;
                        copiedContext.delete(element);
                        const suffix = "\\n" + context;
                        const comment = text.endsWith(suffix) ? text.slice(0, -suffix.length).trim().slice(0, 2000) : "";
                        pendingSelection = { intent: comment ? "annotate" : "grab", payload: extract(element), comment };
                        console.debug(${JSON.stringify(SelectionMessage)});
                    },
                },
            });
            (${installSelectorToolbarChrome.toString()})(${JSON.stringify(BrowserSelectorStyles)});
            const syncEdge = (state) => {
                document.documentElement.dataset.krontermSelectorEdge = state.edge;
                document.documentElement.style.setProperty("--kronterm-selector-position", state.ratio * 100 + "vw");
            };
            api.onToolbarStateChange(syncEdge);
            api.setToolbarState({ enabled: true, collapsed: false, edge: "bottom", ratio: 0.5 });
            window.__KRONTERM_BROWSER_ELEMENT_TOOL__ = {
                setIntent: (intent) => {
                    picker?.();
                    picker = undefined;
                    api.deactivate();
                    if (intent) api.setToolbarState({ enabled: true, collapsed: false });
                    if (intent === "grab") api.activate();
                    if (intent === "annotate") picker = annotate();
                    if (intent === "style") {
                        const toolbar = document.querySelector("[data-react-grab]")?.shadowRoot;
                        const button = toolbar?.querySelector('[data-react-grab-toolbar-action="edit"]');
                        if (!button) return false;
                        button.click();
                    }
                    return true;
                },
                consume: () => {
                    const selection = pendingSelection;
                    pendingSelection = undefined;
                    return selection;
                },
            };
        } finally {
            if (disabled === undefined) delete window.__REACT_GRAB_DISABLED__;
            else window.__REACT_GRAB_DISABLED__ = disabled;
        }
    })()`;
}

export async function installBrowserElementTool(guest: WebContents): Promise<void> {
    if (guest.isDestroyed() || guest.getType() !== "webview") return;
    const url = URL.parse(guest.getURL());
    if (!url || !["http:", "https:", "file:"].includes(url.protocol)) return;
    await guest.insertCSS(ReactGrabStyles);
    if (guest.isDestroyed()) return;
    if (!ObservedGuests.has(guest)) {
        ObservedGuests.add(guest);
        let reading = false;
        guest.on("console-message", async (event) => {
            if (reading || event.frame !== guest.mainFrame || event.message !== SelectionMessage) return;
            const host = guest.hostWebContents;
            if (!host || host.isDestroyed()) return;
            reading = true;
            try {
                const raw = await guest.executeJavaScript(
                    "JSON.stringify(window.__KRONTERM_BROWSER_ELEMENT_TOOL__?.consume?.() ?? null).slice(0, 65537)"
                );
                if (typeof raw !== "string" || raw.length > 65_536 || raw === "null") return;
                const { intent, payload, comment } = JSON.parse(raw);
                if (intent !== "grab" && intent !== "annotate") return;
                const selection = clampGrabPayload(payload);
                const page = clampGrabPayload({ page: { sanitizedUrl: guest.getURL() }, target: {} });
                if (
                    !selection?.target.selector ||
                    !selection.target.tagName ||
                    selection.page.sanitizedUrl !== page?.page.sanitizedUrl ||
                    host.isDestroyed()
                )
                    return;
                host.send(
                    "browser-element-selection",
                    guest.id,
                    intent,
                    selection,
                    typeof comment === "string" ? comment.slice(0, 2000) : ""
                );
            } catch {
                // Page console output is untrusted and never submits an agent prompt.
            } finally {
                reading = false;
            }
        });
    }
    await guest.executeJavaScript(browserElementToolScript());
}
