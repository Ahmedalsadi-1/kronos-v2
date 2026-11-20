// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import { readBookmarkExport } from "@/app/view/webview/browser-bookmark-import";
import { MaxBookmarkImportSize, type MigratedExtension } from "@/types/browser-migration";
import { ListRow, SettingsSection } from "@hermes/app/settings/primitives";
import { Button } from "@hermes/components/ui/button";
import { Download, KeyRound, Package } from "@hermes/lib/icons";
import type { WebviewTag } from "electron";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

type SetupApi = Pick<ElectronApi, "browserMigration" | "getPlatform">;
type ExtensionTarget = { id: number; label: string };
const ControlClass =
    "h-9 max-w-full cursor-pointer rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function KronSettingsBrowserSetup({ api = getApi() }: { api?: SetupApi }) {
    const fileInput = useRef<HTMLInputElement>(null);
    const operation = useRef(0);
    const [targets, setTargets] = useState<ExtensionTarget[]>([]);
    const [guestId, setGuestId] = useState<number>(null);
    const [extensions, setExtensions] = useState<MigratedExtension[]>([]);
    const [busy, setBusy] = useState(false);
    const [loadingExtensions, setLoadingExtensions] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const refreshTargets = useCallback(() => {
        const found: ExtensionTarget[] = [];
        for (const element of document.querySelectorAll<WebviewTag>("webview")) {
            const partition = element.getAttribute("partition");
            if (partition !== "persist:kronterm-work" && partition !== "persist:kronterm-personal") continue;
            try {
                const id = element.getWebContentsId();
                const url = element.getURL();
                const location = URL.canParse(url) ? new URL(url).hostname || "New tab" : "New tab";
                found.push({ id, label: `${partition.endsWith("work") ? "Work" : "Personal"} · ${location}` });
            } catch {
                // A guest can detach while the settings popup is open.
            }
        }
        setTargets(found);
        setGuestId((current) => (found.some((target) => target.id === current) ? current : (found[0]?.id ?? null)));
    }, []);

    useEffect(refreshTargets, [refreshTargets]);
    useEffect(() => {
        let active = true;
        setExtensions([]);
        if (guestId == null) {
            setLoadingExtensions(false);
            return;
        }
        setLoadingExtensions(true);
        setError("");
        void api
            .browserMigration({ action: "extensions", guestId })
            .then(
                (result) => {
                    if (active) setExtensions(result.extensions ?? []);
                },
                (failure: unknown) => {
                    if (active) setError(failure instanceof Error ? failure.message : "Could not read extensions.");
                }
            )
            .finally(() => {
                if (active) setLoadingExtensions(false);
            });
        return () => {
            active = false;
        };
    }, [api, guestId]);

    useEffect(
        () => () => {
            operation.current++;
        },
        []
    );

    async function run(action: () => Promise<string>) {
        const current = ++operation.current;
        setBusy(true);
        setStatus("");
        setError("");
        try {
            const message = await action();
            if (current === operation.current) setStatus(message);
        } catch (failure) {
            if (current === operation.current)
                setError(failure instanceof Error ? failure.message : "Browser setup could not complete.");
        } finally {
            if (current === operation.current) setBusy(false);
        }
    }

    function importBookmarks(event: ChangeEvent<HTMLInputElement>) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        void run(async () => {
            if (file.size > MaxBookmarkImportSize) throw new Error("Choose a bookmarks file under 8 MB.");
            const bookmarks = readBookmarkExport(await file.text(), /\.(md|txt)$/i.test(file.name));
            if (!bookmarks.length) return "This file has no supported web bookmarks.";
            const result = await api.browserMigration({ action: "bookmarks", bookmarks });
            return result.imported
                ? `Imported ${result.imported} ${result.imported === 1 ? "bookmark" : "bookmarks"}.`
                : "These bookmarks have already been imported.";
        });
    }

    return (
        <>
            <SettingsSection title="Import" icon={Download}>
                <ListRow
                    title="Import bookmarks"
                    description="Bring bookmarks from Safari, Chrome, Firefox, or Arc. Choose an HTML export or Arc’s Markdown export."
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer"
                            disabled={busy}
                            onClick={() => fileInput.current?.click()}
                        >
                            Choose bookmarks file
                        </Button>
                    }
                />
                <input
                    ref={fileInput}
                    type="file"
                    accept=".html,.htm,.md,.txt"
                    hidden
                    aria-label="Bookmarks export"
                    onChange={importBookmarks}
                />
            </SettingsSection>
            <SettingsSection title="Extensions" icon={Package}>
                <ListRow
                    title="Browser session"
                    description="Extensions are shared by tabs in the same Work or Personal session. Open a tab in one of these sessions to manage its extensions."
                    action={
                        <div className="flex max-w-full flex-wrap items-center gap-2">
                            {targets.length > 0 && (
                                <select
                                    aria-label="Extension browser session"
                                    className={ControlClass}
                                    disabled={busy}
                                    value={guestId ?? ""}
                                    onChange={(event) => setGuestId(Number(event.target.value))}
                                >
                                    {targets.map((target) => (
                                        <option key={target.id} value={target.id}>
                                            {target.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                className="cursor-pointer"
                                disabled={busy || loadingExtensions}
                                onClick={refreshTargets}
                            >
                                Refresh tabs
                            </Button>
                        </div>
                    }
                />
                {guestId != null && (
                    <>
                        <ListRow
                            title="Import extension folder"
                            description="Choose a compatible Chromium extension folder containing manifest.json. Reload your browser tabs after installing."
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="cursor-pointer"
                                    disabled={busy || loadingExtensions}
                                    onClick={() =>
                                        void run(async () => {
                                            const result = await api.browserMigration({
                                                action: "install",
                                                guestId,
                                                browser: "chrome",
                                            });
                                            setExtensions(result.extensions ?? []);
                                            return result.canceled
                                                ? "Extension import canceled."
                                                : result.installed
                                                  ? `${result.installed} installed. Reload your tabs to use it.`
                                                  : "No extension was installed.";
                                        })
                                    }
                                >
                                    Choose folder
                                </Button>
                            }
                        />
                        {extensions.map((extension) => (
                            <ListRow
                                key={extension.id}
                                title={extension.name}
                                description="Installed in the selected browser session."
                                action={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="cursor-pointer"
                                        disabled={busy}
                                        aria-label={`Remove ${extension.name}`}
                                        onClick={() =>
                                            void run(async () => {
                                                const result = await api.browserMigration({
                                                    action: "remove",
                                                    guestId,
                                                    id: extension.id,
                                                });
                                                setExtensions(result.extensions ?? []);
                                                return `${extension.name} removed.`;
                                            })
                                        }
                                    >
                                        Remove
                                    </Button>
                                }
                            />
                        ))}
                        <p role="status" className="px-1 py-3 text-xs text-muted-foreground">
                            {loadingExtensions
                                ? "Loading extensions..."
                                : extensions.length
                                  ? `${extensions.length} installed`
                                  : "No extensions installed in this session."}
                        </p>
                    </>
                )}
            </SettingsSection>
            <SettingsSection title="Passwords" icon={KeyRound}>
                <ListRow
                    title="Use your password manager"
                    description={
                        api.getPlatform() === "darwin"
                            ? "Choose your installed password manager app to manage your saved credentials."
                            : "Use your password manager app, or open a site in your system browser for autofill."
                    }
                    action={
                        api.getPlatform() === "darwin" && (
                            <Button
                                type="button"
                                variant="outline"
                                className="cursor-pointer"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        const result = await api.browserMigration({ action: "password-manager" });
                                        return result.canceled
                                            ? "Password manager selection canceled."
                                            : "Password manager opened.";
                                    })
                                }
                            >
                                Open password manager
                            </Button>
                        )
                    }
                />
            </SettingsSection>
            <p role="status" className="mb-4 text-sm text-muted-foreground">
                {busy ? "Working..." : status}
            </p>
            {error && (
                <p role="alert" className="mb-4 text-sm text-destructive">
                    {error}
                </p>
            )}
        </>
    );
}
