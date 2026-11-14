// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type ComputerTargetCapability =
    | "boot"
    | "shutdown"
    | "open"
    | "screenshot"
    | "tap"
    | "type"
    | "key"
    | "back"
    | "home"
    | "rotate"
    | "swipe"
    | "button";
export type ComputerTarget = {
    id: string;
    name: string;
    kind: "ios-simulator" | "ios-device" | "android-device" | "android-emulator";
    status: "booted" | "shutdown" | "unavailable" | "connected";
    runtime: string;
    capabilities: ComputerTargetCapability[];
    controlOwner: "user" | "agent";
    controlGeneration: number;
    automationPaused?: boolean;
    availabilityReason?: string;
    labs: true;
};
export type ComputerTargetSnapshot = {
    target: ComputerTarget;
    imageDataUrl?: string;
    capturedAt?: number;
};
export type DeviceSelectedElement = {
    application?: string;
    role: string;
    name?: string;
    id?: string;
    frame: { x: number; y: number; width: number; height: number };
};
export type ComputerTargetAction = {
    targetId: string;
    action: ComputerTargetCapability;
    expectedGeneration?: number;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    button?: "power" | "volume-up" | "volume-down";
    endX?: number;
    endY?: number;
    orientation?: "portrait" | "landscape-left" | "landscape-right" | "portrait-upside-down";
};
export type ComputerTargetSession = {
    id: string;
    targetId: string;
    controlGeneration: number;
    live: true;
};
export type ComputerTargetFrame = {
    sessionId: string;
    sequence: number;
    imageDataUrl: string;
    capturedAt: number;
};
export type ComputerTargetsResult<T> =
    { success: true; data: T } | { success: false; error: { code: string; message: string } };
