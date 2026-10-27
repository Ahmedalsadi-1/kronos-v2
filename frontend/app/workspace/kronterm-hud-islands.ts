// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getAllBlockComponentModels } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { ObjectService } from "@/app/store/services";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { getApi } from "@/store/global";
import { kronTermHudController } from "./kronterm-hud-controller";

export type KronTermHudApp =
    | "machines"
    | "files"
    | "terminal"
    | "web"
    | "widget"
    | "editor"
    | "diff"
    | "sandbox"
    | "apps"
    | "appstream"
    | "workflowcanvas"
    | "bots";
export type HudLaunchOptions = {
    machineKind?: "desktop" | "android" | "iphone";
    machineSettings?: boolean;
    machinePicker?: boolean;
    appId?: string;
    appName?: string;
    url?: string;
    file?: string;
    connection?: string;
    chatId?: string;
    toolCallId?: string;
    forceNew?: boolean;
};

const HudAppDefinitions: Record<KronTermHudApp, { meta: MetaType; title: string; view: string }> = {
    workflowcanvas: {
        meta: { view: "plugin:kronterm.openhuman-workflow/canvas" },
        title: "Workflow Canvas",
        view: "plugin:kronterm.openhuman-workflow/canvas",
    },
    bots: { meta: { view: "bots" }, title: "Bots", view: "bots" },
    machines: { meta: { view: "linux-vms" }, title: "Devices", view: "linux-vms" },
    apps: { meta: { view: "installedapps" }, title: "Streamed apps", view: "installedapps" },
    appstream: { meta: { view: "appstream" }, title: "App stream", view: "appstream" },
    files: { meta: { view: "preview", file: "~" }, title: "Files", view: "preview" },
    terminal: { meta: { view: "term", controller: "shell" }, title: "Terminal", view: "term" },
    web: { meta: { view: "web" }, title: "Browser", view: "web" },
    editor: { meta: { view: "codeeditor" }, title: "Editor", view: "codeeditor" },
    diff: { meta: { view: "aifilediff" }, title: "File diff", view: "aifilediff" },
    sandbox: { meta: { view: "linux-vms" }, title: "Sandbox", view: "linux-vms" },
    widget: { meta: { view: "sysinfo" }, title: "Widget", view: "sysinfo" },
};

export async function launchKronTermHudIsland(app: KronTermHudApp, options: HudLaunchOptions = {}): Promise<string> {
    const definition = HudAppDefinitions[app];
    if (!definition) throw new Error("Unsupported HUD application");
    if (app === "appstream" && !options.appId) throw new Error("Choose an application to stream");
    if (app === "diff" && (!options.file || !options.chatId || !options.toolCallId))
        throw new Error("File diff requires file, chatId, and toolCallId from an existing file change");
    if (options.url && app !== "web") throw new Error("Only browser islands accept a URL");
    if (app === "editor" && !options.file) throw new Error("Editor requires a file path");
    if (options.url && !["http:", "https:"].includes(new URL(options.url).protocol))
        throw new Error("Browser URL must use HTTP or HTTPS");
    const meta: MetaType = {
        ...definition.meta,
        ...(app === "machines" || app === "sandbox"
            ? {
                  "machine:kind": options.machineKind ?? "desktop",
                  "machine:settings": !!options.machineSettings,
                  "machine:picker": !!options.machinePicker,
              }
            : {}),
        ...(app === "appstream" ? { "appstream:appid": options.appId, "appstream:appname": options.appName } : {}),
        ...(options.url && app === "web" ? { url: options.url } : {}),
        ...(options.file ? { file: options.file } : {}),
        ...(options.file && app === "files" ? { edit: true } : {}),
        ...(options.connection ? { connection: options.connection } : {}),
        ...(app === "diff" ? { "aifilediff:chatid": options.chatId, "aifilediff:toolcallid": options.toolCallId } : {}),
    };

    const existing = getAllBlockComponentModels()
        .map((model) => model.viewModel as ViewModel & { blockId?: string })
        .find(
            (model) =>
                model?.viewType === definition.view &&
                typeof model.blockId === "string" &&
                (app !== "appstream" ||
                    globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", model.blockId)))?.meta?.[
                        "appstream:appid"
                    ] === options.appId)
        );
    if (existing && !options.forceNew) {
        if (options.file && definition.view === "preview") {
            const preview = existing as typeof existing & {
                goHistory: (file: string) => Promise<void>;
                setEditMode: (edit: boolean) => Promise<void>;
            };
            await preview.goHistory(options.file);
            await preview.setEditMode(true);
        }
        if (app === "machines" || app === "sandbox") {
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", existing.blockId),
                meta: {
                    "machine:kind": options.machineKind ?? "desktop",
                    "machine:settings": !!options.machineSettings,
                    "machine:picker": !!options.machinePicker,
                } as MetaType,
            });
        }
        if (!(await getApi().selectNativeHudWidget(existing.blockId, true))) throw new Error("HUD widget is not ready");
        return existing.blockId;
    }
    for (const candidate of options.forceNew ? [] : kronTermHudController.getSnapshot().islandBlockIds) {
        const block = (await ObjectService.GetObject(`block:${candidate}`)) as Block;
        if (block?.meta?.view !== definition.view) continue;
        if (app === "appstream" && block.meta["appstream:appid"] !== options.appId) continue;
        if (options.file && definition.view === "preview") {
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", candidate),
                meta: { file: options.file, edit: true } as MetaType,
            });
        }
        if (app === "machines" || app === "sandbox") {
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", candidate),
                meta: {
                    "machine:kind": options.machineKind ?? "desktop",
                    "machine:settings": !!options.machineSettings,
                    "machine:picker": !!options.machinePicker,
                } as MetaType,
            });
        }
        if (await getApi().openNativeHudIsland({ blockId: candidate, title: definition.title, view: definition.view }))
            return candidate;
        throw new Error("The native HUD host is not available.");
    }
    const blockId = await ObjectService.CreateBlock({ meta }, { termsize: { rows: 25, cols: 80 } });
    kronTermHudController.registerIsland(blockId);

    try {
        const opened = await getApi().openNativeHudIsland({
            blockId,
            title: definition.title,
            view: definition.view,
        });
        if (!opened) {
            throw new Error("The native HUD host is not available.");
        }
        return blockId;
    } catch (error) {
        kronTermHudController.unregisterIsland(blockId);
        await ObjectService.DeleteBlock(blockId).catch(() => {});
        throw error;
    }
}

export async function restoreKronTermHudIslands(tabId: string): Promise<void> {
    for (const blockId of kronTermHudController.getSnapshot().islandBlockIds) {
        const block = (await ObjectService.GetObject(`block:${blockId}`)) as Block;
        if (!block || block.parentoref !== `tab:${tabId}`) {
            kronTermHudController.unregisterIsland(blockId);
            continue;
        }
        if (!kronTermHudController.getSnapshot().active) return;
        const view = block.meta?.view;
        const title =
            Object.values(HudAppDefinitions).find((definition) => definition.view === view)?.title ?? "Widget";
        const opened = await getApi().openNativeHudIsland({ blockId, view, title, select: false });
        if (!opened) throw new Error(`Could not restore ${title}. Reopen HUD to retry.`);
    }
}
