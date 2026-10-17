// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const WorkspacePresentationValues = ["widgets", "tabs", "canvas", "os", "web"] as const;

type WorkspacePresentation = (typeof WorkspacePresentationValues)[number];

const WorkspacePresentations = [
    "widgets",
    "tabs",
    "canvas",
    "os",
    "web",
] as const satisfies readonly WorkspacePresentation[];

const LayoutModeStorageKey = "kronterm:layoutmode";
const LayoutModeChangedEvent = "kronterm:layoutmode-changed";

function isWorkspacePresentation(value: unknown): value is WorkspacePresentation {
    return WorkspacePresentationValues.includes(value as WorkspacePresentation);
}

function normalizeWorkspacePresentation(value: unknown): WorkspacePresentation | undefined {
    if (value === "browsermode") {
        return "web";
    }
    return isWorkspacePresentation(value) ? value : undefined;
}

function readWorkspacePresentation(fallback: WorkspacePresentation = "os"): WorkspacePresentation {
    if (typeof window === "undefined") {
        return fallback;
    }
    const live = normalizeWorkspacePresentation((window as any).__krontermLayoutMode);
    if (live) {
        return live;
    }
    try {
        return normalizeWorkspacePresentation(window.localStorage.getItem(LayoutModeStorageKey)) ?? fallback;
    } catch {
        return fallback;
    }
}

function publishWorkspacePresentation(value: unknown): WorkspacePresentation {
    const presentation = normalizeWorkspacePresentation(value);
    if (!presentation) {
        throw new Error(`Unsupported workspace presentation: ${String(value)}`);
    }
    if (typeof window === "undefined") {
        return presentation;
    }
    const previous = readWorkspacePresentation(presentation);
    (window as any).__krontermLayoutMode = presentation;
    try {
        window.localStorage.setItem(LayoutModeStorageKey, presentation);
    } catch {
        // The live in-memory value remains authoritative when storage is unavailable.
    }
    if (previous !== presentation) {
        window.dispatchEvent(new CustomEvent(LayoutModeChangedEvent, { detail: { mode: presentation } }));
    }
    return presentation;
}

function subscribeWorkspacePresentation(callback: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }
    const handleChanged = (event: Event) => {
        const value = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
        const presentation = normalizeWorkspacePresentation(value);
        if (presentation) {
            (window as any).__krontermLayoutMode = presentation;
        }
        callback();
    };
    const handleStorage = (event: StorageEvent) => {
        if (event.key !== LayoutModeStorageKey) {
            return;
        }
        const presentation = normalizeWorkspacePresentation(event.newValue);
        if (presentation) {
            (window as any).__krontermLayoutMode = presentation;
        }
        callback();
    };
    window.addEventListener(LayoutModeChangedEvent, handleChanged);
    window.addEventListener("storage", handleStorage);
    return () => {
        window.removeEventListener(LayoutModeChangedEvent, handleChanged);
        window.removeEventListener("storage", handleStorage);
    };
}

function getAdjacentWorkspacePresentation(current: WorkspacePresentation, direction: -1 | 1): WorkspacePresentation {
    const currentIndex = WorkspacePresentations.indexOf(current as (typeof WorkspacePresentations)[number]);
    if (currentIndex === -1) {
        return direction === 1 ? "widgets" : "web";
    }
    const nextIndex = (currentIndex + direction + WorkspacePresentations.length) % WorkspacePresentations.length;
    return WorkspacePresentations[nextIndex];
}

export {
    WorkspacePresentationValues,
    WorkspacePresentations,
    LayoutModeChangedEvent,
    LayoutModeStorageKey,
    getAdjacentWorkspacePresentation,
    isWorkspacePresentation,
    normalizeWorkspacePresentation,
    publishWorkspacePresentation,
    readWorkspacePresentation,
    subscribeWorkspacePresentation,
};
export type { WorkspacePresentation };
