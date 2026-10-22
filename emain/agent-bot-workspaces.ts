// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type WorkspaceBot = { id: string; name: string; cwd?: string };
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
        const existing = this.pending.get(bot.id);
        if (existing) return existing;
        const next = this.queue.catch(() => undefined).then(() => this.provision(bot));
        this.queue = next;
        this.pending.set(bot.id, next);
        void next.finally(() => this.pending.delete(bot.id)).catch(() => {});
        return next;
    }

    private async provision(bot: WorkspaceBot): Promise<BotDesktop> {
        const backend = this.backend;
        let workspace = (await backend.list()).find((item) => item.meta?.["agent:botid"] === bot.id);
        if (!workspace) {
            const id = await backend.create((bot.name.trim() || "Agent").slice(0, 80));
            await backend.metadata(`workspace:${id}`, { "agent:botid": bot.id, "agent:source": "openmausbot" });
            workspace = await backend.get(id);
        }
        const tabId = workspace.activetabid || workspace.tabids?.[0] || (await backend.tab(workspace.oid));
        await backend.metadata(`tab:${tabId}`, { "layout:mode": "os", "agent:botid": bot.id });
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
                await backend.metadata(`block:${initial.id}`, { "agent:botid": bot.id, "agent:widgetrole": role });
                initial.role = role;
                continue;
            }
            const id = await backend.createBlock(tabId, { ...meta, "agent:botid": bot.id, "agent:widgetrole": role });
            blocks.push({ id, role });
        }
        if (!workspace.meta?.["agent:desktopready"])
            await backend.metadata(`workspace:${workspace.oid}`, { "agent:desktopready": true });
        return { botId: bot.id, workspaceId: workspace.oid, tabId, blockIds: blocks.map((block) => block.id) };
    }
}
