// Copyright 2026, Command Line Inc. SPDX-License-Identifier: Apache-2.0
import type { BrowserSessionInfo, BrowserSessionsCommand } from "@/types/browser-sessions";
import { atom, getDefaultStore } from "jotai";

const ExampleSessions: BrowserSessionInfo[] = [
    { id: "default", name: "Default", persistent: true, shared: true, openTabs: 2 },
    { id: "work", name: "Work", persistent: true, shared: false, openTabs: 4, cookies: 38, cacheBytes: 14680064 },
    {
        id: "personal",
        name: "Personal",
        persistent: true,
        shared: false,
        openTabs: 1,
        cookies: 12,
        cacheBytes: 3145728,
    },
    { id: "private-demo", name: "Private", persistent: false, shared: false, openTabs: 1, cookies: 0, cacheBytes: 0 },
];
let sessions = structuredClone(ExampleSessions);
const PreviewApi = {
    getPlatform: () => "darwin",
    browserSessions: async (command: BrowserSessionsCommand) => {
        if (command.action === "clear") {
            sessions = sessions.map((session) =>
                session.id !== command.id
                    ? session
                    : {
                          ...session,
                          cookies: command.data === "cache" ? session.cookies : 0,
                          cacheBytes: command.data === "cache" ? 0 : session.cacheBytes,
                      }
            );
        }
        return structuredClone(sessions);
    },
    browserMigration: async (command: { action: string; bookmarks?: unknown[] }) => {
        if (command.action === "bookmarks") return { imported: command.bookmarks?.length ?? 0 };
        return { canceled: true, extensions: [] };
    },
};

export function getApi() {
    return PreviewApi as unknown as ElectronApi;
}

export function resetSettingsPreview() {
    sessions = structuredClone(ExampleSessions);
    getDefaultStore().set(atoms.fullConfigAtom, structuredClone(PreviewWorkspaceDefaults));
}

const PreviewWorkspaceDefaults = {
    settings: { "app:layoutmode": "os", "app:defaultnewblock": "web", "window:tilegapsize": 3 },
};
export const atoms = { fullConfigAtom: atom(structuredClone(PreviewWorkspaceDefaults)) };
export const TabRpcClient = {};
export const RpcApi = {
    SetConfigCommand: async (_client: unknown, values: Record<string, unknown>) => {
        const store = getDefaultStore();
        const config = store.get(atoms.fullConfigAtom);
        store.set(atoms.fullConfigAtom, { ...config, settings: { ...config.settings, ...values } });
    },
};
