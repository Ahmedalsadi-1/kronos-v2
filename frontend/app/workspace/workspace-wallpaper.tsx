// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi, getSettingsKeyAtom } from "@/store/global";
import { RpcApi } from "@/store/wshclientapi";
import { TabRpcClient } from "@/store/wshrpcutil";
import { ListRow } from "@hermes/app/settings/primitives";
import { useAtomValue } from "jotai";
import { memo, useEffect, useState } from "react";

const MinSurfaceOpacity = 0;
const MaxSurfaceOpacity = 100;

function isVideoWallpaper(value: string): boolean {
    return /\.(mp4|webm|mov)(\?.*)?$/i.test(value);
}

function normalizeWallpaperSource(value: string): string {
    if (/^(https?|file|data):/i.test(value)) {
        return value;
    }
    return "file://" + value;
}

// Publishes the surface-transparency setting as a CSS variable consumed by
// blocks, the launcher rail, and web mode. Kept beside the wallpaper so both
// appearance settings apply/remove together.
function useSurfaceAlphaEffect(): void {
    const surfaceOpacity = useAtomValue(getSettingsKeyAtom("window:surfaceopacity" as never));
    useEffect(() => {
        if (surfaceOpacity == null) {
            document.documentElement.style.removeProperty("--kron-surface-alpha");
            return;
        }
        const clamped = Math.min(MaxSurfaceOpacity, Math.max(MinSurfaceOpacity, Number(surfaceOpacity) || 0));
        document.documentElement.style.setProperty("--kron-surface-alpha", String(clamped / 100));
    }, [surfaceOpacity]);
}

const WorkspaceWallpaper = memo(() => {
    useSurfaceAlphaEffect();
    const wallpaper = useAtomValue(getSettingsKeyAtom("window:wallpaper" as never));

    if (wallpaper == null || wallpaper === "") {
        return null;
    }

    const source = normalizeWallpaperSource(wallpaper);

    // pointer-events none keeps the layer purely visual; the subtle dim overlay
    // preserves widget legibility at high transparency.
    return (
        <div className="workspace-wallpaper" aria-hidden="true">
            {isVideoWallpaper(source) ? (
                <video className="workspace-wallpaper-media" src={source} autoPlay muted loop playsInline />
            ) : (
                <img className="workspace-wallpaper-media" src={source} alt="" />
            )}
            <div className="workspace-wallpaper-dim" />
        </div>
    );
});
WorkspaceWallpaper.displayName = "WorkspaceWallpaper";

export function WorkspaceWallpaperSettings() {
    const wallpaper = useAtomValue(getSettingsKeyAtom("window:wallpaper"));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const change = async (clear: boolean) => {
        setBusy(true);
        setError("");
        try {
            const value = clear ? "" : (await getApi().selectFiles())[0];
            if (value == null) return;
            if (!clear && !/\.(avif|gif|jpe?g|png|webp|bmp|svg|heic)$/i.test(value)) {
                setError("Choose an image file for your workspace background.");
                return;
            }
            await RpcApi.SetConfigCommand(TabRpcClient, { "window:wallpaper": value });
        } catch {
            setError("Could not update the workspace background.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <ListRow
            title="Workspace background"
            description={wallpaper ? "Custom background" : "Default background"}
            below={
                error && (
                    <p role="alert" className="mt-1 text-xs text-error">
                        {error}
                    </p>
                )
            }
            action={
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="kron-button kron-button-secondary cursor-pointer rounded px-2 py-1 text-xs"
                        disabled={busy}
                        onClick={() => void change(false)}
                    >
                        Choose image…
                    </button>
                    {wallpaper && (
                        <button
                            type="button"
                            className="kron-button kron-button-ghost cursor-pointer rounded px-2 py-1 text-xs"
                            disabled={busy}
                            onClick={() => void change(true)}
                        >
                            Reset background
                        </button>
                    )}
                </div>
            }
        />
    );
}

export { WorkspaceWallpaper };
