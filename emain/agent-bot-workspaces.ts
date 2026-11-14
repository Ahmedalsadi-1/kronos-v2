// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type WorkspaceBot = { id: string; name: string; cwd?: string; room?: { id: string; name: string } };
export type BotDesktop = { botId: string; workspaceId: string; tabId: string; blockIds: string[] };
export type BotWorkspaceBackend = {
    list(): Promise<Workspace[]>;
    create(name: string): Promise<string>;
    get(id: string): Promise<Workspace>;
    tab(workspaceId: string): Promise<string>;
    metadata(ref: string, meta: Record<string, unknown>): Promise<void>;
    blocks(tabId: string): Promise<Array<{ id: string; role?: string; view?: string }>>;
    createBlock(tabId: string, meta: Record<string, unknown>): Promise<string>;
};

export class BotWorkspaceRegistry {
    private pending = new Map<string, Promise<BotDesktop>>();
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private backend: BotWorkspaceBackend) {}

    ensure(bot: WorkspaceBot): Promise<BotDesktop> {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(bot.id)) return Promise.reject(new Error("Invalid bot identity"));
        if (bot.room && !/^[a-zA-Z0-9_-]{1,128}$/.test(bot.room.id))
            return Promise.reject(new Error("Invalid room identity"));
        const key = bot.room ? `room:${bot.room.id}` : `bot:${bot.id}`;
        const existing = this.pending.get(key);
        if (existing) return existing.then((desktop) => ({ ...desktop, botId: bot.id }));
        const next = this.queue.catch(() => undefined).then(() => this.provision(bot));
        this.queue = next;
        this.pending.set(key, next);
        void next.finally(() => this.pending.delete(key)).catch(() => {});
        return next;
    }

    private async provision(bot: WorkspaceBot): Promise<BotDesktop> {
        const backend = this.backend;
        const identity = bot.room ? { "agent:roomid": bot.room.id } : { "agent:botid": bot.id };
        let workspace = (await backend.list()).find((item) =>
            bot.room ? item.meta?.["agent:roomid"] === bot.room.id : item.meta?.["agent:botid"] === bot.id
        );
        if (!workspace) {
            const id = await backend.create(((bot.room?.name ?? bot.name).trim() || "Agent").slice(0, 80));
            await backend.metadata(`workspace:${id}`, { ...identity, "agent:source": "openmausbot" });
            workspace = await backend.get(id);
        }
        const existingTabId = workspace.activetabid || workspace.tabids?.[0];
        const tabId = existingTabId || (await backend.tab(workspace.oid));
        await backend.metadata(`tab:${tabId}`, {
            ...(!existingTabId || !workspace.meta?.["agent:desktopready"] ? { "layout:mode": "os" } : {}),
            ...identity,
        });
        const blocks = await backend.blocks(tabId);
        const roles = [
            { role: "terminal", view: "term", controller: "shell", ...(bot.cwd ? { "cmd:cwd": bot.cwd } : {}) },
            { role: "files", view: "preview", file: bot.cwd || "~" },
            { role: "browser", view: "web", url: "about:blank" },
        ];
        for (const { role, ...meta } of workspace.meta?.["agent:desktopready"] ? [] : roles) {
            if (blocks.some((block) => block.role === role)) continue;
            const initial = blocks.find((block) => !block.role && block.view === meta.view);
            if (initial) {
                await backend.metadata(`block:${initial.id}`, { ...identity, "agent:widgetrole": role });
                initial.role = role;
                continue;
            }
            const id = await backend.createBlock(tabId, { ...meta, ...identity, "agent:widgetrole": role });
            blocks.push({ id, role });
        }
        if (!workspace.meta?.["agent:desktopready"])
            await backend.metadata(`workspace:${workspace.oid}`, { "agent:desktopready": true });
        return { botId: bot.id, workspaceId: workspace.oid, tabId, blockIds: blocks.map((block) => block.id) };
    }
}
