// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import type { BrowserNavigationSnapshot } from "@/types/browser-navigation";
import {
    BrowserSitePermissions,
    type BrowserPermissionDecision,
    type BrowserSitePermission,
    type BrowserSiteSettings,
} from "@/types/browser-site-settings";
import { Download, FolderOpen } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties } from "react";

const PermissionLabels: Record<BrowserSitePermission, string> = {
    media: "Camera and microphone",
    geolocation: "Location",
    notifications: "Notifications",
    "clipboard-read": "Read clipboard",
};

export function BrowserSiteSettingsPanel({
    guestId,
    url,
    navigate,
    downloadsOnly = false,
}: {
    guestId: number;
    url: string;
    navigate?: (url: string) => void;
    downloadsOnly?: boolean;
}) {
    const [section, setSection] = useState<"permissions" | "history" | "downloads">(downloadsOnly ? "downloads" : "permissions");
    const [settings, setSettings] = useState<BrowserSiteSettings>();
    const [history, setHistory] = useState<BrowserNavigationSnapshot>();
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);
    useEffect(() => {
        let current = true;
        const load = async () => {
            if (!guestId) return;
            try {
                if (section === "history") {
                    const next = await getApi().browserNavigationHistory(guestId);
                    if (current) setHistory(next);
                } else {
                    const next = await getApi().browserSiteSettings({ guestId });
                    if (current) setSettings(next);
                }
            } catch (failure) {
                if (current) setError(failure instanceof Error ? failure.message : "Could not read browser settings.");
            }
        };
        setError("");
        if (section === "history") setHistory(undefined);
        else setSettings(undefined);
        void load();
        const timer = section === "downloads" ? window.setInterval(load, 1000) : undefined;
        return () => {
            current = false;
            if (timer) window.clearInterval(timer);
        };
    }, [guestId, section, url]);

    const changePermission = async (permission: BrowserSitePermission, decision: BrowserPermissionDecision) => {
        if (!settings?.origin || pending) return;
        setPending(true);
        setError("");
        try {
            setSettings(
                await getApi().browserSiteSettings({
                    guestId,
                    change: { origin: settings.origin, permission, decision },
                })
            );
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not save the permission.");
        } finally {
            setPending(false);
        }
    };

    return (
        <section aria-label="Site settings and activity" className="flex min-w-0 flex-col gap-4 text-[13px]">
            {downloadsOnly ? <h2 className="font-semibold">Downloads</h2> : <div
                className="flex flex-wrap gap-1 border-b border-border pb-2 [&>button]:cursor-pointer [&>button]:px-3 [&>button]:py-2 [&>button]:text-xs [&>button]:text-muted-foreground [&>button[aria-pressed=true]]:bg-foreground/10 [&>button[aria-pressed=true]]:text-foreground"
                role="group"
                aria-label="Browser settings sections"
            >
                <button
                    type="button"
                    aria-pressed={section === "permissions"}
                    onClick={() => setSection("permissions")}
                >
                    Site permissions
                </button>
                <button type="button" aria-pressed={section === "history"} onClick={() => setSection("history")}>
                    History
                </button>
                <button type="button" aria-pressed={section === "downloads"} onClick={() => setSection("downloads")}>
                    Downloads
                </button>
            </div>}
            {error && (
                <p role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {error}
                </p>
            )}
            {section === "permissions" && (
                <>
                    <p className="break-all border-b border-border pb-3 text-xs text-muted-foreground">
                        {settings?.origin ??
                            (settings ? "Open a website to manage its permissions." : "Loading site permissions…")}
                    </p>
                    {settings?.origin &&
                        BrowserSitePermissions.map((permission) => (
                            <label
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                                key={permission}
                            >
                                <span>{PermissionLabels[permission]}</span>
                                <select
                                    className="h-8 cursor-pointer border border-border bg-background px-2 text-xs focus-visible:outline focus-visible:outline-ring"
                                    value={settings.permissions[permission] ?? "default"}
                                    disabled={pending}
                                    onChange={(event) =>
                                        void changePermission(
                                            permission,
                                            event.target.value as BrowserPermissionDecision
                                        )
                                    }
                                >
                                    <option value="default">Default (blocked)</option>
                                    <option value="allow">Allow</option>
                                    <option value="block">Block</option>
                                </select>
                            </label>
                        ))}
                </>
            )}
            {section === "permissions" && settings?.origin && (
                <p className="text-xs leading-5 text-muted-foreground">
                    Changes apply to this website in the current browser profile. Permissions are blocked by default.
                </p>
            )}
            {section === "history" && (
                <div className="max-h-64 overflow-auto" aria-label="Tab history">
                    {history?.entries.length ? (
                        [...history.entries].reverse().map((entry, index) => (
                            <button
                                type="button"
                                key={index}
                                title={entry.url}
                                className="block w-full cursor-pointer truncate border-b border-border px-2 py-3 text-left text-xs hover:bg-foreground/5 focus-visible:outline focus-visible:outline-ring"
                                onClick={() => navigate?.(entry.url)}
                            >
                                {entry.title || entry.url}
                            </button>
                        ))
                    ) : (
                        <p>
                            {history === undefined && !error ? "Loading history…" : "No pages in this tab’s history."}
                        </p>
                    )}
                </div>
            )}
            {section === "downloads" && (
                <ul className="max-h-64 overflow-auto" aria-label="Session downloads">
                    {settings?.downloads.length ? (
                        settings.downloads.map((download) => (
                            <li key={download.id} className="border-b border-border px-2 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate" title={download.filename}>{download.filename}</span>
                                    {download.canReveal && (
                                        <button type="button" className="shrink-0 cursor-pointer p-1 hover:bg-foreground/10"
                                            aria-label={`Show ${download.filename} in folder`} title="Show in folder"
                                            onClick={() => {
                                                setError("");
                                                void getApi().browserSiteSettings({ guestId, revealDownloadId: download.id })
                                                    .catch(() => setError("Could not show the downloaded file."));
                                            }}>
                                            <FolderOpen size={16} />
                                        </button>
                                    )}
                                </div>
                                <small className="mt-1 block text-muted-foreground">
                                    {{ progressing: "Downloading", completed: "Completed", cancelled: "Cancelled",
                                        interrupted: "Interrupted" }[download.state]}
                                    {download.state === "progressing" && download.total > 0 && (
                                        <progress className="mt-1 block w-full" aria-label={`Downloading ${download.filename}`}
                                            value={download.received} max={download.total} />
                                    )}
                                </small>
                            </li>
                        ))
                    ) : (
                        <li>
                            {error
                                ? "Downloads are unavailable. Select this section again to retry."
                                : settings
                                  ? "No downloads in this browser session."
                                  : "Loading downloads…"}
                        </li>
                    )}
                </ul>
            )}
        </section>
    );
}

export function BrowserDownloadsButton({ guestId, url }: { guestId?: number; url: string }) {
    const id = useId();
    const anchorName = `--browser-downloads-${id.replace(/[^a-zA-Z0-9-]/g, "")}`;
    const [open, setOpen] = useState(false);
    return (
        <div className="webview-toolbar-menu">
            <button type="button" aria-label="Downloads" title="Downloads" disabled={guestId == null}
                popoverTarget={id} style={{ anchorName } as CSSProperties}>
                <Download size={16} aria-hidden="true" />
            </button>
            <div id={id} popover="auto" className="webview-toolbar-menu-popover p-3"
                style={{ positionAnchor: anchorName } as CSSProperties}
                onToggle={(event) => setOpen(event.newState === "open")}>
                {open && <BrowserSiteSettingsPanel guestId={guestId} url={url} downloadsOnly />}
            </div>
        </div>
    );
}
