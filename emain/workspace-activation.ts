// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type WorkspaceWindow = {
    isDestroyed: () => boolean;
    isMinimized: () => boolean;
    restore: () => void;
    show: () => void;
    focus: () => void;
};

export function activateExistingWorkspace(windows: WorkspaceWindow[], preferred?: WorkspaceWindow): boolean {
    const target = [preferred, ...windows].find(
        (window) => window && windows.includes(window) && !window.isDestroyed()
    );
    if (!target) return false;
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
    return true;
}
