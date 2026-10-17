export function selectorOwnsInput(): boolean {
    return document.documentElement.hasAttribute("data-kronterm-selector-active");
}

export function deepActiveElement(): Element {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
}

export function editableElement(target: EventTarget): boolean {
    return (
        target instanceof Element &&
        Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
    );
}

export function eventOwnsInput(event: Event): boolean {
    return (
        selectorOwnsInput() ||
        event
            .composedPath()
            .some(
                (target) =>
                    editableElement(target) ||
                    (target instanceof Element && Boolean(target.closest("[data-hud-interactive=true]")))
            ) ||
        editableElement(deepActiveElement())
    );
}
