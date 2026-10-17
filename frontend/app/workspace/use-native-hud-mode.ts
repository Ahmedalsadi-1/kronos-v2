// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { useEffect } from "react";

export function useNativeHudMode(active: boolean, keepWorkspaceVisible: boolean, sessionId: () => string): void {
    useEffect(() => {
        document.documentElement.toggleAttribute("data-kronterm-hud-mode", active && !keepWorkspaceVisible);
        getApi().setHudWindowMode(active, active ? sessionId() : undefined, { keepWorkspaceVisible });
        // A renderer remount must not close the native companion or overwrite the user's persisted mode.
        return () => document.documentElement.removeAttribute("data-kronterm-hud-mode");
    }, [active, keepWorkspaceVisible]);
}
