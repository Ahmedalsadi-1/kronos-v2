// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import arcIcon from "@/app/asset/browser-icons/arc.png";
import chromeIcon from "@/app/asset/browser-icons/chrome.png";
import firefoxIcon from "@/app/asset/browser-icons/firefox.png";
import safariIcon from "@/app/asset/browser-icons/safari.png";
import {
    MaxBookmarkImportSize,
    MigrationBrowsers,
    normalizeMigrationBookmark,
    type MigratedExtension,
    type MigrationBrowser,
} from "@/types/browser-migration";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { readBookmarkExport } from "./browser-bookmark-import";

const BrowserIcons = { safari: safariIcon, arc: arcIcon, firefox: firefoxIcon, chrome: chromeIcon };

type BrowserMigrationDialogProps = {
    api: Pick<ElectronApi, "browserMigration" | "openExternal" | "getPlatform">;
    guestId?: number;
    profile?: string;
    url?: string;
    onProfileChange?: (profile: string) => void;
    onClose: () => void;
};

export function BrowserMigrationDialog({
    api,
    guestId,
    profile = "default",
    url = "",
    onProfileChange,
    onClose,
}: BrowserMigrationDialogProps) {
    const dialog = useRef<HTMLDialogElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const title = useId();
    const [browser, setBrowser] = useState<MigrationBrowser>("safari");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [installed, setInstalled] = useState<{ guestId: number; extensions: MigratedExtension[] }>(null);
    const supportsExtensions = profile === "work" || profile === "personal";
    const canImportExtension = browser === "arc" || browser === "chrome";
    const canOpenApp = api.getPlatform() === "darwin";
    const page = normalizeMigrationBookmark(url, "")?.url;
    const extensions = supportsExtensions && installed?.guestId === guestId ? installed.extensions : [];

    useEffect(() => {
        const element = dialog.current;
        element.showModal();
        return () => element.close();
    }, []);

    useEffect(() => {
        if (!supportsExtensions || guestId == null) return;
        let current = true;
        void api.browserMigration({ action: "extensions", guestId }).then(
            (result) => {
                if (current) setInstalled({ guestId, extensions: result.extensions ?? [] });
            },
            (error: unknown) => {
                if (current) setStatus(error instanceof Error ? error.message : "Could not read installed extensions.");
            }
        );
        return () => {
            current = false;
        };
    }, [api, guestId, supportsExtensions]);

    async function run(operation: () => Promise<void>) {
        setBusy(true);
        setStatus("");
        try {
            await operation();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Browser setup could not complete.");
        } finally {
            setBusy(false);
        }
    }

    function importBookmarks(event: ChangeEvent<HTMLInputElement>) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        void run(async () => {
            if (file.size > MaxBookmarkImportSize) throw new Error("Choose a bookmarks file under 8 MB.");
            const bookmarks = readBookmarkExport(await file.text(), /\.(md|txt)$/i.test(file.name));
            if (bookmarks.length === 0) {
                setStatus("This export has no web bookmarks.");
                return;
            }
            const { imported } = await api.browserMigration({ action: "bookmarks", bookmarks });
            setStatus(
                imported
                    ? `Added ${imported} ${imported === 1 ? "bookmark" : "bookmarks"} to KronOS.`
                    : "These bookmarks have already been imported."
            );
        });
    }

    return (
        <dialog
            ref={dialog}
            aria-labelledby={title}
            className="fixed m-auto max-h-[90vh] w-[min(31rem,calc(100%-2rem))] overflow-auto rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/50"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <header className="mb-4 flex items-center justify-between gap-4">
                <h2 id={title} className="text-lg font-semibold">
                    Browser import and passwords
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer rounded-md px-2 py-1 hover:bg-muted"
                    aria-label="Close browser import"
                >
                    ×
                </button>
            </header>
            <section aria-label="Bookmarks" className="space-y-2 pb-4">
                <h3 className="font-medium">Import bookmarks</h3>
                <div role="group" aria-label="Source browser" className="flex flex-wrap gap-2">
                    {(Object.keys(MigrationBrowsers) as MigrationBrowser[]).map((id) => (
                        <button
                            key={id}
                            type="button"
                            aria-label={MigrationBrowsers[id]}
                            title={MigrationBrowsers[id]}
                            aria-pressed={browser === id}
                            disabled={busy}
                            className="grid size-12 cursor-pointer place-items-center rounded-xl border border-border hover:bg-muted aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-current"
                            onClick={() => {
                                setBrowser(id);
                                setStatus("");
                            }}
                        >
                            <img src={BrowserIcons[id]} width={29} height={29} alt="" />
                        </button>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground">
                    {browser === "arc"
                        ? "Choose Arc Data Export.md from Arc Settings → Advanced, or an HTML bookmark export."
                        : browser === "safari"
                          ? "Choose Safari’s HTML bookmarks file. If Safari exported a ZIP, unzip it and select the bookmarks HTML file."
                          : `Choose the HTML bookmarks file exported from ${MigrationBrowsers[browser]}.`}
                </p>
                <input
                    ref={input}
                    hidden
                    type="file"
                    accept={browser === "arc" ? ".md,.txt,.html,.htm" : ".html,.htm"}
                    onChange={importBookmarks}
                />
                <button
                    type="button"
                    disabled={busy}
                    className="cursor-pointer rounded-md bg-muted px-3 py-1.5 text-sm"
                    onClick={() => input.current?.click()}
                >
                    Choose bookmarks file
                </button>
            </section>
            <section aria-label="Extensions" className="space-y-2 border-t border-border py-4">
                <h3 className="font-medium">Extensions</h3>
                {onProfileChange ? (
                    <>
                        <p className="text-sm text-muted-foreground">
                            {canImportExtension
                                ? "Choose a compatible Chromium extension folder containing manifest.json."
                                : "Safari and Firefox packages can’t be imported directly. Choose a Chromium build if the developer provides one."}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <label className="flex items-center gap-2">
                                <span>Browser profile</span>
                                <select
                                    value={profile}
                                    disabled={busy}
                                    className="rounded-md bg-muted p-1.5"
                                    onChange={(event) => {
                                        setInstalled(null);
                                        setStatus("");
                                        onProfileChange(event.target.value);
                                    }}
                                >
                                    <option value="default">Default</option>
                                    <option value="work">Work</option>
                                    <option value="personal">Personal</option>
                                    <option value="private">Private</option>
                                </select>
                            </label>
                            <button
                                type="button"
                                disabled={busy || !supportsExtensions || guestId == null}
                                className="cursor-pointer rounded-md bg-muted px-3 py-1.5 disabled:opacity-50"
                                onClick={() =>
                                    void run(async () => {
                                        const result = await api.browserMigration({
                                            action: "install",
                                            guestId,
                                            browser,
                                        });
                                        setInstalled({ guestId, extensions: result.extensions ?? [] });
                                        if (result.installed)
                                            setStatus(`${result.installed} loaded. Reload the page to use it.`);
                                    })
                                }
                            >
                                Import extension folder
                            </button>
                        </div>
                        {!supportsExtensions && (
                            <p className="text-xs text-muted-foreground">
                                Extensions run in the Work and Personal profiles.
                            </p>
                        )}
                        {extensions.length > 0 && (
                            <ul className="space-y-1 text-sm">
                                {extensions.map((extension) => (
                                    <li key={extension.id} className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 break-all">{extension.name}</span>
                                        <button
                                            type="button"
                                            className="cursor-pointer rounded-md px-2 py-1 underline"
                                            disabled={busy}
                                            aria-label={`Remove ${extension.name}`}
                                            onClick={() =>
                                                void run(async () => {
                                                    const result = await api.browserMigration({
                                                        action: "remove",
                                                        guestId,
                                                        id: extension.id,
                                                    });
                                                    setInstalled({ guestId, extensions: result.extensions ?? [] });
                                                    setStatus(`${extension.name} removed.`);
                                                })
                                            }
                                        >
                                            Remove
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Open Browser import and passwords in a Web widget to import extensions into a Work or Personal
                        profile.
                    </p>
                )}
            </section>
            <section aria-label="Password manager" className="space-y-2 border-t border-border pt-4">
                <h3 className="font-medium">Use your password manager</h3>
                <p className="text-sm text-muted-foreground">
                    Open your vault app to fill credentials yourself, or open this page in your system browser to use
                    its password-manager autofill.
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                    {canOpenApp && (
                        <button
                            type="button"
                            disabled={busy}
                            className="cursor-pointer rounded-md bg-muted px-3 py-1.5"
                            onClick={() =>
                                void run(async () => {
                                    await api.browserMigration({ action: "password-manager" });
                                })
                            }
                        >
                            Open password manager
                        </button>
                    )}
                    {page && (
                        <button
                            type="button"
                            className="cursor-pointer rounded-md bg-muted px-3 py-1.5"
                            onClick={() => api.openExternal(page)}
                        >
                            Open page in system browser
                        </button>
                    )}
                </div>
            </section>
            <p role="status" className="mt-3 min-h-5 text-sm">
                {busy ? "Working…" : status}
            </p>
        </dialog>
    );
}
