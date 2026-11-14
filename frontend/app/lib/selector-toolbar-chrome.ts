// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export const SelectorToolbarStyles = `
[data-react-grab-toolbar-panel]{--rg-panel-bg:#000;--rg-text-primary:#fff;--rg-text-secondary:#bfbfbf;color:#fff;color-scheme:dark;padding:3px 4px!important;border-radius:7px!important;max-width:calc(100vw - 32px);box-sizing:border-box}
[data-react-grab-toolbar-panel]>div,[data-react-grab-toolbar-panel]>button{zoom:1.09375}
[data-react-grab-toolbar-panel],[data-react-grab-toolbar-panel]>div>div,[data-react-grab-toolbar-panel]>div>div>div{flex-direction:row!important;align-items:center}
[data-react-grab-toolbar-panel]>button[aria-expanded="false"]{zoom:1;width:24px;height:24px;min-width:24px;min-height:24px}
:host-context([data-kronterm-selector-edge="top"]) [data-react-grab-toolbar]:has(button[aria-expanded="false"]){transform:translateX(-50%)!important;left:clamp(24px,var(--kronterm-selector-position,50vw),calc(100vw - 24px))!important;top:8px!important;bottom:auto!important}
:host-context([data-kronterm-selector-edge="bottom"]) [data-react-grab-toolbar]:has(button[aria-expanded="false"]){transform:translateX(-50%)!important;left:clamp(24px,var(--kronterm-selector-position,50vw),calc(100vw - 24px))!important;top:auto!important;bottom:8px!important}
[data-kronterm-canvas-drag]{display:inline-flex;align-items:center;justify-content:center;width:20px;align-self:stretch;color:inherit;cursor:grab;touch-action:none;user-select:none}
[data-kronterm-canvas-tools-slot]{display:inline-flex;align-items:center;gap:4px;pointer-events:auto;color:#fff;--kronterm-canvas-tool-color:#fff;flex-shrink:0}
[data-kronterm-canvas-tools-slot]>*,[data-kronterm-canvas-tools-slot] [role="toolbar"],[data-kronterm-canvas-tools-slot] .os-canvas-toolbar{display:inline-flex;align-items:center;flex-direction:row;gap:4px;position:static;transform:none;margin:0;padding:0;border:0;box-shadow:none;background:transparent}
[data-kronterm-canvas-tools-slot] .os-canvas-tool-rail.is-in-selector{display:inline-flex;align-items:center;flex-direction:row;position:static;gap:4px;border:0;padding:0;margin:0;box-shadow:none;max-height:none;overflow:visible;background:transparent}
[data-kronterm-canvas-tools-slot] .os-canvas-tool-rail.is-closed{display:none!important}
[data-kronterm-canvas-tools-slot] .os-canvas-toolbar{display:inline-flex;align-items:center;flex-direction:row;gap:2px}
[data-kronterm-canvas-tools-slot] .os-canvas-toolbar-separator{display:block;width:1px;height:18px;margin:0 2px;background:rgba(255,255,255,.25)}
[data-kronterm-canvas-tools-slot] .os-original-canvas-tools{display:block;width:auto;flex-shrink:0}
[data-kronterm-canvas-tools-slot] button{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;width:28px;height:28px;min-width:28px;min-height:28px;padding:4px;border:0;border-radius:6px;background:transparent;color:#fff;cursor:pointer}
[data-kronterm-canvas-tools-slot] button:hover,[data-kronterm-canvas-tools-slot] button[aria-pressed="true"]{background:rgba(255,255,255,.18)}
[data-kronterm-canvas-tools-slot] button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
[data-kronterm-canvas-tools-slot] svg{width:16px;height:16px;flex-shrink:0}
`;

export function installSelectorToolbarChrome(
    stylesText: string,
    publish: (target: HTMLElement) => void = () => {}
): () => void {
    let disposed = false;
    let ownedSlot: HTMLElement;
    let ownedGrip: HTMLElement;
    const shadows = new Map<ShadowRoot, MutationObserver>();
    const styles = new Map<ShadowRoot, HTMLStyleElement>();
    const fallbackSheets = new Map<ShadowRoot, CSSStyleSheet[]>();
    const discover = () => {
        if (disposed) return;
        let container: Element;
        for (const host of document.querySelectorAll("[data-react-grab]")) {
            const shadow = host.shadowRoot;
            if (!shadow) continue;
            if (!shadows.has(shadow)) {
                const observer = new MutationObserver(discover);
                observer.observe(shadow, { childList: true, subtree: true });
                shadows.set(shadow, observer);
            }
            const panel = shadow.querySelector("[data-react-grab-toolbar-panel]");
            const buttons = panel?.firstElementChild?.firstElementChild?.firstElementChild;
            if (buttons instanceof HTMLElement) {
                container = buttons;
                break;
            }
        }
        if (ownedSlot?.isConnected && ownedSlot.parentElement === container) return;
        if (ownedSlot) {
            ownedGrip?.remove();
            ownedSlot.remove();
            ownedSlot = undefined;
            publish(null);
        }
        if (!(container instanceof HTMLElement)) return;
        const shadow = container.getRootNode() as ShadowRoot;
        if (!styles.has(shadow)) {
            const style = document.createElement("style");
            style.dataset.krontermCanvasToolsStyle = "";
            style.textContent = stylesText;
            shadow.append(style);
            styles.set(shadow, style);
            // Browser guests can block inline styles in the shadow root through CSP.
            const blocked = Array.from(shadow.querySelectorAll("style")).filter((node) => node.sheet == null);
            if (
                blocked.length &&
                shadow.adoptedStyleSheets &&
                typeof CSSStyleSheet.prototype.replaceSync === "function"
            ) {
                const sheets = blocked.map((node) => {
                    const sheet = new CSSStyleSheet();
                    sheet.replaceSync(node.textContent.replace(/^\s*@import[^;]+;/, ""));
                    return sheet;
                });
                shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, ...sheets];
                fallbackSheets.set(shadow, sheets);
            }
        }
        ownedSlot = document.createElement("div");
        ownedSlot.dataset.krontermCanvasToolsSlot = "";
        ownedSlot.setAttribute("data-react-grab-ignore-events", "");
        const grip = document.createElement("span");
        ownedGrip = grip;
        grip.dataset.krontermCanvasDrag = "";
        grip.textContent = "::";
        grip.title = "Drag selector toolbar to an edge";
        grip.setAttribute("aria-hidden", "true");
        container.append(grip);
        container.append(ownedSlot);
        publish(ownedSlot);
    };
    const documentObserver = new MutationObserver(discover);
    documentObserver.observe(document.body, { childList: true, subtree: true });
    discover();
    return () => {
        if (disposed) return;
        disposed = true;
        documentObserver.disconnect();
        shadows.forEach((observer) => observer.disconnect());
        if (ownedSlot) publish(null);
        ownedSlot?.remove();
        ownedGrip?.remove();
        styles.forEach((style) => style.remove());
        fallbackSheets.forEach((sheets, shadow) => {
            shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((sheet) => !sheets.includes(sheet));
        });
    };
}
