// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const WorkspacePresentationValues = ["widgets", "tabs", "canvas", "os", "web"] as const;

type WorkspacePresentation = (typeof WorkspacePresentationValues)[number];

const WorkspacePresentations: readonly WorkspacePresentation[] = ["os"];
type ActiveWorkspacePresentation = "os";

const LayoutModeStorageKey = "kronterm:layoutmode";
const LayoutModeChangedEvent = "kronterm:layoutmode-changed";

function isWorkspacePresentation(value: unknown): value is WorkspacePresentation {
    return WorkspacePresentationValues.includes(value as WorkspacePresentation);
}

function normalizeWorkspacePresentation(value: unknown): ActiveWorkspacePresentation | undefined {
    return isWorkspacePresentation(value) || value === "browsermode" ? "os" : undefined;
}

function readWorkspacePresentation(_previous?: WorkspacePresentation): WorkspacePresentation {
    return "os";
}

function readWebReturnPresentation(): ActiveWorkspacePresentation {
    return "os";
}

function publishWorkspacePresentation(value: unknown): ActiveWorkspacePresentation {
    if (!normalizeWorkspacePresentation(value)) {
        throw new Error(`Unsupported workspace presentation: ${String(value)}`);
    }
    return "os";
}

function subscribeWorkspacePresentation(_callback: () => void): () => void {
    return () => {};
}

function getAdjacentWorkspacePresentation(_current: WorkspacePresentation, _direction: -1 | 1): WorkspacePresentation {
    return "os";
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
