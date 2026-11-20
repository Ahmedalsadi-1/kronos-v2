// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { KronTermOSView } from "./os-workspace-model";
import type { WorkspaceCanvasRect } from "./workspace-canvas-utils";
import type { WorkspacePresentation } from "./workspace-presentation";

type WorkspaceSurfaceControlAction =
    | "os.widget.input"
    | "os.tabs.group"
    | "os.tabs.detach"
    | "os.tabs.reorder"
    | "focus"
    | "hud.mode"
    | "hud.open"
    | "hud.background"
    | "hud.restore"
    | "move"
    | "resize"
    | "navigate"
    | "fit"
    | "arrange"
    | "os.design.editor"
    | "os.design.create"
    | "os.design.update"
    | "add_note"
    | "add_file"
    | "update_object"
    | "delete_object"
    | "connect_objects"
    | "spatial.open"
    | "spatial.focus"
    | "spatial.move"
    | "spatial.resize"
    | "spatial.dock"
    | "spatial.detach"
    | "spatial.collapse"
    | "spatial.restore"
    | "spatial.showOverview"
    | "spatial.switchWorkspace"
    | "spatial.openApp"
    | "os.view.set"
    | "spatial.setWidgetPresentation"
    | "spatial.openFile"
    | "spatial.openCommandCenter"
    | "os.app.launch"
    | "os.space.switch"
    | "os.resource.open"
    | "os.window.focus"
    | "os.window.move"
    | "os.window.resize"
    | "os.window.snap"
    | "os.window.minimize"
    | "os.window.restore"
    | "os.window.maximize"
    | "os.window.close"
    | "os.window.place"
    | "os.window.arrange"
    | "os.window.overview";

type WorkspaceSurfaceControlInput = {
    index?: number;
    action: WorkspaceSurfaceControlAction;
    blockid?: string;
    targetblockid?: string;
    direction?: "up" | "right" | "down" | "left";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    objectid?: string;
    fromobjectid?: string;
    toobjectid?: string;
    text?: string;
    color?: string;
    side?: "left" | "right";
    view?: string;
    workspaceid?: string;
    appid?: string;
    appname?: string;
    presentation?: string;
    position?: string;
    file?: string;
    render?: import("@/types/comfyui").ComfyRenderRef;
};

type WorkspaceSurfaceModeState = {
    presentation: WorkspacePresentation;
    selectedblockid?: string;
    selectedobjectid?: string;
    expandedblockid?: string;
    contextids?: string[];
    contextmode?: "follow" | "quote";
    camera?: { x: number; y: number; zoom: number };
    rects?: Record<string, WorkspaceCanvasRect>;
    objects?: unknown[];
    scene?: unknown;
    groups?: unknown;
    tabgroups?: unknown;
    presentations?: Record<string, string>;
    osview?: KronTermOSView;
    penchatmode?: "tabs" | "canvas";
};

type WorkspaceSurfaceModeProvider = {
    snapshot: () => WorkspaceSurfaceModeState;
    control: (
        input: WorkspaceSurfaceControlInput
    ) => WorkspaceSurfaceControlResult | Promise<WorkspaceSurfaceControlResult>;
};

type WorkspaceSurfaceControlResult = { success: boolean; message: string };

async function controlWorkspaceSurface(
    tabId: string,
    input: WorkspaceSurfaceControlInput
): Promise<WorkspaceSurfaceControlResult> {
    const provider = getWorkspaceSurfaceModeProvider(tabId);
    if (!provider) {
        throw new Error("Workspace surface is not mounted; refresh the workspace snapshot before retrying.");
    }
    const result = await provider.control(input);
    if (!result.success) {
        throw new Error(result.message);
    }
    return result;
}

const providers = new Map<string, WorkspaceSurfaceModeProvider>();

function registerWorkspaceSurfaceModeProvider(tabId: string, provider: WorkspaceSurfaceModeProvider): () => void {
    providers.set(tabId, provider);
    return () => {
        if (providers.get(tabId) === provider) {
            providers.delete(tabId);
        }
    };
}

function getWorkspaceSurfaceModeProvider(tabId: string): WorkspaceSurfaceModeProvider | undefined {
    return providers.get(tabId);
}

export { controlWorkspaceSurface, getWorkspaceSurfaceModeProvider, registerWorkspaceSurfaceModeProvider };
export type { WorkspaceSurfaceControlInput, WorkspaceSurfaceModeProvider, WorkspaceSurfaceModeState };
