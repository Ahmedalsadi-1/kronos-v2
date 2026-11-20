// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { History, Pin, X } from "lucide-react";
import { useId, useRef, useState, type CSSProperties } from "react";
import {
    BrowserLibraryModel,
    openSavedBrowserPage,
    savedBrowserPage,
    searchBrowserHistory,
    type SavedBrowserPage,
} from "./browser-library";
import libraryStyles from "./browser-library.css?inline";

export function BrowserPagePin({ page }: { page: Partial<SavedBrowserPage> }) {
    const library = BrowserLibraryModel.getInstance();
    const { pins } = useAtomValue(library.state);
    const normalized = savedBrowserPage(page);
    const pinned =
        normalized && pins.some((row) => row.url === normalized.url && row.partition === normalized.partition);
    return (
        <button
            type="button"
            disabled={!normalized}
            aria-pressed={Boolean(pinned)}
            aria-label={pinned ? "Unpin page" : "Pin page"}
            title={pinned ? "Unpin page" : "Pin page"}
            onClick={() => library.togglePin(page)}
        >
            <Pin size={15} />
        </button>
    );
}

export function BrowserLibraryMenu({ onOpen }: { onOpen?: (page: SavedBrowserPage) => Promise<unknown> }) {
    const library = BrowserLibraryModel.getInstance();
    const state = useAtomValue(library.state);
    const storageError = useAtomValue(library.error);
    const [view, setView] = useState<"history" | "pins" | "closed">("history");
    const [query, setQuery] = useState("");
    const [error, setError] = useState("");
    const [opening, setOpening] = useState(false);
    const popup = useRef<HTMLDivElement>(null);
    const id = useId();
    const anchor = "--browser-library-" + id.replace(/[^a-zA-Z0-9-]/g, "");
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows =
        view === "history"
            ? searchBrowserHistory(state.history, query)
            : (view === "pins" ? state.pins : state.closed).filter((row) =>
                  terms.every((term) => `${row.title} ${row.url}`.toLowerCase().includes(term))
              );
    const open = async (page: SavedBrowserPage, closedId?: string) => {
        if (opening) return;
        setOpening(true);
        setError("");
        try {
            if (onOpen) {
                await onOpen(page);
                if (closedId) library.forgetClosed(closedId);
            } else await openSavedBrowserPage(page, closedId);
            popup.current?.hidePopover?.();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not open this page.");
        } finally {
            setOpening(false);
        }
    };
    return (
        <div className="browser-library">
            <style>{libraryStyles}</style>
            <button
                type="button"
                aria-label="History and saved pages"
                title="History and saved pages"
                popoverTarget={id}
                style={{ anchorName: anchor } as CSSProperties}
            >
                <History size={16} />
            </button>
            <div
                id={id}
                ref={popup}
                popover="auto"
                role="dialog"
                aria-label="Browser library"
                className="browser-library-popup"
                style={{ positionAnchor: anchor } as CSSProperties}
            >
                <header>
                    <strong>Browser library</strong>
                    <button
                        type="button"
                        aria-label="Close browser library"
                        onClick={() => popup.current?.hidePopover?.()}
                    >
                        <X size={16} />
                    </button>
                </header>
                <nav aria-label="Browser library sections">
                    {(
                        [
                            ["history", "History"],
                            ["pins", "Pinned pages"],
                            ["closed", "Recently closed"],
                        ] as const
                    ).map(([value, label]) => (
                        <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>
                            {label}
                        </button>
                    ))}
                </nav>
                <input
                    aria-label="Search browser history and saved pages"
                    placeholder="Search title or address"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                {(error || storageError) && <p role="alert">{error || storageError}</p>}
                {view === "closed" && (
                    <button
                        type="button"
                        disabled={opening || !state.closed.length}
                        className="browser-library-reopen"
                        onClick={() => void open(state.closed[0], state.closed[0].id)}
                    >
                        Reopen last closed tab <small>⌘/Ctrl ⇧ T</small>
                    </button>
                )}
                <div className="browser-library-results">
                    {!rows.length && (
                        <p role="status">
                            {query
                                ? "No matching pages."
                                : view === "history"
                                  ? "Pages you visit will appear here."
                                  : view === "pins"
                                    ? "Pin a page from the browser toolbar."
                                    : "No recently closed tabs."}
                        </p>
                    )}
                    {rows.slice(0, 100).map((row, index) => (
                        <div key={row.partition + row.url + index} className="browser-library-row">
                            <button
                                type="button"
                                disabled={opening}
                                onClick={() => void open(row, "id" in row ? (row.id as string) : undefined)}
                            >
                                <span>{row.title}</span>
                                <small>{row.url}</small>
                                {"visitedAt" in row && (
                                    <small>{new Date(row.visitedAt as number).toLocaleString()}</small>
                                )}
                                {row.partition && (
                                    <small>
                                        {row.partition.includes("work")
                                            ? "Work"
                                            : row.partition.includes("personal")
                                              ? "Personal"
                                              : "Browser profile"}
                                    </small>
                                )}
                            </button>
                            {view === "pins" && (
                                <button
                                    type="button"
                                    aria-label={"Unpin " + row.title}
                                    onClick={() => library.togglePin(row)}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function BrowserPinnedPages() {
    const library = BrowserLibraryModel.getInstance();
    const { pins } = useAtomValue(library.state);
    const [error, setError] = useState("");
    if (!pins.length) return null;
    return (
        <div className="pen-sidebar-pinned-pages">
            <div className="pen-sidebar-label">Pinned pages</div>
            {pins.map((page) => (
                <div key={page.partition + page.url}>
                    <button
                        type="button"
                        title={page.url}
                        onClick={() => {
                            setError("");
                            void openSavedBrowserPage(page).catch((failure) => setError(failure.message));
                        }}
                    >
                        <Pin size={13} />
                        <span>{page.title}</span>
                    </button>
                    <button type="button" aria-label={"Unpin " + page.title} onClick={() => library.togglePin(page)}>
                        <X size={12} />
                    </button>
                </div>
            ))}
            {error && <p role="alert">{error}</p>}
        </div>
    );
}
