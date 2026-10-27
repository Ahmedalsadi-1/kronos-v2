// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { BotDesktopBridge } from "./agent-bot-desktop-bridge";
const fixture = vi.hoisted(() => ({
    workspaces: [] as any[],
    blocks: new Map<string, any[]>(),
    scopes: new Map<string, any>(),
    revoked: [] as string[],
}));
vi.mock("./emain-wsh", () => ({ ElectronWshClient: {} }));
vi.mock("@/app/store/services", () => ({
    WorkspaceService: {
        ListWorkspaces: async () => fixture.workspaces.map((workspace) => ({ workspaceid: workspace.oid })),
        GetWorkspace: async (id: string) => fixture.workspaces.find((workspace) => workspace.oid === id),
        CreateWorkspace: async (name: string) => {
            const id = `ws-${fixture.workspaces.length}`;
            fixture.workspaces.push({ oid: id, name, tabids: [], meta: {} });
            return id;
        },
        CreateTab: async (id: string) => {
            const tab = `${id}-tab`;
            fixture.workspaces.find((workspace) => workspace.oid === id).activetabid = tab;
            fixture.blocks.set(tab, []);
            return tab;
        },
    },
}));
vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: {
        SetMetaCommand: async (_client: any, { oref, meta }: any) => {
            if (oref.startsWith("workspace:"))
                Object.assign(fixture.workspaces.find((workspace) => workspace.oid === oref.slice(10)).meta, meta);
        },
        GetTabCommand: async (_client: any, id: string) => ({
            blockids: fixture.blocks.get(id).map((block) => block.id),
        }),
        GetMetaCommand: async (_client: any, { oref }: any) =>
            [...fixture.blocks.values()].flat().find((block) => block.id === oref.slice(6)).meta,
        CreateBlockCommand: async (_client: any, { tabid, blockdef }: any) => {
            const id = `${tabid}-${fixture.blocks.get(tabid).length}`;
            fixture.blocks.get(tabid).push({ id, meta: blockdef.meta });
            return `block:${id}`;
        },
    },
}));
vi.mock("./kronterm-tool-server", () => ({
    startKronTermToolServer: async (provider: any, owner: string) => {
        fixture.scopes.set(owner, provider);
        return { url: "http://127.0.0.1:9900/mcp", token: `token-${owner}` };
    },
    revokeKronTermToolCaller: (owner: string) => fixture.revoked.push(owner),
}));
let bridge: BotDesktopBridge;
afterEach(() => {
    bridge?.stop();
});
it("authenticates the backend and attaches each bot's tools to its own durable desktop", async () => {
    bridge = new BotDesktopBridge(async () => [
        { id: "first", name: "Research" },
        { id: "second", name: "Build" },
    ]);
    const { url, token } = await bridge.start();
    const call = (botId: string, authorization = `Bearer ${token}`) =>
        fetch(`${url}/bot-desktop`, { method: "POST", headers: { authorization }, body: JSON.stringify({ botId }) });
    expect((await call("first", "Bearer wrong")).status).toBe(401);
    expect(fixture.workspaces).toHaveLength(0);
    const first = await (await call("first")).json();
    const second = await (await call("second")).json();
    expect(first.workspaceId).not.toBe(second.workspaceId);
    expect(first.blockIds).toHaveLength(3);
    expect(await (await call("first")).json()).toEqual(first);
    expect(fixture.workspaces).toHaveLength(2);
    expect(fixture.scopes.get("bot:first")()).toMatchObject({ tabId: first.tabId, workspaceId: first.workspaceId });
    expect(fixture.scopes.get("bot:second")()).toMatchObject({ tabId: second.tabId, workspaceId: second.workspaceId });
    expect((await call("unknown")).status).toBe(503);
    bridge.stop();
    expect(fixture.scopes.get("bot:first")()).toBeNull();
    expect(fixture.revoked).toContain("bot:first");
});
