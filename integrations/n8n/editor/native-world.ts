// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { getCurrentInstance, inject } from "vue";
export function worldHostForScope(): any {
    if (!getCurrentInstance() || inject("kronterm:surface-role", "root") !== "workflow") return null;
    const host = (window as any).__KRONTERM_WORKFLOW_HOST__;
    return host?.worldTarget && host?.viewportTarget ? host : null;
}
export function worldHostForElement(element: any): any {
    const host = (window as any).__KRONTERM_WORKFLOW_HOST__;
    if (!host?.worldTarget || !host?.viewportTarget || !element) return null;
    const root = element.getRootNode?.();
    if (
        element.closest?.(".kronterm-passive-scene") ||
        host.worldTarget.contains(element) ||
        root === host.worldTarget.getRootNode()
    )
        return host;
    return null;
}
export function worldViewportRect(element: any): DOMRect {
    return (worldHostForElement(element)?.viewportTarget || element).getBoundingClientRect();
}
export function worldTransformPane(element: any): HTMLElement {
    return (worldHostForElement(element)?.worldTarget || element).querySelector(".vue-flow__transformationpane");
}
export function worldScale(element: any, fallback: number): number {
    return worldHostForElement(element)?.worldCamera?.value?.zoom || fallback;
}
export function requestWorldCamera(host: any, camera: any): Promise<boolean> {
    if (!host || host.disposing) return Promise.resolve(false);
    host.onCameraIntent?.({ camera: { x: camera.x, y: camera.y, zoom: camera.zoom } });
    return Promise.resolve(true);
}
export function worldNodeOrder(host: any, id: string, fallback: number): number {
    return host?.objectOrderRef?.value?.[`workflow:${host.workflowId}:${id}`] ?? fallback;
}
