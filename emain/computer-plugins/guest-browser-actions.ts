// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

export const GuestBrowserActionExpression = `(async () => {
    const args = __KRONOS_ACTION__;
    const resolve = () => {
        if (!args.selector) throw new Error('Provide a selector from the current page');
        const elements = document.querySelectorAll(args.selector);
        if (elements.length !== 1) throw new Error('Selector must match exactly one element; inspect the page again');
        const element = elements[0];
        if (!element.isConnected || !element.getClientRects().length) throw new Error('Target is not visible');
        return element;
    };
    let result;
    if (args.action === 'wait') {
        const deadline = performance.now() + Math.min(10000, Math.max(100, args.timeoutMs || 3000));
        while (true) {
            const matches = document.querySelectorAll(args.selector);
            if (matches.length === 1 && matches[0].getClientRects().length) { result = { ready: true }; break; }
            if (performance.now() >= deadline) throw new Error('Timed out waiting for a unique visible element');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } else if (args.action === 'scroll') {
        let element = args.selector ? resolve() : document.elementFromPoint(args.x ?? innerWidth / 2, args.y ?? innerHeight / 2);
        const dx = args.deltaX || 0, dy = args.deltaY || 0;
        while (element && element !== document.scrollingElement) {
            const style = getComputedStyle(element);
            const canX = dx && /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
            const canY = dy && /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
            if (canX || canY) break;
            element = element.parentElement;
        }
        element = element || document.scrollingElement;
        const before = { x: element.scrollLeft, y: element.scrollTop };
        element.scrollBy({ left: dx, top: dy, behavior: 'instant' });
        const after = { x: element.scrollLeft, y: element.scrollTop };
        result = { before, after, moved: before.x !== after.x || before.y !== after.y,
            requested: { x: dx, y: dy }, actual: { x: after.x - before.x, y: after.y - before.y } };
    } else {
        const element = resolve();
        if (element.disabled || element.getAttribute('aria-disabled') === 'true') throw new Error('Target is disabled');
        if (args.action === 'click') {
            element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            const rect = element.getBoundingClientRect();
            const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            if (top !== element && !element.contains(top)) throw new Error('Target is obscured; inspect the page again');
            element.click();
            result = { dispatched: true, verified: false };
        } else if (args.action === 'fill') {
            if (element.type === 'password') throw new Error('Use the secure login card for passwords');
            if (element.readOnly) throw new Error('Target is read-only');
            const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('Target is not a text input');
            element.focus();
            Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, args.text || '');
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            result = { dispatched: true, valueMatches: element.value === (args.text || '') };
        } else throw new Error('Unsupported browser action');
    }
    return JSON.stringify({ ...result, url: location.href, title: document.title });
})()`;
