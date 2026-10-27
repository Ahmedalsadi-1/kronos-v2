// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function browserObservationScript(limit = 50): string {
    return `(${observeBrowserDocument.toString()})(${JSON.stringify(limit)})`;
}

function observeBrowserDocument(limit: number) {
    const stateKey = "__kronBrowserObservation";
    const state = (window[stateKey] ??= { refs: new WeakMap(), prefix: crypto.randomUUID(), next: 0 });
    const selector =
        'a[href], button, input, select, textarea, summary, canvas, [draggable="true"], [contenteditable="true"], [role], [tabindex], [onclick], [aria-label]';
    const roots: (Document | ShadowRoot)[] = [document];
    const candidates: HTMLElement[] = [];
    let scanned = 0;
    for (const root of roots) {
        for (const element of root.querySelectorAll<HTMLElement>("*")) {
            if (++scanned > 20000) break;
            if (element.shadowRoot) roots.push(element.shadowRoot);
            if (element.matches(selector)) candidates.push(element);
        }
        if (scanned > 20000) break;
    }
    const inViewport = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    candidates.sort((a, b) => Number(inViewport(b)) - Number(inViewport(a)));
    const hidden = (el: Element) => {
        let ancestor: Element = el;
        while (ancestor) {
            if (ancestor.matches('[hidden], [inert], [aria-hidden="true"]')) return true;
            ancestor = ancestor.parentElement ?? (ancestor.getRootNode() as ShadowRoot).host;
        }
        return false;
    };
    const result = [];
    for (const el of candidates) {
        if (result.length >= limit) break;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            style.display === "none" ||
            style.visibility !== "visible" ||
            hidden(el)
        )
            continue;
        let ref = state.refs.get(el) || el.getAttribute("data-wave-ref");
        if (!ref) {
            ref = "wave-ref-" + state.prefix + "-" + state.next++;
        }
        state.refs.set(el, ref);
        el.setAttribute("data-wave-ref", ref);
        const labelledBy = (el.getAttribute("aria-labelledby") || "")
            .split(/\s+/)
            .map((id) => (el.getRootNode() as Document | ShadowRoot).getElementById(id)?.textContent || "")
            .join(" ")
            .trim();
        const control = el as HTMLInputElement;
        const labels = Array.from(control.labels || [])
            .map((label) => label.textContent || "")
            .join(" ");
        const tag = el.tagName.toLowerCase();
        const roles = { a: "link", button: "button", textarea: "textbox", select: "combobox", summary: "button" };
        const inputRole =
            control.type === "checkbox"
                ? "checkbox"
                : control.type === "radio"
                  ? "radio"
                  : ["button", "submit", "reset"].includes(control.type)
                    ? "button"
                    : "textbox";
        result.push({
            ref,
            role: el.getAttribute("role") || roles[tag] || (tag === "input" ? inputRole : tag),
            name: (
                labelledBy ||
                el.getAttribute("aria-label") ||
                labels ||
                el.textContent?.trim() ||
                el.getAttribute("placeholder") ||
                el.getAttribute("name") ||
                ""
            ).slice(0, 80),
            value: control.type === "password" ? "" : String(control.value || "").slice(0, 200),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            focusable: !control.disabled && el.tabIndex >= 0,
            visible: inViewport(el),
        });
    }
    return result;
}

export function browserElementResolverSource(): string {
    return `(${resolveBrowserElement.toString()})`;
}

function resolveBrowserElement(ref: string): Element {
    if (!ref) {
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        return active;
    }
    const escaped = CSS.escape(String(ref));
    const roots: (Document | ShadowRoot)[] = [document];
    let scanned = 0;
    for (const root of roots) {
        const match =
            root.querySelector('[data-wave-ref="' + escaped + '"]') ||
            root.getElementById?.(String(ref)) ||
            root.querySelector('[name="' + escaped + '"]') ||
            root.querySelector('[aria-label="' + escaped + '"]');
        if (match) return match;
        for (const el of root.querySelectorAll("*")) {
            if (++scanned > 20000) return null;
            if (el.shadowRoot) roots.push(el.shadowRoot);
        }
    }
    return null;
}

export function browserTargetPointScript(ref: string, scroll = true): string {
    return `(() => {
        const ref = ${JSON.stringify(ref)};
        const target = ${browserElementResolverSource()}(ref);
        if (!(target instanceof Element) || !target.isConnected) return null;
        for (let ancestor = target; ancestor; ancestor = ancestor.parentElement || ancestor.getRootNode().host) {
            if (ancestor.matches('[hidden], [inert], [aria-hidden="true"]')) return null;
        }
        if (target.matches(':disabled, [aria-disabled="true"]')) return null;
        if (${scroll}) target.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        const style = getComputedStyle(target);
        if (style.visibility !== 'visible' || style.display === 'none') return null;
        for (const rect of target.getClientRects()) {
            const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
            const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
            if (right <= left || bottom <= top) continue;
            const x = Math.floor((left + right) / 2), y = Math.floor((top + bottom) / 2);
            let hit = document.elementFromPoint(x, y);
            while (hit?.shadowRoot?.elementFromPoint) {
                const inner = hit.shadowRoot.elementFromPoint(x, y);
                if (!inner || inner === hit) break;
                hit = inner;
            }
            if (hit === target || target.contains(hit)) return {x, y};
        }
        return null;
    })()`;
}

export function browserHtmlScript(selector: string, inner = false, all = false): string {
    return `(() => {
        const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        return nodes.slice(0, ${all ? 100 : 1}).map(node => {
            const copy = node.cloneNode(true);
            const sensitive = [copy, ...copy.querySelectorAll('input[type=password], [data-private], [data-sensitive]')];
            for (const element of sensitive) {
                if (element.matches('input[type=password], [data-private], [data-sensitive]')) {
                    element.removeAttribute('value');
                    element.textContent = '';
                }
            }
            return (${inner} ? copy.innerHTML : copy.outerHTML).slice(0, 1000000);
        });
    })()`;
}

export function browserWaitConditionScript(ref: string, condition: string): string {
    return `(() => {
        const ref = ${JSON.stringify(ref)}, condition = ${JSON.stringify(condition)};
        const el = ${browserElementResolverSource()}(ref);
        if (condition === 'exists') return !!el || (!ref && !!document.body);
        let hidden = !el;
        for (let ancestor = el; ancestor; ancestor = ancestor.parentElement || ancestor.getRootNode().host) {
            const style = getComputedStyle(ancestor);
            if (ancestor.matches('[hidden],[inert],[aria-hidden="true"]') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') hidden = true;
        }
        if (el) { const rect = el.getBoundingClientRect(); hidden ||= !rect.width || !rect.height; }
        if (condition === 'hidden') return hidden;
        if (condition === 'visible') return !hidden && (!!el || (!ref && !!document.body));
        if (!el) return false;
        const disabled = el.matches(':disabled,[aria-disabled="true"]') || !!el.closest('[inert]');
        if (condition === 'enabled') return !disabled;
        if (condition === 'disabled') return disabled;
        if (condition === 'focused') return el.getRootNode().activeElement === el;
        if (condition === 'text') return !!el.textContent;
        if (condition === 'value') return !!el.value;
        if (condition.startsWith('text:')) return (el.textContent || '').includes(condition.slice(5));
        if (condition.startsWith('value:')) return String(el.value || '').includes(condition.slice(6));
        return true;
    })()`;
}

export function browserTextTargetScript(): string {
    return `(() => {
        const el = ${browserElementResolverSource()}('');
        if (!(el instanceof HTMLElement) || el.matches(':disabled,[aria-disabled="true"]') || el.readOnly) return false;
        if (el.isContentEditable) return true;
        if (el instanceof HTMLTextAreaElement) return true;
        return el instanceof HTMLInputElement && !['button','checkbox','radio','range','file','hidden','submit','reset','color','image'].includes(el.type);
    })()`;
}

export function mergeBrowserObservations(
    dom: WidgetElementData[],
    accessibility: WidgetElementData[],
    limit = 250
): WidgetElementData[] {
    const byRef = new Map((accessibility ?? []).map((element) => [element.ref, element]));
    const elements = (dom ?? []).map((element) => {
        const ax = byRef.get(element.ref);
        byRef.delete(element.ref);
        return ax
            ? { ...element, name: ax.name || element.name, role: ax.role, value: ax.value ?? element.value }
            : element;
    });
    return [...elements, ...byRef.values()].slice(0, limit);
}
