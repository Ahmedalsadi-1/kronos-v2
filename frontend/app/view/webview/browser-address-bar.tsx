// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { Lock, Shield, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { displayWebviewUrl } from "./browser-annotations";
import type { WebViewModel } from "./webview";

const HistoryByBlock = new Map<string, string[]>();

export function browserAddressSuggestions(
    query: string,
    history: string[],
    bookmarks: SuggestionType[]
): { url: string; label: string }[] {
    const needle = query.trim().toLowerCase();
    const candidates = [
        ...history.filter((url) => !needle || url.toLowerCase().includes(needle)).map((url) => ({ url, label: url })),
        ...bookmarks.filter((item) => item["url:url"]).map((item) => ({ url: item["url:url"], label: item.display })),
    ];
    return candidates
        .filter((item, index) => candidates.findIndex((other) => other.url === item.url) === index)
        .slice(0, 8);
}

export function BrowserAddressBar({
    model,
    url,
    focused,
    faviconUrl,
    previewPageUrl,
}: {
    model: WebViewModel;
    url: string;
    focused: boolean;
    faviconUrl: string;
    previewPageUrl?: string;
}) {
    const [suggestions, setSuggestions] = useState<{ url: string; label: string }[]>([]);
    const [active, setActive] = useState(-1);
    const [faviconBroken, setFaviconBroken] = useState(false);
    const requestRef = useRef(0);
    const listId = useId();
    useEffect(() => setFaviconBroken(false), [faviconUrl]);
    useEffect(() => {
        const request = ++requestRef.current;
        setActive(-1);
        if (!focused) {
            setSuggestions([]);
            return;
        }
        const history = HistoryByBlock.get(model.blockId) ?? [];
        setSuggestions(browserAddressSuggestions(url, history, []));
        const timer = window.setTimeout(() => {
            void model
                .fetchBookmarkSuggestions(url, { widgetid: model.blockId, reqnum: request })
                .then((response) => {
                    if (requestRef.current === request)
                        setSuggestions(browserAddressSuggestions(url, history, response.suggestions ?? []));
                })
                .catch(() => {});
        }, 150);
        return () => window.clearTimeout(timer);
    }, [model, url, focused]);
    useEffect(() => {
        const webview = model.webviewRef.current;
        if (!webview) return;
        const record = (event: Event) => {
            const nextUrl = (event as Event & { url: string }).url;
            if (
                !nextUrl ||
                !/^https?:/.test(nextUrl) ||
                webview.getAttribute("partition")?.startsWith("kronterm-private")
            )
                return;
            const history = HistoryByBlock.get(model.blockId) ?? [];
            HistoryByBlock.set(model.blockId, [nextUrl, ...history.filter((item) => item !== nextUrl)].slice(0, 80));
        };
        webview.addEventListener("did-navigate", record);
        webview.addEventListener("did-navigate-in-page", record);
        return () => {
            webview.removeEventListener("did-navigate", record);
            webview.removeEventListener("did-navigate-in-page", record);
        };
    }, [model, url]);
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
                value={displayWebviewUrl(url, focused)}
                onChange={(event) => model.handleUrlChange(event)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && suggestions.length) {
                        event.preventDefault();
                        setActive((active + 1) % suggestions.length);
                        return;
                    }
                    if (event.key === "ArrowUp" && suggestions.length) {
                        event.preventDefault();
                        setActive((active - 1 + suggestions.length) % suggestions.length);
                        return;
                    }
                    if (event.key === "Enter" && active >= 0 && suggestions[active]) {
                        event.preventDefault();
                        navigate(suggestions[active].url);
                        return;
                    }
                    model.handleKeyDown(event);
                }}
                onFocus={(event) => model.handleFocus(event)}
                onBlur={(event) => {
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
                            <small>{item.url}</small>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

export function clearBrowserAddressHistory(blockId: string) {
    HistoryByBlock.delete(blockId);
}
