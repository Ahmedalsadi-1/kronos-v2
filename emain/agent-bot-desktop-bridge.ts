// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { WorkspaceService } from "@/app/store/services";
import { RpcApi } from "@/app/store/wshclientapi";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { BotWorkspaceRegistry, type BotDesktop, type WorkspaceBot } from "./agent-bot-workspaces";
import { ElectronWshClient } from "./emain-wsh";
import { revokeKronTermToolCaller, startKronTermToolServer } from "./kronterm-tool-server";

const Registry = new BotWorkspaceRegistry({
    list: async () =>
        Promise.all(
            (await WorkspaceService.ListWorkspaces()).map((entry) => WorkspaceService.GetWorkspace(entry.workspaceid))
        ),
    create: (name) => WorkspaceService.CreateWorkspace(name, "", "#658369", false),
    get: (id) => WorkspaceService.GetWorkspace(id),
    tab: (id) => WorkspaceService.CreateTab(id, "Desktop", true),
    metadata: (oref, meta) => RpcApi.SetMetaCommand(ElectronWshClient, { oref, meta: meta as MetaType }),
    blocks: async (id) => {
        const tab = await RpcApi.GetTabCommand(ElectronWshClient, id);
        return Promise.all(
            (tab.blockids ?? []).map(async (blockId) => {
                const meta = await RpcApi.GetMetaCommand(ElectronWshClient, { oref: `block:${blockId}` });
                return { id: blockId, role: meta?.["agent:widgetrole"] as string, view: meta?.view };
            })
        );
    },
    createBlock: async (tabid, meta) => {
        const ref = await RpcApi.CreateBlockCommand(ElectronWshClient, { tabid, blockdef: { meta: meta as MetaType } });
        return ref.replace(/^block:/, "");
    },
});

export class BotDesktopBridge {
    private server: Server;
    private token = randomBytes(32).toString("base64url");
    private syncTimer: NodeJS.Timeout;
    private stopped = false;
    private syncing = false;
    private active = new Map<string, BotDesktop>();

    constructor(private bots: () => Promise<WorkspaceBot[]>) {}

    async ensure(botId: string): Promise<BotDesktop> {
        const bot = (await this.bots()).find((item) => item.id === botId);
        if (!bot) throw new Error("Bot no longer exists");
        const desktop = await Registry.ensure(bot);
        this.active.set(botId, desktop);
        return desktop;
    }

    async start(): Promise<{ url: string; token: string }> {
        this.server = createServer(async (request, response) => {
            const supplied = Buffer.from(request.headers.authorization ?? "");
            const expected = Buffer.from(`Bearer ${this.token}`);
            if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
                response.writeHead(401).end();
                return;
            }
            if (request.method !== "POST" || request.url !== "/bot-desktop") {
                response.writeHead(404).end();
                return;
            }
            try {
                let body = "";
                for await (const chunk of request) {
                    body += chunk;
                    if (body.length > 4096) throw new Error("Request too large");
                }
                const { botId } = JSON.parse(body);
                if (typeof botId !== "string") throw new Error("Bot ID required");
                const desktop = await this.ensure(botId);
                const tools = await startKronTermToolServer(
                    () =>
                        this.stopped || !this.active.has(botId)
                            ? null
                            : {
                                  workspaceId: desktop.workspaceId,
                                  tabId: desktop.tabId,
                                  hostMode: "kronterm",
                                  capabilities: {
                                      browser: true,
                                      terminal: true,
                                      files: true,
                                      sandbox: false,
                                      computerControl: false,
                                  },
                              },
                    `bot:${botId}`
                );
                if (this.stopped) throw new Error("Agent workspace is stopping");
                response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
                response.end(JSON.stringify({ ...desktop, tools: { url: tools.url, token: tools.token } }));
            } catch (error) {
                response.writeHead(503, { "content-type": "application/json" });
                response.end(
                    JSON.stringify({ error: error instanceof Error ? error.message : "Bot desktop unavailable" })
                );
            }
        });
        await new Promise<void>((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(0, "127.0.0.1", resolve);
        });
        const address = this.server.address() as { port: number };
        return { url: `http://127.0.0.1:${address.port}`, token: this.token };
    }

    synchronize() {
        if (this.stopped || this.syncing) return;
        this.syncing = true;
        void this.bots()
            .then(async (bots) => {
                const ids = new Set(bots.map((bot) => bot.id));
                for (const id of this.active.keys()) {
                    if (ids.has(id)) continue;
                    revokeKronTermToolCaller(`bot:${id}`);
                    this.active.delete(id);
                }
                for (const bot of bots) {
                    if (this.stopped) break;
                    // Project desktops are shared and provisioned only when a teammate needs tools.
                    if (bot.room || bot.id.startsWith("project-")) continue;
                    if (!this.active.has(bot.id)) this.active.set(bot.id, await Registry.ensure(bot));
                }
            })
            .catch((error) => console.log("Bot desktop synchronization failed", error.message))
            .finally(() => {
                this.syncing = false;
            });
        if (!this.syncTimer) {
            this.syncTimer = setInterval(() => this.synchronize(), 5000);
            this.syncTimer.unref();
        }
    }

    stop() {
        this.stopped = true;
        clearInterval(this.syncTimer);
        for (const botId of this.active.keys()) revokeKronTermToolCaller(`bot:${botId}`);
        this.server?.close();
    }
}
