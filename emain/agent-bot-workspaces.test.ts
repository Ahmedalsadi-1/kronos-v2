// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { BotWorkspaceRegistry, type BotWorkspaceBackend } from "./agent-bot-workspaces";

function fixture() {
    const workspaces: Workspace[] = [];
    const blocks = new Map<string, Array<{ id: string; role?: string }>>();
    const backend: BotWorkspaceBackend = {
        list: async () => workspaces,
        create: vi.fn(async (name) => {
            const id = `workspace-${workspaces.length}`;
            workspaces.push({ oid: id, name, meta: {}, tabids: [], activetabid: "" } as Workspace);
            return id;
        }),
        get: async (id) => workspaces.find((workspace) => workspace.oid === id),
        tab: async (id) => {
            const tabId = `${id}-tab`;
            workspaces.find((workspace) => workspace.oid === id).activetabid = tabId;
            blocks.set(tabId, []);
            return tabId;
        },
        metadata: async (ref, meta) => {
            if (ref.startsWith("workspace:"))
                Object.assign(workspaces.find((workspace) => workspace.oid === ref.slice(10)).meta, meta);
        },
        blocks: async (id) => [...blocks.get(id)],
        createBlock: vi.fn(async (tabId, meta) => {
            const id = `${tabId}-${blocks.get(tabId).length}`;
            blocks.get(tabId).push({ id, role: String(meta["agent:widgetrole"]) });
            return id;
        }),
    };
    return { backend, workspaces, blocks };
}
it("shares one durable three-widget desktop across project teammates", async () => {
    const { backend, workspaces } = fixture();
    const registry = new BotWorkspaceRegistry(backend);
    const room = { id: "room-one", name: "Project" };
    const teammates = ["Researcher", "Builder", "Reviewer"].map((name) => ({ id: name, name, room, cwd: "/project" }));
    const desktops = await Promise.all(teammates.map((bot) => registry.ensure(bot)));
    expect(new Set(desktops.map((desktop) => desktop.workspaceId)).size).toBe(1);
    expect(desktops.map((desktop) => desktop.botId)).toEqual(teammates.map((bot) => bot.id));
    expect(workspaces).toHaveLength(1);
    expect(backend.createBlock).toHaveBeenCalledTimes(3);
    expect(await new BotWorkspaceRegistry(backend).ensure(teammates[2])).toEqual(desktops[2]);
});
it("deduplicates concurrent requests and reuses durable bot identity across restarts", async () => {
    const { backend, workspaces } = fixture();
    const registry = new BotWorkspaceRegistry(backend);
    const bot = { id: "bot-one", name: "Research" };
    const [first, duplicate] = await Promise.all([registry.ensure(bot), registry.ensure(bot)]);
    expect(duplicate).toEqual(first);
    expect(first.blockIds).toHaveLength(3);
    expect(await new BotWorkspaceRegistry(backend).ensure({ ...bot, name: "Renamed" })).toEqual(first);
    expect(workspaces).toHaveLength(1);
    expect(backend.createBlock).toHaveBeenCalledTimes(3);
});
it("keeps different bots in separate desktops and repairs partial provisioning", async () => {
    const { backend } = fixture();
    const create = backend.createBlock;
    vi.mocked(create).mockRejectedValueOnce(new Error("interrupted"));
    const registry = new BotWorkspaceRegistry(backend);
    await expect(registry.ensure({ id: "one", name: "One" })).rejects.toThrow("interrupted");
    const first = await registry.ensure({ id: "one", name: "One" });
    const second = await registry.ensure({ id: "two", name: "Two" });
    expect(first.workspaceId).not.toBe(second.workspaceId);
    expect(first.blockIds.some((id) => second.blockIds.includes(id))).toBe(false);
    expect(backend.create).toHaveBeenCalledTimes(2);
});

it("preserves a user's closed widgets after initial desktop provisioning", async () => {
    const { backend, blocks } = fixture();
    const registry = new BotWorkspaceRegistry(backend);
    const bot = { id: "persistent", name: "Persistent" };
    const desktop = await registry.ensure(bot);
    blocks.get(desktop.tabId).pop();
    expect((await new BotWorkspaceRegistry(backend).ensure(bot)).blockIds).toHaveLength(2);
    expect(backend.createBlock).toHaveBeenCalledTimes(3);
});

it("preserves the chosen workspace presentation when reopening a bot desktop", async () => {
    const { backend } = fixture();
    const metadata = vi.spyOn(backend, "metadata");
    const bot = { id: "persistent", name: "Persistent" };
    const desktop = await new BotWorkspaceRegistry(backend).ensure(bot);
    expect(metadata).toHaveBeenCalledWith(`tab:${desktop.tabId}`, { "layout:mode": "os", "agent:botid": bot.id });
    metadata.mockClear();
    await new BotWorkspaceRegistry(backend).ensure(bot);
    expect(metadata.mock.calls.some(([, meta]) => "layout:mode" in meta)).toBe(false);
});
