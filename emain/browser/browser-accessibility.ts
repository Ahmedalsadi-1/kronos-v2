import type { WebContents } from "electron";

export async function browserAccessibilitySnapshot(guest: WebContents): Promise<WidgetElementData[]> {
    // Leave an existing DevTools/debugger session untouched and let the renderer use its DOM fallback.
    if (guest.debugger.isAttached()) throw new Error("Browser debugger is busy");
    guest.debugger.attach("1.3");
    let ownsSession = true;
    const detached = () => {
        ownsSession = false;
    };
    guest.debugger.on?.("detach", detached);
    const deadline = Date.now() + 5000;
    const command = async (method: string, params?: Record<string, unknown>) => {
        let timer: ReturnType<typeof setTimeout>;
        try {
            return await Promise.race([
                guest.debugger.sendCommand(method, params),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error("Browser accessibility snapshot deadline exceeded")),
                        Math.max(1, deadline - Date.now())
                    );
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    };
    try {
        const { nodes } = await command("Accessibility.getFullAXTree");
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
            if (!ownsSession || guest.isDestroyed() || Date.now() >= deadline) break;
            try {
                const { object } = await command("DOM.resolveNode", {
                    backendNodeId: node.backendDOMNodeId,
                    objectGroup: "kron-browser-observation",
                });
                if (!object?.objectId) continue;
                const result = await command("Runtime.callFunctionOn", {
                    objectId: object.objectId,
                    returnByValue: true,
                    functionDeclaration: `function() {
                    if (!(this instanceof Element) || !this.isConnected || window !== window.top) return null;
                    for (let ancestor = this; ancestor; ancestor = ancestor.parentElement || ancestor.getRootNode().host) {
                        if (ancestor.matches('[hidden],[inert],[aria-hidden="true"]')) return null;
                    }
                    const r = this.getBoundingClientRect(), style = getComputedStyle(this);
                    if (!r.width || !r.height || style.visibility !== 'visible' || style.display === 'none') return null;
                    let ref = this.getAttribute('data-wave-ref');
                    if (!ref) { ref = 'wave-ref-' + crypto.randomUUID(); this.setAttribute('data-wave-ref', ref); }
                    return {ref, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
                        focusable: !this.disabled && this.tabIndex >= 0, visible: r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight,
                        password: this.matches('input[type=password]')};
                }`,
                });
                const point = result.result?.value;
                if (!point) continue;
                const { password, ...geometry } = point;
                elements.push({
                    ...geometry,
                    role: String(node.role.value).toLowerCase(),
                    name: String(node.name?.value ?? "").slice(0, 200),
                    value: password ? "" : String(node.value?.value ?? "").slice(0, 200),
                });
            } catch {
                // A detached DOM node must not discard the other usable accessibility targets.
            }
        }
        return elements;
    } finally {
        if (ownsSession && !guest.isDestroyed() && guest.debugger.isAttached()) {
            await command("Runtime.releaseObjectGroup", { objectGroup: "kron-browser-observation" }).catch(() => {});
            if (ownsSession && guest.debugger.isAttached()) guest.debugger.detach();
        }
        guest.debugger.removeListener?.("detach", detached);
    }
}
