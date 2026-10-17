// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type OSResourceKind = "file" | "folder" | "repository" | "url" | "generated-artifact";

export type OSResourceReference = {
    id: string;
    kind: OSResourceKind;
    name: string;
    resource: string;
    detail?: string;
};

export type ArtifactShelfItem = OSResourceReference & {
    addedAt: number;
};

export type SpaceProfile = {
    version: 1;
    roots: string[];
    pinnedAppIds: string[];
    restorePolicy: "smart" | "manual" | "auto";
    artifactShelf: ArtifactShelfItem[];
};

export type SystemAppDescriptor = {
    id: string;
    kind: "builtin" | "native" | "web" | "remote" | "sandbox";
    name: string;
    icon?: string;
    launchPolicy: "singleton" | "multi-window";
    capabilities: string[];
};

export type AppInstance = {
    id: string;
    spaceId: string;
    blockId: string;
    appId: string;
    nativeWindowId?: string;
    state: "starting" | "running" | "dormant" | "disconnected" | "failed";
};

export type CapabilityGrant = {
    id: string;
    capability: string;
    scope: "once" | "run" | "space";
    resource?: string;
    agentSessionId: string;
    expiresAt?: number;
    revokedAt?: number;
};

export type SystemEvent = {
    id: string;
    spaceId: string;
    kind: "agent" | "approval" | "app" | "notification" | "update" | "recovery";
    status: string;
    title: string;
    source?: string;
    blockId?: string;
    createdAt: number;
    readAt?: number;
    actions?: string[];
};

export type NativeSurfaceWindow = {
    id: string;
    appId: string;
    title: string;
    icon?: string;
    bounds?: { x: number; y: number; width: number; height: number };
    scaleFactor?: number;
};

export type NativeSurfaceHealth = {
    state: AppInstance["state"];
    captureFps?: number;
    inputLatencyMs?: number;
    protectedContent?: boolean;
    permission?: "granted" | "denied" | "restricted" | "unknown";
};

export type NativeSurfaceInput =
    | { type: "pointer"; action: "move" | "down" | "up"; x: number; y: number; button?: string }
    | { type: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
    | { type: "key"; action: "down" | "up"; key: string; code?: string; text?: string };

export interface NativeSurfaceAdapter {
    discoverApps(): Promise<SystemAppDescriptor[]>;
    discoverWindows(appId?: string): Promise<NativeSurfaceWindow[]>;
    launch(appId: string, options?: { newWindow?: boolean }): Promise<NativeSurfaceWindow>;
    attach(instanceId: string, nativeWindowId: string): Promise<void>;
    capture(instanceId: string, options: { focused: boolean; visible: boolean }): Promise<MediaStream | string>;
    input(instanceId: string, input: NativeSurfaceInput): Promise<void>;
    focus(instanceId: string): Promise<void>;
    resize(instanceId: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    readClipboard(instanceId: string): Promise<string>;
    writeClipboard(instanceId: string, text: string): Promise<void>;
    suspend(instanceId: string): Promise<void>;
    reconnect(instanceId: string): Promise<void>;
    close(instanceId: string): Promise<void>;
    health(instanceId: string): Promise<NativeSurfaceHealth>;
}

export type CanonicalOSActionName =
    | "os.app.launch"
    | "os.window.focus"
    | "os.window.move"
    | "os.window.resize"
    | "os.window.snap"
    | "os.window.minimize"
    | "os.window.restore"
    | "os.window.maximize"
    | "os.window.close"
    | "os.window.overview"
    | "os.space.switch"
    | "os.resource.open"
    | "os.resource.reveal"
    | "os.resource.pin"
    | "os.resource.attach"
    | "os.activity.inspect"
    | "os.activity.interrupt"
    | "os.activity.retry"
    | "os.activity.takeover"
    | "os.capability.request"
    | "os.capability.revoke"
    | "os.view.set";

const LegacyOSActionAliases: Record<string, CanonicalOSActionName> = {
    "spatial.focus": "os.window.focus",
    "spatial.move": "os.window.move",
    "spatial.resize": "os.window.resize",
    "spatial.dock": "os.window.snap",
    "spatial.collapse": "os.window.minimize",
    "spatial.restore": "os.window.restore",
    "spatial.showOverview": "os.window.overview",
};

export function normalizeOSActionName(action: string): string {
    return LegacyOSActionAliases[action] ?? action;
}
