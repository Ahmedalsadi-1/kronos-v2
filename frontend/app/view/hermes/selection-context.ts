import type { BrowserGrabPayload } from "../../../types/browser-grab";
import type { DesktopGrabPayload } from "../../../types/desktop-grab";

export type SelectionContextDepth = "compact" | "full";

export function browserSelectionContext(payload: BrowserGrabPayload, depth: SelectionContextDepth = "full") {
    if (depth === "full") return { ...payload, screenshot: null };
    const target = payload.target;
    return {
        page: payload.page,
        target: {
            tagName: target.tagName,
            selector: target.selector,
            textSnippet: target.textSnippet,
            selectedText: target.selectedText,
            accessibility: target.accessibility,
            rectViewport: target.rectViewport,
            reactComponents: target.reactComponents,
            sourceFile: target.sourceFile,
        },
        screenshot: null,
    };
}

export function browserSelectionPrompt(
    payload: BrowserGrabPayload,
    comment: string,
    depth: SelectionContextDepth = "full",
    blockId?: string
): string {
    const route = blockId
        ? `\nUse widget_snapshot on browser block ${JSON.stringify(blockId)} and use its widget tools after checking the page and element.\n`
        : "";
    return `${comment.trim().slice(0, 2000)}\n\nSelected webpage element (snapshot; revalidate before acting):\n${route}${JSON.stringify(browserSelectionContext(payload, depth), null, 2)}`;
}

export function desktopSelectionPrompt(
    payload: DesktopGrabPayload,
    comment: string,
    depth: SelectionContextDepth = "full"
): string {
    const { screenshot: _screenshot, ...context } = payload;
    const selected =
        depth === "full"
            ? context
            : {
                  application: context.application,
                  bundleId: context.bundleId,
                  window: context.window,
                  role: context.role,
                  name: context.name,
                  bounds: context.bounds,
                  screenshotOmitted: context.screenshotOmitted,
              };
    return `${comment.trim().slice(0, 2000)}\n\nSelected macOS desktop control (snapshot; revalidate before acting). Use kron_computer_get_app_state and kron_computer tools scoped to this application.\n${JSON.stringify(selected, null, 2)}`;
}
