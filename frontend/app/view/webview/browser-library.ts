// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { atom } from "jotai";

export const BrowserLibraryStorageKey = "kronos:browser-library:v1";
export const BrowserLibraryOpenEvent = "kronos:open-saved-browser-page";
export type SavedBrowserPage = { url: string; title: string; partition: string };
export type BrowserHistoryEntry = SavedBrowserPage & { visitedAt: number; visits: number };
export type ClosedBrowserTab = SavedBrowserPage & { id: string; closedAt: number };
export type BrowserTabSession = { active: string; order: string[] };
export type BrowserLibraryState = {
    version: 1;
    pins: SavedBrowserPage[];
    history: BrowserHistoryEntry[];
    closed: ClosedBrowserTab[];
    sessions: Record<string, BrowserTabSession>;
};
export type OpenSavedBrowserPage = { page: SavedBrowserPage; closedId?: string; opened?: Promise<unknown> };

export function isPrivateBrowserPartition(partition: unknown): boolean {
    return typeof partition === "string" && partition.startsWith("kronterm-private-");
}

export function savedBrowserPage(value: Partial<SavedBrowserPage>): SavedBrowserPage | undefined {
    if (
        !value ||
        typeof value.url !== "string" ||
        value.url.length > 8192 ||
        isPrivateBrowserPartition(value.partition)
    )
        return;
    try {
        const url = new URL(value.url);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
        return {
            url: url.href,
            title: typeof value.title === "string" ? value.title.trim().slice(0, 240) || url.host : url.host,
            partition:
                typeof value.partition === "string" && value.partition.startsWith("persist:")
                    ? value.partition.slice(0, 200)
                    : "",
        };
    } catch {
        return;
    }
}

function pageKey(page: SavedBrowserPage): string {
    return page.partition + "\n" + page.url;
}
const emptyLibrary = (): BrowserLibraryState => ({ version: 1, pins: [], history: [], closed: [], sessions: {} });

export function parseBrowserLibrary(raw: string): BrowserLibraryState {
    const result = emptyLibrary();
    try {
        const value = JSON.parse(raw);
        if (value?.version !== 1) return result;
        const pages = (rows: unknown) => (Array.isArray(rows) ? rows : []);
        result.pins = pages(value.pins)
            .flatMap((row) => {
                const page = savedBrowserPage(row);
                return page ? [page] : [];
            })
            .filter((row, index, all) => all.findIndex((other) => pageKey(other) === pageKey(row)) === index)
            .slice(0, 100);
        result.history = pages(value.history)
            .flatMap((row) => {
                const page = savedBrowserPage(row);
                return page && Number.isFinite(row.visitedAt)
                    ? [{ ...page, visitedAt: row.visitedAt, visits: Math.max(1, Number(row.visits) || 1) }]
                    : [];
            })
            .sort((a, b) => b.visitedAt - a.visitedAt)
            .filter((row, index, all) => all.findIndex((other) => pageKey(other) === pageKey(row)) === index)
            .slice(0, 2000);
        result.closed = pages(value.closed)
            .flatMap((row) => {
                const page = savedBrowserPage(row);
                return page && typeof row.id === "string" && Number.isFinite(row.closedAt)
                    ? [{ ...page, id: row.id, closedAt: row.closedAt }]
                    : [];
            })
            .slice(0, 30);
        if (value.sessions && typeof value.sessions === "object" && !Array.isArray(value.sessions)) {
            for (const [id, session] of Object.entries(value.sessions).slice(-100)) {
                const row = session as BrowserTabSession;
                if (!row || typeof row.active !== "string" || !Array.isArray(row.order)) continue;
                result.sessions[id] = {
                    active: row.active.slice(0, 200),
                    order: [...new Set(row.order.filter((item) => typeof item === "string"))].slice(0, 300),
                };
            }
        }
    } catch {
        /* An interrupted or older store must not prevent the browser opening. */
    }
    return result;
}

function readLibrary(): BrowserLibraryState {
    try {
        return parseBrowserLibrary(window.localStorage.getItem(BrowserLibraryStorageKey));
    } catch {
        return emptyLibrary();
    }
}

export class BrowserLibraryModel {
    private static instance: BrowserLibraryModel;
    static getInstance(): BrowserLibraryModel {
        return (this.instance ??= new BrowserLibraryModel());
    }
    readonly state = atom(readLibrary());
    readonly error = atom("");
    private constructor() {
        if (typeof window !== "undefined")
            window.addEventListener("storage", (event) => {
                if (event.key === BrowserLibraryStorageKey) globalStore.set(this.state, readLibrary());
            });
    }
    private update(change: (state: BrowserLibraryState) => BrowserLibraryState): void {
        const next = change(readLibrary());
        try {
            window.localStorage.setItem(BrowserLibraryStorageKey, JSON.stringify(next));
            globalStore.set(this.error, "");
        } catch {
            globalStore.set(this.error, "Browser data could not be saved. Check available storage and try again.");
        }
        globalStore.set(this.state, next);
    }
    recordVisit(value: Partial<SavedBrowserPage>, now = Date.now()): void {
        const page = savedBrowserPage(value);
        if (!page) return;
        this.update((state) => {
            const previous = state.history.find((row) => pageKey(row) === pageKey(page));
            const visits = (previous?.visits ?? 0) + (!previous || now - previous.visitedAt > 1000 ? 1 : 0);
            return {
                ...state,
                history: [
                    { ...page, visitedAt: now, visits },
                    ...state.history.filter((row) => pageKey(row) !== pageKey(page)),
                ].slice(0, 2000),
            };
        });
    }
    updateTitle(value: Partial<SavedBrowserPage>): void {
        const page = savedBrowserPage(value);
        if (!page) return;
        this.update((state) => ({
            ...state,
            history: state.history.map((row) => (pageKey(row) === pageKey(page) ? { ...row, title: page.title } : row)),
            pins: state.pins.map((row) => (pageKey(row) === pageKey(page) ? page : row)),
        }));
    }
    togglePin(value: Partial<SavedBrowserPage>): void {
        const page = savedBrowserPage(value);
        if (!page) return;
        this.update((state) => ({
            ...state,
            pins: state.pins.some((row) => pageKey(row) === pageKey(page))
                ? state.pins.filter((row) => pageKey(row) !== pageKey(page))
                : [...state.pins, page].slice(-100),
        }));
    }
    rememberClosed(value: Partial<SavedBrowserPage>): void {
        const page = savedBrowserPage(value);
        if (!page) return;
        this.update((state) => ({
            ...state,
            closed: [{ ...page, id: crypto.randomUUID(), closedAt: Date.now() }, ...state.closed].slice(0, 30),
        }));
    }
    forgetClosed(id: string): void {
        this.update((state) => ({ ...state, closed: state.closed.filter((row) => row.id !== id) }));
    }
    saveSession(id: string, session: BrowserTabSession): void {
        const previous = globalStore.get(this.state).sessions[id];
        if (previous?.active === session.active && JSON.stringify(previous.order) === JSON.stringify(session.order))
            return;
        this.update((state) => ({ ...state, sessions: { ...state.sessions, [id]: session } }));
    }
    clearHistory(): void {
        this.update((state) => ({ ...state, history: [] }));
    }
}

export async function openSavedBrowserPage(
    page: SavedBrowserPage,
    closedId?: string,
    fallback?: (page: SavedBrowserPage) => Promise<unknown>
): Promise<void> {
    const detail: OpenSavedBrowserPage = { page, closedId };
    window.dispatchEvent(new CustomEvent(BrowserLibraryOpenEvent, { detail }));
    if (!detail.opened) {
        if (!fallback) throw new Error("Open the browser workspace before restoring a page.");
        await fallback(page);
        if (closedId) BrowserLibraryModel.getInstance().forgetClosed(closedId);
        return;
    }
    await detail.opened;
}

export function reopenLastClosedBrowserTab(): boolean {
    const library = BrowserLibraryModel.getInstance();
    const page = globalStore.get(library.state).closed[0];
    if (!page) return false;
    const detail: OpenSavedBrowserPage = { page, closedId: page.id };
    window.dispatchEvent(new CustomEvent(BrowserLibraryOpenEvent, { detail }));
    if (!detail.opened) return false;
    void detail.opened.catch((failure) =>
        globalStore.set(library.error, failure instanceof Error ? failure.message : "Could not reopen this tab.")
    );
    return true;
}

export function searchBrowserHistory(rows: BrowserHistoryEntry[], query: string): BrowserHistoryEntry[] {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => terms.every((term) => `${row.title} ${row.url}`.toLowerCase().includes(term)));
}
