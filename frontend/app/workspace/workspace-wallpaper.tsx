// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi, getSettingsKeyAtom } from "@/store/global";
import { RpcApi } from "@/store/wshclientapi";
import { TabRpcClient } from "@/store/wshrpcutil";
import { getWebServerEndpoint } from "@/util/endpoints";
import { ListRow } from "@hermes/app/settings/primitives";
import { useAtomValue } from "jotai";
import { memo, useEffect, useId, useRef, useState } from "react";

const MinSurfaceOpacity = 0;
const MaxSurfaceOpacity = 100;

function isVideoWallpaper(value: string): boolean {
    return /\.(mp4|webm|mov)(\?.*)?$/i.test(value);
}

function normalizeWallpaperSource(value: string): string {
    if (/^(https?|data):/i.test(value)) {
        return value;
    }
    let localPath = value;
    if (/^file:/i.test(value)) {
        try {
            const url = new URL(value);
            localPath = (url.hostname ? `//${url.hostname}` : "") + decodeURIComponent(url.pathname);
        } catch {
            return undefined;
        }
    }
    const path = /^\/[a-z]:\//i.test(localPath) ? localPath.slice(1) : localPath;
    return `${getWebServerEndpoint()}/wave/stream-local-file?${new URLSearchParams({ path })}`;
}

function clampSurfaceOpacity(value: number): number {
    return Math.min(MaxSurfaceOpacity, Math.max(MinSurfaceOpacity, value));
}

export function useWorkspaceSurfaceOpacity(): void {
    const surfaceOpacity = useAtomValue(getSettingsKeyAtom("window:surfaceopacity"));
    useEffect(() => {
        if (surfaceOpacity == null) return;
        const opacity = clampSurfaceOpacity(surfaceOpacity);
        const style = document.documentElement.style;
        style.setProperty("--kron-surface-alpha", String(opacity / 100));
        style.setProperty("--kron-live-widget-alpha", String(opacity / 100));
        style.setProperty("--kron-widget-opacity", `${opacity}%`);
        return () => {
            style.removeProperty("--kron-surface-alpha");
            style.removeProperty("--kron-widget-opacity");
            style.removeProperty("--kron-live-widget-alpha");
        };
    }, [surfaceOpacity]);
}

const WorkspaceWallpaper = memo(() => {
    const wallpaper = useAtomValue(getSettingsKeyAtom("window:wallpaper"));

    if (wallpaper == null || wallpaper === "") {
        return null;
    }

    const source = normalizeWallpaperSource(wallpaper);
    if (source == null) return null;

    return (
        <div
            className="workspace-wallpaper pointer-events-none absolute inset-0 -z-1 overflow-hidden"
            aria-hidden="true"
        >
            {isVideoWallpaper(wallpaper) ? (
                <video
                    className="workspace-wallpaper-media h-full w-full object-cover"
                    src={source}
                    autoPlay
                    muted
                    loop
                    playsInline
                />
            ) : (
                <img className="workspace-wallpaper-media h-full w-full object-cover" src={source} alt="" />
            )}
        </div>
    );
});
WorkspaceWallpaper.displayName = "WorkspaceWallpaper";

export function WorkspaceWallpaperSettings() {
    const wallpaper = useAtomValue(getSettingsKeyAtom("window:wallpaper"));
    const fileInput = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const change = async (file: File | null) => {
        setBusy(true);
        setError("");
        try {
            const value = file == null ? "" : getApi().getPathForFile(file);
            if (file != null && !value) throw new Error("Wallpaper file path unavailable");
            await RpcApi.SetConfigCommand(TabRpcClient, { "window:wallpaper": value });
        } catch {
            setError("Could not update the workspace background.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <ListRow
                title="Workspace wallpaper"
                description={wallpaper ? wallpaper.split(/[\\/]/).pop() : "No wallpaper selected"}
                below={
                    error && (
                        <p role="alert" className="mt-1 text-xs text-error">
                            {error}
                        </p>
                    )
                }
                action={
                    <div className="flex flex-wrap gap-2">
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/avif,image/bmp,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"
                            hidden
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (file) void change(file);
                            }}
                        />
                        <button
                            type="button"
                            className="kron-button kron-button-secondary cursor-pointer rounded px-2 py-1 text-xs"
                            disabled={busy}
                            onClick={() => fileInput.current?.click()}
                        >
                            Choose image…
                        </button>
                        {wallpaper && (
                            <button
                                type="button"
                                className="kron-button kron-button-ghost cursor-pointer rounded px-2 py-1 text-xs"
                                disabled={busy}
                                onClick={() => void change(null)}
                            >
                                Remove wallpaper
                            </button>
                        )}
                    </div>
                }
            />
            <WidgetTransparencySettings />
        </>
    );
}

function WidgetTransparencySettings() {
    const sliderId = useId();
    const savedOpacity = useAtomValue(getSettingsKeyAtom("window:surfaceopacity")) ?? MaxSurfaceOpacity;
    const savedTransparency = MaxSurfaceOpacity - clampSurfaceOpacity(savedOpacity);
    const [draft, setDraft] = useState<number>();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const transparency = draft ?? savedTransparency;

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            await RpcApi.SetConfigCommand(TabRpcClient, { "window:surfaceopacity": MaxSurfaceOpacity - transparency });
        } catch {
            setError("Could not save widget transparency.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ListRow
            title={<label htmlFor={sliderId}>Widget transparency</label>}
            description="Adjust how much of the workspace shows through widgets."
            below={
                error && (
                    <p role="alert" className="mt-1 text-xs text-error">
                        {error}
                    </p>
                )
            }
            action={
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        id={sliderId}
                        className="w-28 cursor-pointer"
                        type="range"
                        min={MinSurfaceOpacity}
                        max={MaxSurfaceOpacity}
                        value={transparency}
                        aria-valuetext={`${transparency}% transparent`}
                        disabled={saving}
                        onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
                    />
                    <output htmlFor={sliderId} className="w-10 text-xs tabular-nums">
                        {transparency}%
                    </output>
                    <button
                        type="button"
                        className="kron-button kron-button-secondary cursor-pointer rounded px-2 py-1 text-xs"
                        disabled={saving || transparency === savedTransparency}
                        onClick={() => void save()}
                    >
                        Apply
                    </button>
                </div>
            }
        />
    );
}

export { WorkspaceWallpaper };
