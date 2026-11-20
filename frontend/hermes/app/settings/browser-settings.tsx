// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { Button } from "@hermes/components/ui/button";
import { Input } from "@hermes/components/ui/input";
import { Globe, Settings2 } from "@hermes/lib/icons";
import { useState, type ReactNode } from "react";
import { validateBrowserPreferences, type BrowserPreferences } from "./browser-preferences";
import { ListRow, SettingsContent, SettingsSection, ToggleRow } from "./primitives";

const SearchProviders = [
    ["Google", "https://www.google.com/search?q={query}"],
    ["DuckDuckGo", "https://duckduckgo.com/?q={query}"],
    ["Bing", "https://www.bing.com/search?q={query}"],
] as const;
const SelectClass =
    "h-9 w-full min-w-40 cursor-pointer border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BrowserSettings({
    initial,
    save,
    extraContent,
    onOpenSessions,
}: {
    initial: BrowserPreferences;
    save: (value: BrowserPreferences) => Promise<void>;
    extraContent?: ReactNode;
    onOpenSessions?: () => void;
}) {
    const [draft, setDraft] = useState(initial);
    const [saved, setSaved] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [customSearch, setCustomSearch] = useState(
        !SearchProviders.some(([, url]) => url === initial["web:defaultsearch"])
    );
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
    const update = <K extends keyof BrowserPreferences>(key: K, value: BrowserPreferences[K]) => {
        setDraft((current) => ({ ...current, [key]: value }));
        setMessage("");
        setError("");
    };
    const commit = async () => {
        const validation = validateBrowserPreferences(draft);
        if (validation) {
            setError(validation);
            return;
        }
        setBusy(true);
        setError("");
        try {
            await save(draft);
            setSaved(draft);
            setMessage("Browser preferences saved.");
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not save browser preferences.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <SettingsContent>
            <p className="mb-7 max-w-xl text-sm leading-6 text-muted-foreground">
                Make the workspace browser your own. Choose where to start, how to search, and how to keep accounts
                separate.
            </p>
            <fieldset disabled={busy} className="min-w-0">
                <SettingsSection title="Startup and navigation" icon={Globe}>
                    <ListRow
                        title="Start page"
                        description="The page used when opening a new browser. Use about:blank for an empty page."
                        action={
                            <Input
                                aria-label="Start page"
                                value={draft["web:defaulturl"]}
                                onChange={(event) => update("web:defaulturl", event.target.value)}
                                className="w-full border-border bg-background/40 sm:min-w-64"
                            />
                        }
                    />
                    <ToggleRow
                        label="Open links inside KronOS"
                        description="Use the workspace browser for links opened by KronOS."
                        checked={draft["web:openlinksinternally"]}
                        onChange={(value) => update("web:openlinksinternally", value)}
                    />
                </SettingsSection>
                <SettingsSection title="Search" icon={Settings2}>
                    <ListRow
                        title="Search engine"
                        description="Used when you enter a search in the address bar."
                        action={
                            <select
                                aria-label="Search engine"
                                className={SelectClass}
                                value={customSearch ? "custom" : draft["web:defaultsearch"]}
                                onChange={(event) => {
                                    setCustomSearch(event.target.value === "custom");
                                    if (event.target.value !== "custom")
                                        update("web:defaultsearch", event.target.value);
                                }}
                            >
                                {SearchProviders.map(([label, url]) => (
                                    <option key={label} value={url}>
                                        {label}
                                    </option>
                                ))}
                                <option value="custom">Custom search engine</option>
                            </select>
                        }
                    />
                    {customSearch && (
                        <ListRow
                            title="Search URL"
                            description="Include {query} where the search terms belong."
                            action={
                                <Input
                                    aria-label="Search URL"
                                    value={draft["web:defaultsearch"]}
                                    onChange={(event) => update("web:defaultsearch", event.target.value)}
                                    className="w-full border-border bg-background/40 sm:min-w-64"
                                />
                            }
                        />
                    )}
                </SettingsSection>
            </fieldset>
            <div className="mb-8 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <Button className="cursor-pointer" disabled={!dirty || busy} onClick={() => void commit()}>
                    {busy ? "Saving..." : "Save changes"}
                </Button>
                <Button
                    className="cursor-pointer"
                    variant="ghost"
                    disabled={!dirty || busy}
                    onClick={() => {
                        setDraft(saved);
                        setCustomSearch(!SearchProviders.some(([, url]) => url === saved["web:defaultsearch"]));
                        setError("");
                        setMessage("");
                    }}
                >
                    Discard changes
                </Button>
                <span role="status" className="text-xs text-muted-foreground">
                    {message || (dirty ? "Unsaved changes" : "")}
                </span>
                {error && (
                    <p role="alert" className="w-full text-sm text-destructive">
                        {error}
                    </p>
                )}
            </div>
            {onOpenSessions && (
                <SettingsSection title="Browser sessions" icon={Globe}>
                    <ListRow
                        title="Separate your browsing accounts"
                        description="Work and Personal keep separate cookies and website storage. Private tabs use temporary sessions."
                        action={
                            <Button variant="outline" className="cursor-pointer" onClick={onOpenSessions}>
                                Manage sessions
                            </Button>
                        }
                    />
                </SettingsSection>
            )}
            {extraContent}
            <SettingsSection title="Site permissions and activity" icon={Globe}>
                <ListRow
                    title="Permissions are managed per website"
                    description="Open a website’s browser menu to manage camera, microphone, location, notifications, and clipboard access. The same menu includes the tab’s history and session downloads."
                />
            </SettingsSection>
        </SettingsContent>
    );
}
