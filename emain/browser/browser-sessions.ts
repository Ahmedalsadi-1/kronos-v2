// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { session, webContents, type Session, type WebContents } from "electron";
import type { BrowserSessionInfo, BrowserSessionsCommand } from "../../frontend/types/browser-sessions";

const PrivatePartitions = new WeakSet<Session>();
const FixedProfiles = [
    { id: "work", name: "Work" },
    { id: "personal", name: "Personal" },
] as const;

export function registerPrivateBrowserPartition(partition: unknown) {
    if (typeof partition === "string" && /^kronterm-private-[a-zA-Z0-9-]{1,128}$/.test(partition)) {
        PrivatePartitions.add(session.fromPartition(partition));
    }
}

function browserSessions(sender: WebContents) {
    const guests = webContents
        .getAllWebContents()
        .filter(
            (guest) => !guest.isDestroyed() && guest.getType() === "webview" && guest.hostWebContents?.id === sender.id
        );
    const rows: { info: BrowserSessionInfo; session: Session }[] = [
        {
            info: { id: "default", name: "Default", persistent: true, shared: true, openTabs: 0 },
            session: session.defaultSession,
        },
        ...FixedProfiles.map(({ id, name }) => ({
            info: { id, name, persistent: true, shared: false, openTabs: 0 },
            session: session.fromPartition(`persist:kronterm-${id}`),
        })),
    ];
    for (const guest of guests) {
        let row = rows.find((candidate) => candidate.session === guest.session);
        if (!row && PrivatePartitions.has(guest.session)) {
            row = {
                info: {
                    id: `private:${guest.id}`,
                    name: `Private session ${rows.length - FixedProfiles.length}`,
                    persistent: false,
                    shared: false,
                    openTabs: 0,
                },
                session: guest.session,
            };
            rows.push(row);
        }
        if (row) row.info.openTabs++;
    }
    return rows;
}

export async function manageBrowserSessions(
    sender: WebContents,
    command: BrowserSessionsCommand
): Promise<BrowserSessionInfo[]> {
    if (!command || !["list", "clear"].includes(command.action) || sender.isDestroyed()) {
        throw new Error("Invalid browser session request.");
    }
    const rows = browserSessions(sender);
    if (command.action === "clear") {
        const row = rows.find(({ info }) => info.id === command.id);
        if (!row || row.info.shared) throw new Error("This browser session cannot be cleared here.");
        if (command.data === "cache") await row.session.clearCache();
        else if (command.data === "cookies") await row.session.clearStorageData({ storages: ["cookies"] });
        else if (command.data === "site-data") {
            await row.session.clearStorageData({
                storages: ["cookies", "filesystem", "indexdb", "localstorage", "serviceworkers", "cachestorage"],
            });
        } else throw new Error("Choose cache, cookies, or site data to clear.");
    }
    return Promise.all(
        rows.map(async ({ info, session: browser }) => {
            if (info.shared) return info;
            const [cookies, cacheBytes] = await Promise.all([browser.cookies.get({}), browser.getCacheSize()]);
            return { ...info, cookies: cookies.length, cacheBytes };
        })
    );
}
