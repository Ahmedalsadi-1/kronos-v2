// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type SurfaceRect = { x: number; y: number; width: number; height: number };

export function intersectSurfaceRects(first: SurfaceRect, second: SurfaceRect): SurfaceRect {
    const x = Math.max(first.x, second.x);
    const y = Math.max(first.y, second.y);
    return {
        x,
        y,
        width: Math.max(0, Math.min(first.x + first.width, second.x + second.width) - x),
        height: Math.max(0, Math.min(first.y + first.height, second.y + second.height) - y),
    };
}

export function makeSurfaceClipPath(
    surface: SurfaceRect,
    visible: SurfaceRect,
    occluders: SurfaceRect[],
    width: number,
    height: number
): string {
    let regions = [intersectSurfaceRects(surface, visible)];
    for (const occluder of occluders) {
        regions = regions.flatMap((region) => {
            const overlap = intersectSurfaceRects(region, occluder);
            if (!overlap.width || !overlap.height) return [region];
            return [
                { x: region.x, y: region.y, width: region.width, height: overlap.y - region.y },
                {
                    x: region.x,
                    y: overlap.y + overlap.height,
                    width: region.width,
                    height: region.y + region.height - overlap.y - overlap.height,
                },
                { x: region.x, y: overlap.y, width: overlap.x - region.x, height: overlap.height },
                {
                    x: overlap.x + overlap.width,
                    y: overlap.y,
                    width: region.x + region.width - overlap.x - overlap.width,
                    height: overlap.height,
                },
            ].filter((part) => part.width > 0 && part.height > 0);
        });
    }
    const scaleX = width / surface.width;
    const scaleY = height / surface.height;
    const path = regions
        .filter((region) => region.width > 0 && region.height > 0)
        .map((region) => {
            const x = (region.x - surface.x) * scaleX;
            const y = (region.y - surface.y) * scaleY;
            const right = x + region.width * scaleX;
            const bottom = y + region.height * scaleY;
            return `M${x} ${y}H${right}V${bottom}H${x}Z`;
        })
        .join(" ");
    return path ? `path("${path}")` : "inset(100%)";
}

function surfaceParent(element: Element): Element {
    return (
        element.parentElement ??
        (element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).host : null)
    );
}

function isSurfaceVisible(element: Element): boolean {
    for (let current = element; current; current = surfaceParent(current)) {
        const style = getComputedStyle(current);
        if (
            current.hasAttribute("hidden") ||
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
        )
            return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

export function collectSurfaceOccluders(
    sceneRoot: Element,
    slot: HTMLElement,
    ownerWindow: HTMLElement,
    osMode: boolean
): SurfaceRect[] {
    const ownerZ = ownerWindow ? Number.parseInt(getComputedStyle(ownerWindow).zIndex) || 0 : 0;
    const candidates = new Set<Element>();
    for (const candidate of sceneRoot.querySelectorAll(
        osMode ? ".os-window, .os-canvas-object, [data-live-block-occluder]" : "[data-live-block-occluder]"
    )) {
        if (
            candidate.hasAttribute("data-live-block-occluder") ||
            (Number.parseInt(getComputedStyle(candidate).zIndex) || 0) > ownerZ
        )
            candidates.add(candidate);
    }
    if (osMode) {
        for (const world of sceneRoot.querySelectorAll("[data-workflow-world], [data-comfy-workflow-world]")) {
            for (const node of world.shadowRoot?.querySelectorAll(
                ".vue-flow__node, [data-os-object-kind='workflow-node']"
            ) ?? []) {
                if ((Number.parseInt(getComputedStyle(node).zIndex) || 0) > ownerZ) candidates.add(node);
            }
        }
        for (const host of sceneRoot.querySelectorAll("[data-workflow-chrome], [data-workflow-details]")) {
            if ((Number.parseInt(getComputedStyle(host).zIndex) || 0) <= ownerZ) continue;
            // Shadow hosts cover the viewport; only the original interactive controls and panels occlude widgets.
            const panels: Element[] = [];
            for (const child of (host.shadowRoot ?? host).querySelectorAll("*")) {
                if (panels.some((panel) => panel.contains(child))) continue;
                if (getComputedStyle(child).pointerEvents !== "auto" || !isSurfaceVisible(child)) continue;
                panels.push(child);
                candidates.add(child);
            }
        }
    }
    return [...candidates]
        .filter(
            (candidate) =>
                candidate !== ownerWindow &&
                !ownerWindow?.contains(candidate) &&
                !candidate.contains(slot) &&
                isSurfaceVisible(candidate)
        )
        .map((candidate) => candidate.getBoundingClientRect());
}
