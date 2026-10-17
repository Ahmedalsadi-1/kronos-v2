// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WorkspacePresentation } from "@/app/tab/workspace-presentation";

export function workspaceSurfaceElement(presentation: WorkspacePresentation, tiled?: HTMLElement): HTMLElement {
    const selector = {
        canvas: ".workspace-canvas",
        os: ".os-mode-root",
        tabs: ".widget-tabs-layout",
        web: ".web-mode",
    }[presentation];
    return selector ? document.querySelector<HTMLElement>(selector) : tiled;
}

export function observeWorkspaceBlock(blockId: string, detached: boolean) {
    if (detached)
        return { visible: false, availability: "detached", geometryscope: "desktop-window", bounds: undefined };
    const element = [...document.querySelectorAll<HTMLElement>("[data-live-blockid], [data-blockid]")].find(
        (candidate) => (candidate.dataset.liveBlockid ?? candidate.dataset.blockid) === blockId
    );
    if (!element)
        return { visible: false, availability: "unmounted", geometryscope: "renderer-viewport", bounds: undefined };
    for (let ancestor: HTMLElement = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || ancestor.hidden) {
            return { visible: false, availability: "hidden", geometryscope: "renderer-viewport", bounds: undefined };
        }
    }
    const rect = element.getBoundingClientRect();
    const hasSize = rect.width > 0 && rect.height > 0;
    const right = Math.min(rect.x + rect.width, window.innerWidth);
    const bottom = Math.min(rect.y + rect.height, window.innerHeight);
    const left = Math.max(0, rect.x);
    const top = Math.max(0, rect.y);
    const area = Math.max(0, right - left) * Math.max(0, bottom - top);
    const visibleFraction = hasSize ? area / (rect.width * rect.height) : 0;
    const visible = visibleFraction > 0;
    const center = visible ? document.elementFromPoint?.((left + right) / 2, (top + bottom) / 2) : null;
    const centerOccluded = center ? !element.contains(center) && !center.contains(element) : undefined;
    return {
        visible,
        availability: !hasSize ? "hidden" : visible ? "mounted" : "offscreen",
        geometryscope: "renderer-viewport",
        bounds: hasSize ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
        visibleFraction,
        clipped: visibleFraction > 0 && visibleFraction < 0.99,
        centerOccluded,
    };
}

export function assessWorkspaceLayout(
    blocks: Array<{
        blockid: string;
        visible: boolean;
        bounds?: { width: number; height: number };
        clipped?: boolean;
        centeroccluded?: boolean;
    }>
) {
    return {
        evidence: "rendered-geometry",
        screenshotRequiredForVisualQuality: true,
        issues: blocks.flatMap((block) => {
            const issues: string[] = [];
            if (block.visible && block.bounds && (block.bounds.width < 240 || block.bounds.height < 180))
                issues.push("small-content-area");
            if (block.clipped) issues.push("partially-outside-viewport");
            if (block.centeroccluded) issues.push("center-covered-by-another-surface");
            return issues.map((issue) => ({ blockid: block.blockid, issue }));
        }),
        guidance:
            "Preserve the primary widget and user focus. Keep content readable and within the viewport. Overlap can be intentional in OS mode; verify the intended appearance with a screenshot.",
    };
}
