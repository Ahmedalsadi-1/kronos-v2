// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type NativeTaskGroupWindow = {
    windowId: number;
    title?: string;
    enrolled?: boolean;
    spaceIds?: string[];
    displayIds?: number[];
};
export type NativeTaskGroupApp = {
    pid: number;
    bundleId: string;
    name?: string;
    blockedReason?: string;
    enrolledWindowIds?: number[];
    availableWindows?: NativeTaskGroupWindow[];
    inventoryVerified?: boolean;
};
export type NativeTaskGroup = {
    sessionId: string;
    taskId: string;
    spaceIds?: string[];
    displayIds?: number[];
    apps: NativeTaskGroupApp[];
    desktop?: { displayId: number };
    released?: boolean;
    paused: boolean;
    busy: boolean;
};
export type NativeTaskGroupAction = {
    operation: "pause" | "reveal" | "preview" | "return_windows" | "approve_window" | "remove_window" | "finish";
    sessionId: string;
    bundleId?: string;
    windowId?: number;
};
export type NativeTaskGroupsSnapshot = { workspaces: NativeTaskGroup[]; limitation?: string };

export type NativeTaskGroupPreview = { imageDataUrl?: string; captureUnavailable?: string; paused?: boolean };
