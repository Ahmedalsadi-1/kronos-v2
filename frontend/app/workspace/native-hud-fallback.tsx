// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";

export function NativeHudFallback({ sessionId }: { sessionId?: string }) {
    const api = getApi();
    return (
        <nav
            className="flex shrink-0 items-center flex-wrap justify-center gap-1 border-t border-white/10 p-1"
            aria-label="Notch recovery and applications"
        >
            <button
                type="button"
                className="cursor-pointer rounded px-2 py-1 text-xs text-violet-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-violet-300"
                onClick={() => api.setHudWindowMode(true, sessionId)}
            >
                Retry notch
            </button>
            {(
                [
                    ["web", "fa-globe", "Browser"],
                    ["machines", "fa-desktop", "Sandbox"],
                    ["android", "fa-mobile-screen", "Android"],
                    ["iphone", "fa-mobile-screen-button", "iPhone"],
                    ["apps", "fa-window-maximize", "Streamed apps"],
                    ["files", "fa-folder", "Files"],
                    ["terminal", "fa-terminal", "Terminal"],
                    ["widget", "fa-table-cells-large", "Widget"],
                    ["exit", "fa-arrow-right-from-bracket", "Exit notch"],
                ] as const
            ).map(([app, icon, label]) => (
                <button
                    key={app}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => (app === "exit" ? api.requestNativeHudExit() : api.requestNativeHudLaunch(app))}
                    className="grid size-7 cursor-pointer place-items-center rounded text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-violet-300"
                >
                    <i className={`fa-solid ${icon} text-xs`} aria-hidden="true" />
                </button>
            ))}
        </nav>
    );
}
