// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { browserNavigationSnapshot } from "@/types/browser-navigation";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { Bookmark, Download, History, Lock, Star } from "lucide-react";
import { useId, useState } from "react";
import "./browser-preview-chrome.css";
import type { WebViewModel } from "./webview";

type PageLink = { title: string; url: string };

const Shortcuts: PageLink[] = [
    { title: "Google", url: "https://www.google.com/" },
    { title: "GitHub", url: "https://github.com/" },
    { title: "Stack Overflow", url: "https://stackoverflow.com/" },
    { title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
];

const PreviewBookmarks = atomWithStorage<PageLink[]>("kronterm:browser-preview-bookmarks", []);

function isWebPage(url: string): boolean {
    return /^https?:\/\//.test(url);
}

export function BrowserPreviewActions({ model, page, ready }: { model: WebViewModel; page: PageLink; ready: boolean }) {
    const [bookmarks, setBookmarks] = useAtom(PreviewBookmarks);
    const saved = bookmarks.some(({ url }) => url === page.url);
    const bookmarkLabel = saved ? "Remove bookmark" : "Bookmark this page";
    return (
        <>
            <button
                type="button"
                aria-label={bookmarkLabel}
                title={bookmarkLabel}
                aria-pressed={saved}
                disabled={!ready || !isWebPage(page.url)}
                onClick={() =>
                    setBookmarks((current) =>
                        current.some(({ url }) => url === page.url)
                            ? current.filter(({ url }) => url !== page.url)
                            : [...current, page]
                    )
                }
            >
                <Star className={saved ? "browser-preview-star" : undefined} aria-hidden="true" />
            </button>
            <button
                type="button"
                className="browser-preview-download"
                aria-label="Download current page"
                title="Download current page"
                disabled={!ready || !isWebPage(page.url)}
                onClick={() => model.webviewRef.current?.downloadURL(page.url)}
            >
                <Download aria-hidden="true" />
            </button>
        </>
    );
}

export function BrowserPreviewLinks({ model, ready }: { model: WebViewModel; ready: boolean }) {
    const [bookmarks] = useAtom(PreviewBookmarks);
    const bookmarksId = useId();
    const historyId = useId();
    const [history, setHistory] = useState<PageLink[] | "loading" | "unavailable">("loading");
    const readHistory = async () => {
        const guest = model.webviewRef.current;
        setHistory("loading");
        try {
            const snapshot = browserNavigationSnapshot(
                await getApi().browserNavigationHistory(guest.getWebContentsId())
            );
            setHistory(guest === model.webviewRef.current ? (snapshot?.entries.reverse() ?? []) : "unavailable");
        } catch {
            setHistory("unavailable");
        }
    };
    const renderLinks = (pages: PageLink[], emptyMessage: string) =>
        pages.length ? (
            pages.map(({ title, url }, index) => (
                <button
                    type="button"
                    key={`${index}:${url}`}
                    title={url}
                    onClick={(event) => {
                        event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
                        model.loadUrl(url, "browser-preview-link");
                    }}
                >
                    <span>{title}</span>
                    <small>{url}</small>
                </button>
            ))
        ) : (
            <p role="status">{emptyMessage}</p>
        );

    return (
        <div className="browser-preview-links" aria-label="Browser shortcuts">
            <button type="button" popoverTarget={bookmarksId} aria-label="Bookmarks">
                <Bookmark aria-hidden="true" />
                <span>Bookmarks</span>
            </button>
            <button
                type="button"
                popoverTarget={historyId}
                aria-label="History"
                disabled={!ready}
                onClick={() => void readHistory()}
            >
                <History aria-hidden="true" />
                <span>History</span>
            </button>
            <div className="browser-preview-shortcuts">
                {Shortcuts.map(({ title, url }) => (
                    <button
                        type="button"
                        key={url}
                        disabled={!ready}
                        onClick={() => model.loadUrl(url, "browser-preview-shortcut")}
                    >
                        {title}
                    </button>
                ))}
            </div>
            <section id={bookmarksId} popover="auto" className="browser-preview-list" aria-label="Saved bookmarks">
                {renderLinks(bookmarks, "No saved bookmarks")}
            </section>
            <section id={historyId} popover="auto" className="browser-preview-list" aria-label="Browsing history">
                {renderLinks(
                    Array.isArray(history) ? history : [],
                    history === "loading"
                        ? "Loading history…"
                        : history === "unavailable"
                          ? "History is unavailable"
                          : "No browsing history"
                )}
            </section>
        </div>
    );
}

export function BrowserPreviewStatus({ url, state, zoom }: { url: string; state: string; zoom: number }) {
    return (
        <footer className="browser-preview-status">
            <span role="status">{state}</span>
            {url.startsWith("https://") && (
                <span>
                    <Lock className="browser-preview-lock" aria-hidden="true" />
                    HTTPS
                </span>
            )}
            <span className="browser-preview-zoom">{Math.round(zoom * 100)}% zoom</span>
        </footer>
    );
}
