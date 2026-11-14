// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { dispatchComputerUseControl } from "@/app/components/computer-use-status-card";
import { focusOSSession } from "@/app/workspace/command-center-events";
import { isAgentActivityActive, type AgentActivitySurface } from "../../../types/agent-activity";
import type { KrontermHudModeState } from "./kronterm-hud-mode";

const HudModeSurfaceIcons: Record<AgentActivitySurface, string> = {
    browser: "globe",
    desktop: "display",
    file: "file-code",
    panel: "sparkles",
    sandbox: "box",
    terminal: "terminal",
};

export function KrontermHudModeCard({
    hudGeometry,
    mode,
}: {
    hudGeometry: { x: number; y: number; width: number };
    mode: KrontermHudModeState;
}) {
    const activity = mode.activity;
    if (!mode.active || activity == null) {
        return null;
    }
    const active = isAgentActivityActive(activity.phase);
    return (
        <aside
            aria-label="KronOS HUD mode: computer use"
            className="pointer-events-auto fixed z-[115] flex flex-col gap-2 overflow-hidden rounded-xl border border-accent/40 bg-[#080a0df2] p-2.5 text-white/90 shadow-2xl backdrop-blur-xl"
            style={{ left: hudGeometry.x, width: hudGeometry.width, bottom: window.innerHeight - hudGeometry.y + 8 }}
        >
            <header className="flex items-center justify-between gap-2 px-0.5">
                <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.08em] text-white/45 uppercase">
                    <i aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
                    KronOS HUD mode · Computer use
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] capitalize">
                    <i
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-white/40"}`}
                    />
                    {active ? "Live" : activity.phase}
                </span>
            </header>
            {mode.previewUrl != null ? (
                <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/50">
                    <img
                        src={mode.previewUrl}
                        alt={`${activity.appname ?? activity.surface} screenshot`}
                        className="max-h-full max-w-full object-contain"
                    />
                </div>
            ) : null}
            <p className="flex items-center gap-1.5 truncate px-0.5 text-[10px] text-white/60">
                <i aria-hidden="true" className={`fa-solid fa-${HudModeSurfaceIcons[activity.surface]} opacity-60`} />
                <span className="truncate">
                    {active
                        ? activity.detail?.trim() || `Working in your ${activity.surface}`
                        : `${activity.phase} in ${mode.elapsedSeconds}s — ${activity.detail?.trim() || `the ${activity.surface} workflow finished`}`}
                </span>
            </p>
            <footer className="flex items-center justify-end gap-1.5">
                {activity.blockid != null && (
                    <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/20"
                        onClick={() => focusOSSession(activity.blockid!)}
                    >
                        Inspect app
                    </button>
                )}
                <button
                    type="button"
                    className="cursor-pointer rounded-lg bg-accent/80 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-accent"
                    onClick={() => dispatchComputerUseControl("takeover", activity)}
                >
                    Take control
                </button>
            </footer>
        </aside>
    );
}
