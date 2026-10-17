// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { getApi } from "@/store/global";
import { mainComposerScope, type ComposerAttachment } from "@hermes/store/composer";
import type { OSResourceKind, OSResourceReference } from "./os-system-types";

export type { OSResourceKind, OSResourceReference } from "./os-system-types";

export const OSResourceDragMimeType = "application/x-kronterm-os-resource";

function resourceKind(item: SystemSearchItem): OSResourceKind {
    if (item.kind === "repository") return "repository";
    if (item.kind === "folder") return "folder";
    return "file";
}

export function systemSearchItemToResource(item: SystemSearchItem): OSResourceReference {
    return {
        id: `local:${item.path}`,
        kind: resourceKind(item),
        name: item.name,
        resource: item.path,
        detail: item.detail,
    };
}

export async function searchOSResources(query: string): Promise<OSResourceReference[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return [];
    const items = await getApi().searchSystemItems(normalizedQuery);
    return items.map(systemSearchItemToResource);
}

export function quickLookOSResource(resource: OSResourceReference): void {
    if (resource.kind === "url") {
        getApi().openExternal(resource.resource);
        return;
    }
    getApi().onQuicklook(resource.resource);
}

export function revealOSResource(resource: OSResourceReference): void {
    if (resource.kind === "url") {
        getApi().openExternal(resource.resource);
        return;
    }
    getApi().revealNativePath(resource.resource);
}

function composerAttachmentForResource(resource: OSResourceReference): ComposerAttachment {
    const folderLike = resource.kind === "folder" || resource.kind === "repository";
    const refPath = /\s/.test(resource.resource) ? JSON.stringify(resource.resource) : resource.resource;
    return {
        id: `os-resource:${resource.resource}`,
        kind: resource.kind === "url" ? "url" : folderLike ? "folder" : "file",
        label: resource.name,
        detail: resource.detail ?? resource.resource,
        refText: resource.kind === "url" ? resource.resource : `@${folderLike ? "folder" : "file"}:${refPath}`,
        path: resource.kind === "url" ? undefined : resource.resource,
    };
}

export function attachOSResourceToKronos(resource: OSResourceReference): void {
    mainComposerScope.add(composerAttachmentForResource(resource));
    hermesSurfaceController.requestOpenHud();
}

export function writeOSResourceDragPayload(
    event: Pick<DragEvent, "dataTransfer">,
    resource: OSResourceReference
): void {
    if (event.dataTransfer == null) return;
    event.dataTransfer.setData(OSResourceDragMimeType, JSON.stringify(resource));
    event.dataTransfer.setData("text/plain", resource.resource);
    event.dataTransfer.effectAllowed = "copy";
}

export function readOSResourceDragPayload(
    dataTransfer: Pick<DataTransfer, "getData">
): OSResourceReference | undefined {
    const raw = dataTransfer.getData(OSResourceDragMimeType);
    if (raw === "") return undefined;
    try {
        const resource = JSON.parse(raw) as Partial<OSResourceReference>;
        if (
            typeof resource.id !== "string" ||
            typeof resource.name !== "string" ||
            typeof resource.resource !== "string" ||
            !["file", "folder", "repository", "url", "generated-artifact"].includes(resource.kind ?? "")
        ) {
            return undefined;
        }
        return resource as OSResourceReference;
    } catch {
        return undefined;
    }
}
