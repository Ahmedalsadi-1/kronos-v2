import type { KeyboardEvent } from "react";
export function handleWidgetDialogKey(event: KeyboardEvent<HTMLElement>, close: () => void): void {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
    }
    if (event.key !== "Tab") return;
    const elements = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), textarea:not(:disabled), input:not(:disabled)"
        )
    );
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}
