// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { getApi } from "@/store/global";

export function NativeHudFallback({ sessionId }: { sessionId?: string }) {
    const api = getApi();
    return (
        <nav
            className="native-hud-recovery flex shrink-0 items-center flex-wrap justify-center gap-1 border-t p-2"
            aria-label="Notch recovery and applications"
        >
            <p role="status" className="w-full px-1 pb-1 text-xs">
                Your session is still open. Retry the notch or return to your workspace.
            </p>
            <SystemButton
                type="button"
                size="small"
                variant="tinted"
                className="cursor-pointer"
                onClick={() => api.setHudWindowMode(true, sessionId)}
            >
                Retry notch
            </SystemButton>
            {(
                [
                    ["web", "fa-globe", "Browser"],
                    ["machines", "fa-desktop", "Sandbox"],
                    ["android", "fa-mobile-screen", "Android (Labs)"],
                    ["iphone", "fa-mobile-screen-button", "iPhone (Labs)"],
                    ["apps", "fa-window-maximize", "Streamed apps"],
                    ["files", "fa-folder", "Files"],
                    ["terminal", "fa-terminal", "Terminal"],
                    ["widget", "fa-table-cells-large", "Widget"],
                    ["exit", "fa-arrow-right-from-bracket", "Return to workspace"],
                ] as const
            ).map(([app, icon, label]) => (
                <SystemButton
                    key={app}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => (app === "exit" ? api.requestNativeHudExit() : api.requestNativeHudLaunch(app))}
                    size="small"
                    className="grid size-8 cursor-pointer place-items-center"
                >
                    <i className={`fa-solid ${icon} text-xs`} aria-hidden="true" />
                </SystemButton>
            ))}
        </nav>
    );
}
