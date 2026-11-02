// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export interface LinuxDesktop {
    id: string;
    name: string;
    status: "missing" | "stopped" | "running" | "unavailable";
    ready: boolean;
    imagePrepared: boolean;
    provider: "cua-qemu" | "openmaus-container";
    runtime: string;
    viewerUrl: string;
    problem?: string;
    controlOwner: "user" | "agent";
    controlGeneration: number;
    assignedAgentId?: string;
    workspacePath: string;
}

export interface LinuxDesktopAction {
    desktopId: string;
    action:
        | "prepare"
        | "create"
        | "start"
        | "stop"
        | "remove"
        | "screenshot"
        | "click"
        | "drag"
        | "type"
        | "key"
        | "scroll"
        | "exec";
    assignedAgentId?: string;
    expectedGeneration?: number;
    button?: "left" | "right" | "middle";
    count?: number;
    endX?: number;
    endY?: number;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    deltaX?: number;
    deltaY?: number;
    command?: string;
}

export interface LinuxDesktopActionResult {
    desktop: LinuxDesktop;
    imageDataUrl?: string;
    output?: string;
}

export type ComputerProviderId = "cua-qemu" | "openmaus-container";
export type ComputerInstanceConfig = { id: string; name: string; provider: ComputerProviderId; slot: number };
export type ComputerPluginInfo = { id: ComputerProviderId; name: string; enabled: boolean; description: string };
export type ComputerManagerState = { plugins: ComputerPluginInfo[]; computers: ComputerInstanceConfig[] };
export type ComputerManagerCommand =
    | { action: "list" }
    | { action: "start-runtime"; provider: ComputerProviderId }
    | { action: "plugin"; provider: ComputerProviderId; enabled: boolean }
    | { action: "create"; provider: ComputerProviderId; name: string }
    | { action: "rename"; id: string; name: string };
export type SandboxComputerAccess = { desktopId: string; enabled: boolean };
