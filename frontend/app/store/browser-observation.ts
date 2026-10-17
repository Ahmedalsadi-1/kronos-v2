// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function browserObservationScript(limit = 50): string {
    return `(${observeBrowserDocument.toString()})(${JSON.stringify(limit)})`;
}

function observeBrowserDocument(limit: number) {
    const stateKey = "__kronBrowserObservation";
    const state = (window[stateKey] ??= { refs: new WeakMap(), prefix: crypto.randomUUID(), next: 0 });
    const candidates = document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [contenteditable="true"], [role], [tabindex], [onclick], [aria-label]'
    );
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
            el.closest('[hidden], [inert], [aria-hidden="true"]')
        )
            continue;
        let ref = state.refs.get(el);
        if (!ref) {
            ref = "wave-ref-" + state.prefix + "-" + state.next++;
            state.refs.set(el, ref);
        }
        el.setAttribute("data-wave-ref", ref);
        const labelledBy = (el.getAttribute("aria-labelledby") || "")
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent || "")
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
            visible: true,
        });
    }
    return result;
}

export function browserTargetPointScript(ref: string, scroll = true): string {
    return `(() => {
        const ref = ${JSON.stringify(ref)};
        const escaped = CSS.escape(ref);
        const target = ref ? document.querySelector('[data-wave-ref="' + escaped + '"]') ||
            document.getElementById(ref) || document.querySelector('[name="' + escaped + '"]') ||
            document.querySelector('[aria-label="' + escaped + '"]') : document.activeElement;
        if (!(target instanceof Element) || !target.isConnected) return null;
        if (target.closest('[hidden], [inert], [aria-hidden="true"]') || target.matches(':disabled, [aria-disabled="true"]')) return null;
        if (${scroll}) target.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        const style = getComputedStyle(target);
        if (style.visibility !== 'visible' || style.display === 'none') return null;
        for (const rect of target.getClientRects()) {
            const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
            const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
            if (right <= left || bottom <= top) continue;
            const x = Math.floor((left + right) / 2), y = Math.floor((top + bottom) / 2);
            const hit = document.elementFromPoint(x, y);
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
