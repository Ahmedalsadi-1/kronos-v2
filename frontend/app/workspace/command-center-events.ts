// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";

export const comfyWorkflowOpenAtom = atom(false);

const CommandCenterToggleEvent = "kronterm:command-center-toggle";
const OSSessionFocusEvent = "kronterm:os-session-focus";
const SystemCenterOpenEvent = "kronterm:system-center-open";

type SystemCenterTarget = "activity" | "control";

function toggleCommandCenter(): void {
    window.dispatchEvent(new CustomEvent(CommandCenterToggleEvent, { cancelable: true }));
}

function focusOSSession(blockId: string, tabId?: string): void {
    window.dispatchEvent(new CustomEvent(OSSessionFocusEvent, { detail: { blockId, tabId } }));
}

function openSystemCenter(center: SystemCenterTarget): void {
    window.dispatchEvent(new CustomEvent(SystemCenterOpenEvent, { detail: { center } }));
}

export {
    CommandCenterToggleEvent,
    OSSessionFocusEvent,
    SystemCenterOpenEvent,
    focusOSSession,
    openSystemCenter,
    toggleCommandCenter,
    type SystemCenterTarget,
};
