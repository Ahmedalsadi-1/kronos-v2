import { $rightRailActiveTabId } from "@hermes/store/layout";
import { $previewTabs } from "@hermes/store/preview";

interface PreviewDriverHandle {
    back: () => void;
    execute: (code: string) => Promise<unknown>;
    forward: () => void;
    reload: () => void;
}

export interface PreviewDriverAction {
    amount?: number;
    key?: string;
    kind: string;
    max?: number;
    ref?: string;
    selector?: string;
    submit?: boolean;
    text?: string;
    to?: string;
}

const handles = new Map<string, PreviewDriverHandle>();

export function registerPreviewDriver(tabId: string, handle: PreviewDriverHandle): () => void {
    handles.set(tabId, handle);
    return () => {
        if (handles.get(tabId) === handle) {
            handles.delete(tabId);
        }
    };
}

function activePreviewDriver(): PreviewDriverHandle | null {
    const tabs = $previewTabs.get();
    const tab = tabs.find((item) => item.id === $rightRailActiveTabId.get()) ?? tabs[0];
    return tab ? (handles.get(tab.id) ?? null) : null;
}

function actionScript(action: PreviewDriverAction): string {
    return `(() => {
        const action = ${JSON.stringify(action)};
        const selector = 'a[href],button,input,textarea,select,[contenteditable="true"],[role="button"],[role="link"],[tabindex]';
        const visible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        let cachedElements;
        const elements = () => cachedElements ||= Array.from(document.querySelectorAll(selector)).filter(visible);
        const reference = (element, index) => {
            const prior = element.getAttribute('data-hermes-agent-ref');
            if (prior) return prior;
            const seed = element.id || element.getAttribute('name') || element.getAttribute('aria-label') || element.textContent || element.tagName;
            const clean = String(seed).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'element';
            const ref = clean + '-' + index;
            element.setAttribute('data-hermes-agent-ref', ref);
            return ref;
        };
        const inventory = () => elements().slice(0, Math.max(1, Math.min(Number(action.max) || 60, 120))).map((element, index) => ({
            ref: reference(element, index),
            role: element.getAttribute('role') || element.tagName.toLowerCase(),
            label: (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().slice(0, 160),
            value: 'value' in element ? String(element.value ?? '').slice(0, 500) : '',
            disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true')
        }));
        const requestedRef = String(action.ref || '').replace(/^@/, '');
        const escapedRef = globalThis.CSS?.escape ? CSS.escape(requestedRef) : requestedRef.replace(/["\\]/g, '\\$&');
        const target = action.selector
            ? document.querySelector(action.selector)
            : document.querySelector('[data-hermes-agent-ref="' + escapedRef + '"]')
                || elements().find((element, index) => reference(element, index) === requestedRef);
        const base = () => ({ success: true, url: location.href, title: document.title });
        if (action.kind === 'elements' || action.kind === 'strobe') return JSON.stringify({ ...base(), elements: inventory() });
        if (action.kind === 'scroll') {
            const amount = Number(action.amount) || 600;
            const node = target || document.scrollingElement || document.documentElement;
            if (action.to === 'top' || action.to === 'bottom') {
                node.scrollTo?.({ top: action.to === 'top' ? 0 : node.scrollHeight, behavior: 'instant' });
            } else {
                node.scrollBy?.({ top: amount, behavior: 'instant' });
            }
            return JSON.stringify({ ...base(), acted: 'scrolled' });
        }
        if (!target) return JSON.stringify({ success: false, error: 'Element not found. Call elements again.' });
        target.scrollIntoView?.({ block: 'center', inline: 'center' });
        if (action.kind === 'click') target.click?.();
        else if (action.kind === 'hover') target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        else if (action.kind === 'type') {
            target.focus?.();
            if ('value' in target) target.value = String(action.text || '');
            else target.textContent = String(action.text || '');
            target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(action.text || '') }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            if (action.submit) target.form?.requestSubmit?.();
        } else if (action.kind === 'press') {
            target.focus?.();
            target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: String(action.key || 'Enter') }));
            target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(action.key || 'Enter') }));
        }
        return JSON.stringify({ ...base(), acted: action.kind, elements: inventory() });
    })()`;
}

export async function actOnActivePreview(action: PreviewDriverAction): Promise<Record<string, unknown>> {
    const handle = activePreviewDriver();
    if (!handle) {
        return { success: false, error: "No live page is open in the built-in KronTerm Agent browser." };
    }
    if (action.kind === "back" || action.kind === "forward" || action.kind === "reload") {
        handle[action.kind]();
        return { success: true, acted: action.kind };
    }
    const raw = await handle.execute(actionScript(action));
    if (typeof raw !== "string" || !raw) {
        return { success: false, error: "The built-in browser did not answer the action." };
    }
    return JSON.parse(raw) as Record<string, unknown>;
}
