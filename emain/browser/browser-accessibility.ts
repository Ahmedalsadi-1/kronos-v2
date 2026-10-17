import type { WebContents } from "electron";

export async function browserAccessibilitySnapshot(guest: WebContents): Promise<WidgetElementData[]> {
    // Leave an existing DevTools/debugger session untouched and let the renderer use its DOM fallback.
    if (guest.debugger.isAttached()) throw new Error("Browser debugger is busy");
    guest.debugger.attach("1.3");
    try {
        const { nodes } = await guest.debugger.sendCommand("Accessibility.getFullAXTree");
        const elements: WidgetElementData[] = [];
        const roles = new Set([
            "button",
            "link",
            "textbox",
            "searchbox",
            "checkbox",
            "radio",
            "combobox",
            "slider",
            "spinbutton",
            "switch",
            "tab",
            "menuitem",
            "treeitem",
            "Canvas",
        ]);
        for (const node of nodes) {
            if (elements.length >= 250) break;
            if (node.ignored || !node.backendDOMNodeId || !roles.has(node.role?.value)) continue;
            const { object } = await guest.debugger.sendCommand("DOM.resolveNode", {
                backendNodeId: node.backendDOMNodeId,
                objectGroup: "kron-browser-observation",
            });
            if (!object?.objectId) continue;
            const result = await guest.debugger.sendCommand("Runtime.callFunctionOn", {
                objectId: object.objectId,
                returnByValue: true,
                functionDeclaration: `function() {
                    if (!(this instanceof Element) || !this.isConnected || this.getRootNode() !== document) return null;
                    if (this.closest('[hidden],[inert],[aria-hidden="true"]')) return null;
                    const r = this.getBoundingClientRect(), style = getComputedStyle(this);
                    if (!r.width || !r.height || style.visibility !== 'visible' || style.display === 'none') return null;
                    let ref = this.getAttribute('data-wave-ref');
                    if (!ref) { ref = 'wave-ref-' + crypto.randomUUID(); this.setAttribute('data-wave-ref', ref); }
                    return {ref, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
                        focusable: !this.disabled && this.tabIndex >= 0, visible: true,
                        password: this.matches('input[type=password]')};
                }`,
            });
            const point = result.result?.value;
            if (!point) continue;
            const { password, ...geometry } = point;
            elements.push({
                ...geometry,
                role: node.role.value,
                name: String(node.name?.value ?? "").slice(0, 200),
                value: password ? "" : String(node.value?.value ?? "").slice(0, 200),
            });
        }
        return elements;
    } finally {
        if (!guest.isDestroyed() && guest.debugger.isAttached()) {
            await guest.debugger
                .sendCommand("Runtime.releaseObjectGroup", { objectGroup: "kron-browser-observation" })
                .catch(() => {});
            guest.debugger.detach();
        }
    }
}
