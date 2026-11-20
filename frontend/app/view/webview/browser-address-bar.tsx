// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { getApi } from "@/store/global";
import { useAtomValue } from "jotai";
import { Lock, Shield, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { displayWebviewUrl } from "./browser-annotations";
import { BrowserLibraryModel, searchBrowserHistory } from "./browser-library";
import type { WebViewModel } from "./webview";

const SuggestedSites = [
    { url: "https://duckduckgo.com", label: "DuckDuckGo" },
    { url: "https://github.com", label: "GitHub" },
    { url: "https://youtube.com", label: "YouTube" },
    { url: "https://wikipedia.org", label: "Wikipedia" },
];

export function browserAddressSuggestions(
    query: string,
    history: string[],
    bookmarks: SuggestionType[]
): { url: string; label: string }[] {
    const needle = query.trim().toLowerCase();
    const candidates = [
        ...history.filter((url) => !needle || url.toLowerCase().includes(needle)).map((url) => ({ url, label: url })),
        ...bookmarks
            .filter(
                (item) =>
                    item["url:url"] &&
                    (!needle || (item.display + " " + item["url:url"]).toLowerCase().includes(needle))
            )
            .map((item) => ({ url: item["url:url"], label: item.display })),
    ];
    return candidates
        .filter((item, index) => candidates.findIndex((other) => other.url === item.url) === index)
        .slice(0, 8);
}

export function browserOmniboxSuggestions(query: string, history: string[], bookmarks: SuggestionType[]) {
    const matches = browserAddressSuggestions(query, history, bookmarks);
    const needle = query.trim().toLowerCase();
    const sites = SuggestedSites.filter(
        (site) => !needle || (site.url + " " + site.label).toLowerCase().includes(needle)
    );
    const rows = [...matches, ...sites]
        .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index)
        .slice(0, 7);
    if (query.trim()) rows.push({ url: query.trim(), label: "Search or navigate: " + query.trim() });
    return rows;
}

export function useBrowserSearchSuggestions(query: string, enabled: boolean) {
    const text = query.trim();
    const [result, setResult] = useState<{ query: string; rows: string[] }>();
    useEffect(() => {
        if (!enabled || text.length < 3 || text.length > 100 || /[/:@\\]/.test(text)) return;
        let current = true;
        const timer = window.setTimeout(() => {
            void getApi()
                ?.browserSearchSuggestions?.(text)
                .then((rows) => {
                    if (current) setResult({ query: text, rows });
                })
                .catch(() => {});
        }, 250);
        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [enabled, text]);
    return enabled && result?.query === text ? result.rows : [];
}

export function BrowserAddressBar({
    model,
    url,
    focused,
    faviconUrl,
    previewPageUrl,
    companion,
}: {
    model: WebViewModel;
    url: string;
    focused: boolean;
    faviconUrl: string;
    previewPageUrl?: string;
    companion?: boolean;
}) {
    const [localSuggestions, setSuggestions] = useState<{ url: string; label: string }[]>([]);
    const library = BrowserLibraryModel.getInstance();
    const savedLibrary = useAtomValue(library.state);
    const [editedAddress, setEditedAddress] = useState(false);
    const block = useAtomValue(model.blockAtom);
    const privateProfile = String(block?.meta?.["web:partition"] ?? "").startsWith("kronterm-private-");
    const isSearch =
        focused && editedAddress && model.ensureUrlScheme(url.trim(), "{query}") === encodeURIComponent(url.trim());
    const query = editedAddress ? url : "";
    const completions = useBrowserSearchSuggestions(query, isSearch && !privateProfile);
    const suggestions = [
        ...localSuggestions.slice(0, completions.length ? 3 : 8),
        ...completions
            .filter(
                (phrase) =>
                    phrase.toLowerCase() !== url.trim().toLowerCase() &&
                    !localSuggestions.some((item) => item.url === phrase)
            )
            .map((phrase) => ({ url: phrase, label: phrase, search: true })),
    ];
    const [active, setActive] = useState(-1);
    const [faviconBroken, setFaviconBroken] = useState(false);
    const requestRef = useRef(0);
    const listId = useId();
    const popupRef = useRef<HTMLDivElement>(null);
    const anchorName = "--address-" + listId.replace(/[^a-zA-Z0-9-]/g, "");
    useEffect(() => {
        if (focused && suggestions.length) popupRef.current?.showPopover?.();
        else popupRef.current?.hidePopover?.();
    }, [focused, suggestions.length]);

    useEffect(() => setFaviconBroken(false), [faviconUrl]);
    useEffect(() => {
        const request = ++requestRef.current;
        setActive(-1);
        if (!focused) {
            setSuggestions([]);
            return;
        }
        const saved = privateProfile
            ? []
            : [...searchBrowserHistory(savedLibrary.history, query), ...savedLibrary.pins].map(
                  (row) =>
                      ({
                          type: "url",
                          suggestionid: row.partition + row.url,
                          display: row.title,
                          "url:url": row.url,
                      }) as SuggestionType
              );
        setSuggestions(browserOmniboxSuggestions(query, [], saved));
        const timer = window.setTimeout(() => {
            void model
                .fetchBookmarkSuggestions(query, { widgetid: model.blockId, reqnum: request })
                .then((response) => {
                    if (requestRef.current === request)
                        setSuggestions(
                            browserOmniboxSuggestions(query, [], [...saved, ...(response.suggestions ?? [])])
                        );
                })
                .catch(() => {});
        }, 150);
        return () => window.clearTimeout(timer);
    }, [model, query, focused, privateProfile, savedLibrary.history, savedLibrary.pins]);
    const navigate = (nextUrl: string) => {
        model.loadUrl(nextUrl, "address-suggestion");
        model.urlInputRef.current?.blur();
    };
    return (
        <>
            {previewPageUrl != null ? (
                previewPageUrl.startsWith("https://") ? (
                    <Lock className="browser-preview-lock" aria-hidden="true" />
                ) : (
                    <Shield aria-hidden="true" />
                )
            ) : faviconUrl && !faviconBroken ? (
                <img
                    src={faviconUrl}
                    alt=""
                    aria-hidden="true"
                    className="webview-favicon"
                    onError={() => setFaviconBroken(true)}
                />
            ) : (
                <ShieldCheck size={16} aria-hidden="true" />
            )}
            <input
                ref={model.urlInputRef}
                style={{ anchorName } as CSSProperties}
                value={displayBrowserAddress(url, focused, companion)}
                onChange={(event) => {
                    setEditedAddress(true);
                    model.handleUrlChange(event);
                }}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && suggestions.length) {
                        event.preventDefault();
                        setActive((active + 1) % suggestions.length);
                        return;
                    }
                    if (event.key === "ArrowUp" && suggestions.length) {
                        event.preventDefault();
                        setActive(active <= 0 ? suggestions.length - 1 : active - 1);
                        return;
                    }
                    if (event.key === "Enter" && active >= 0 && suggestions[active]) {
                        event.preventDefault();
                        navigate(suggestions[active].url);
                        return;
                    }
                    if (event.key === "Escape") {
                        event.preventDefault();
                        model.urlInputRef.current?.blur();
                        return;
                    }
                    if (event.key === "Tab" && !event.shiftKey && active >= 0 && suggestions.length) {
                        event.preventDefault();
                        const next = suggestions[active >= 0 ? active : 0];
                        globalStore.set(model.url, next.url);
                        return;
                    }
                    model.handleKeyDown(event);
                }}
                onFocus={(event) => model.handleFocus(event)}
                onBlur={(event) => {
                    setEditedAddress(false);
                    try {
                        const pageUrl = model.webviewRef.current?.getURL();
                        if (pageUrl) globalStore.set(model.url, pageUrl);
                    } catch {
                        // The guest can be replaced while the address input loses focus.
                    }
                    model.handleBlur(event);
                }}
                aria-label="Address and search"
                placeholder={previewPageUrl != null ? "Search or enter address" : undefined}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={focused && suggestions.length > 0}
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                spellCheck={false}
            />
            {focused && suggestions.length > 0 && (
                <div
                    ref={popupRef}
                    popover="manual"
                    style={{ positionAnchor: anchorName } as CSSProperties}
                    id={listId}
                    role="listbox"
                    aria-label="Address suggestions"
                    className="webview-address-suggestions"
                >
                    {suggestions.map((item, index) => (
                        <button
                            key={item.url}
                            id={`${listId}-${index}`}
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => navigate(item.url)}
                        >
                            <span>{item.label}</span>
                            <small>{"search" in item ? "DuckDuckGo suggestion" : item.url}</small>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

export function clearBrowserAddressHistory(blockId: string) {
    BrowserLibraryModel.getInstance().clearHistory();
}

export function displayBrowserAddress(url: string, focused: boolean, companion?: boolean): string {
    if (!companion || focused) return displayWebviewUrl(url, focused);
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.host;
    } catch {
        // Keep incomplete addresses editable.
    }
    return displayWebviewUrl(url, focused);
}
