// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { Search } from "lucide-react";
import { useId, useState } from "react";
import { browserOmniboxSuggestions, useBrowserSearchSuggestions } from "./browser-address-bar";
import { BrowserLibraryModel, searchBrowserHistory } from "./browser-library";

export function BrowserWorkspaceSearch({ onOpen }: { onOpen: (query: string) => void }) {
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(-1);
    const id = useId();
    const library = useAtomValue(BrowserLibraryModel.getInstance().state);
    const saved = [...searchBrowserHistory(library.history, query), ...library.pins].map(
        (row) =>
            ({
                type: "url",
                suggestionid: row.partition + row.url,
                display: row.title,
                "url:url": row.url,
            }) as SuggestionType
    );
    const completions = useBrowserSearchSuggestions(query, focused);
    const rows = [
        ...browserOmniboxSuggestions(query, [], saved),
        ...completions.map((text) => ({ url: text, label: text })),
    ]
        .filter((row, index, all) => all.findIndex((other) => other.url === row.url) === index)
        .slice(0, 8);
    const open = (value: string) => {
        if (!value.trim()) return;
        onOpen(value.trim());
        setQuery("");
        setFocused(false);
        setActive(-1);
    };
    return (
        <div className="pen-sidebar-search">
            <form
                className="pen-sidebar-address"
                onSubmit={(event) => {
                    event.preventDefault();
                    open(rows[active]?.url ?? query);
                }}
            >
                <Search size={14} />
                <input
                    aria-label="Search or enter address"
                    placeholder="Search or enter address"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={focused && rows.length > 0}
                    aria-controls={id}
                    aria-activedescendant={focused && active >= 0 ? `${id}-${active}` : undefined}
                    value={query}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActive(-1);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                            event.preventDefault();
                            setFocused(true);
                            setActive((value) =>
                                event.key === "ArrowDown"
                                    ? (value + 1) % rows.length
                                    : value <= 0
                                      ? rows.length - 1
                                      : value - 1
                            );
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            setFocused(false);
                            setActive(-1);
                        }
                    }}
                    spellCheck={false}
                />
            </form>
            {focused && rows.length > 0 && (
                <div id={id} role="listbox" aria-label="Search suggestions" className="pen-sidebar-search-results">
                    {rows.map((row, index) => (
                        <button
                            key={row.url}
                            type="button"
                            id={`${id}-${index}`}
                            role="option"
                            aria-selected={index === active}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => open(row.url)}
                        >
                            {row.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
