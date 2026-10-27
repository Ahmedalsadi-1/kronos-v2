import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function HermesChatMount({ targetId, children }: { targetId: string; children: ReactNode }) {
    const focusedRef = useRef<HTMLElement>(null);
    const [container] = useState(() => {
        const element = document.createElement("div");
        element.className = "h-full min-h-0 min-w-0";
        element.dataset.hermesChatMount = "";
        return element;
    });

    useLayoutEffect(() => {
        const rememberFocus = (event: FocusEvent) => {
            const element = event.target as HTMLElement;
            if (element.matches("input, textarea, [contenteditable='true']")) focusedRef.current = element;
        };
        container.addEventListener("focusin", rememberFocus);
        return () => container.removeEventListener("focusin", rememberFocus);
    }, [container]);

    useLayoutEffect(() => {
        const attach = () => {
            const target = document.getElementById(targetId);
            if (!target) return false;
            if (container.parentElement === target) return true;
            target.appendChild(container);
            const focused =
                focusedRef.current && container.contains(focusedRef.current)
                    ? focusedRef.current
                    : container.querySelector<HTMLElement>("[data-slot='composer-rich-input']");
            focused?.focus({ preventScroll: true });
            return true;
        };
        // OS shell anchors can appear after the overlay has measured its destination.
        const observer = new MutationObserver(() => {
            if (attach()) observer.disconnect();
        });
        if (!attach()) observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            container.remove();
        };
    }, [container, targetId]);

    return createPortal(children, container);
}
