// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const WorkspacePresentationValues = ["widgets", "tabs", "canvas", "os", "web"] as const;

type WorkspacePresentation = (typeof WorkspacePresentationValues)[number];

const WorkspacePresentations = ["widgets", "tabs", "os"] as const;
type ActiveWorkspacePresentation = (typeof WorkspacePresentations)[number];

const LayoutModeStorageKey = "kronterm:layoutmode";
const WebReturnPresentationStorageKey = "kronterm:web-return-layout";
const LayoutModeChangedEvent = "kronterm:layoutmode-changed";

function isWorkspacePresentation(value: unknown): value is WorkspacePresentation {
    return WorkspacePresentationValues.includes(value as WorkspacePresentation);
}

function normalizeWorkspacePresentation(value: unknown): ActiveWorkspacePresentation | undefined {
    if (value === "canvas") return "os";
    if (value === "web" || value === "browsermode") return "tabs";
    return WorkspacePresentations.find((presentation) => presentation === value);
}

function readWorkspacePresentation(value: WorkspacePresentation = "os"): ActiveWorkspacePresentation {
    const fallback = normalizeWorkspacePresentation(value) ?? "os";
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

function readWebReturnPresentation(): Exclude<WorkspacePresentation, "web"> {
    try {
        const stored = normalizeWorkspacePresentation(window.localStorage.getItem(WebReturnPresentationStorageKey));
        if (stored) return stored;
    } catch {
        // Keep the in-memory selection when storage is unavailable.
    }
    return "os";
}

function publishWorkspacePresentation(value: unknown): ActiveWorkspacePresentation {
    const presentation = normalizeWorkspacePresentation(value);
    if (!presentation) {
        throw new Error(`Unsupported workspace presentation: ${String(value)}`);
    }
    if (typeof window === "undefined") {
        return presentation;
    }
    const previous = readWorkspacePresentation();
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
    const currentIndex = WorkspacePresentations.indexOf(normalizeWorkspacePresentation(current));
    if (currentIndex === -1) {
        return direction === 1 ? "widgets" : "os";
    }
    const nextIndex = (currentIndex + direction + WorkspacePresentations.length) % WorkspacePresentations.length;
    return WorkspacePresentations[nextIndex];
}

export {
    LayoutModeChangedEvent,
    LayoutModeStorageKey,
    WorkspacePresentationValues,
    WorkspacePresentations,
    getAdjacentWorkspacePresentation,
    isWorkspacePresentation,
    normalizeWorkspacePresentation,
    publishWorkspacePresentation,
    readWebReturnPresentation,
    readWorkspacePresentation,
    subscribeWorkspacePresentation,
};
export type { WorkspacePresentation };
