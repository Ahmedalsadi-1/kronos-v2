// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import type { BrowserSessionInfo, BrowserSessionsCommand } from "@/types/browser-sessions";
import { ListRow, SettingsContent, SettingsSection } from "@hermes/app/settings/primitives";
import { Button } from "@hermes/components/ui/button";
import { Globe } from "@hermes/lib/icons";
import { useCallback, useEffect, useState } from "react";

type ClearRequest = Extract<BrowserSessionsCommand, { action: "clear" }>;

function cacheLabel(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KronSettingsBrowserSessionsContent() {
    const [sessions, setSessions] = useState<BrowserSessionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [pending, setPending] = useState<ClearRequest>(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setSessions(await getApi().browserSessions({ action: "list" }));
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not load browser sessions.");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    const clear = async () => {
        if (!pending) return;
        const request = pending;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            setSessions(await getApi().browserSessions(request));
            setPending(null);
            setMessage("Browser data cleared. Reload open pages to apply the change.");
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not clear browser data.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsContent>
            <p className="mb-5 max-w-2xl text-sm leading-6 text-muted-foreground">
                Keep work and personal sign-ins separate. Choose a session from the browser toolbar to use its cookies
                and website storage. Open tab counts are for this workspace tab.
            </p>
            <div className="mb-5 flex items-center gap-3">
                <Button
                    className="cursor-pointer"
                    variant="outline"
                    disabled={loading || busy}
                    onClick={() => void load()}
                >
                    {loading ? "Refreshing..." : "Refresh sessions"}
                </Button>
                <span role="status" className="text-sm text-muted-foreground">
                    {loading ? "Loading browser sessions..." : message}
                </span>
            </div>
            {error && (
                <p role="alert" className="mb-5 text-sm text-destructive">
                    {error}
                </p>
            )}
            {sessions.map((profile) => (
                <SettingsSection key={profile.id} title={profile.name} icon={Globe}>
                    <ListRow
                        title={profile.persistent ? "Persistent session" : "Private session"}
                        description={
                            profile.shared
                                ? "Shares the app's default storage. Data controls are unavailable here to protect app sign-ins."
                                : profile.persistent
                                  ? "Cookies and website storage are kept across app restarts."
                                  : "Temporary storage is kept in memory and discarded when the app quits."
                        }
                        hint={`${profile.openTabs} open ${profile.openTabs === 1 ? "tab" : "tabs"}${profile.cookies != null ? ` · ${profile.cookies} cookies · ${cacheLabel(profile.cacheBytes ?? 0)} cache` : ""}`}
                    />
                    {!profile.shared && (
                        <ListRow
                            title="Browser data"
                            description="Clear only this session's data. Other sessions are kept."
                            action={
                                <div className="flex flex-wrap gap-2">
                                    {(
                                        [
                                            ["cache", "Clear cache"],
                                            ["cookies", "Clear cookies"],
                                            ["site-data", "Clear site data"],
                                        ] as const
                                    ).map(([data, label]) => (
                                        <Button
                                            key={data}
                                            className="cursor-pointer"
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => {
                                                setPending({ action: "clear", id: profile.id, data });
                                                setMessage("");
                                            }}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                            }
                        />
                    )}
                    {pending?.id === profile.id && (
                        <div
                            role="region"
                            aria-label={`Confirm clearing ${profile.name}`}
                            className="border-t border-border py-4"
                        >
                            <p className="mb-3 text-sm">
                                Clear {pending.data === "site-data" ? "cookies and website storage" : pending.data} for{" "}
                                {profile.name}?
                                {pending.data !== "cache" &&
                                    " This can sign you out of websites and remove website data."}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    className="cursor-pointer"
                                    variant="destructive"
                                    disabled={busy}
                                    onClick={() => void clear()}
                                >
                                    {busy ? "Clearing..." : "Confirm clear"}
                                </Button>
                                <Button
                                    className="cursor-pointer"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setPending(null)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </SettingsSection>
            ))}
            {!loading && sessions.length > 0 && !sessions.some((profile) => !profile.persistent) && (
                <p className="mb-6 text-sm text-muted-foreground">
                    No private sessions are open in this workspace tab.
                </p>
            )}
        </SettingsContent>
    );
}
