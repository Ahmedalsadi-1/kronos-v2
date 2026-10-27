// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import { blockViewToIcon, blockViewToName } from "@/app/block/blockutil";
import { hasViewIcon, viewIconId } from "@/app/components/view-icons";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { getApi } from "@/store/global";
import { OSSystemModel } from "./os-system";
import type { SystemAppDescriptor } from "./os-system-types";

// InstalledAppInfo is an ambient global type (frontend/types/gotypes.d.ts)

// icon is either a "data:..." URL (platform icon) or an icon-font class name (built-in views)
export type AppDescriptor = SystemAppDescriptor & {
    category?: string;
    aliases: string[];
    view?: string;
    runningBlockIds: string[];
    pinned: boolean;
    installedAppId?: string;
};

export type AppBlockRef = {
    blockId: string;
    view: string;
    title: string;
};

const BuiltinViewApps: Array<{
    view: string;
    kind?: SystemAppDescriptor["kind"];
    launchPolicy?: SystemAppDescriptor["launchPolicy"];
    capabilities?: string[];
    aliases?: string[];
    pinned?: boolean;
    category?: string;
}> = [
    {
        view: "term",
        aliases: ["terminal", "shell", "console", "pty"],
        pinned: true,
        category: "System",
        capabilities: ["terminal", "files"],
        launchPolicy: "multi-window",
    },
    {
        view: "web",
        kind: "web",
        aliases: ["browser", "web browser", "webview", "internet"],
        pinned: true,
        category: "Applications",
        capabilities: ["network", "clipboard", "files"],
        launchPolicy: "multi-window",
    },
    {
        view: "hermes",
        aliases: ["hermes", "ai", "chat", "kronos", "agent", "kronterm agent"],
        pinned: true,
        category: "Agents",
        capabilities: ["files", "terminal", "network", "screen-capture", "accessibility", "clipboard"],
    },
    {
        view: "preview",
        aliases: ["files", "file", "editor", "notes", "markdown", "pdf"],
        pinned: true,
        category: "Productivity",
        capabilities: ["files", "clipboard"],
        launchPolicy: "multi-window",
    },
    {
        view: "review",
        aliases: ["diff", "git diff", "changes", "code review"],
        category: "Productivity",
        launchPolicy: "singleton",
        capabilities: ["files"],
    },
    { view: "sysinfo", aliases: ["system", "cpu", "memory", "monitor"], category: "System" },
    {
        view: "sandbox",
        kind: "sandbox",
        aliases: ["linux", "vm", "isolated"],
        category: "System",
        capabilities: ["terminal", "network", "files"],
        launchPolicy: "multi-window",
    },
    { view: "videostudio", aliases: ["video", "timeline", "video studio"], category: "Productivity" },
    { view: "audiostudio", aliases: ["audio", "transcript", "captions"], category: "Productivity" },
    { view: "documentstudio", aliases: ["documents", "reports", "markdown"], category: "Productivity" },
    { view: "datastudio", aliases: ["csv", "data", "data studio", "spreadsheet"], category: "Productivity" },
    { view: "blenderproject", aliases: ["blender", "3d", "scene"], category: "Productivity" },
    { view: "medialibrary", aliases: ["media", "assets", "media library"], category: "Productivity" },
    { view: "imagestudio", aliases: ["image", "images", "comfyui", "image studio"], category: "Productivity" },
    { view: "gamestudio", aliases: ["game", "games", "game studio"], category: "Productivity" },
    {
        view: "plugin:kronterm.openhuman-workflow/canvas",
        aliases: ["workflow", "flow", "automation", "openhuman"],
        category: "Agents",
        launchPolicy: "multi-window",
    },
    {
        view: "plugin:kronterm.tapflow/devices",
        aliases: ["tapflow", "phone farm", "mobile labs"],
        category: "Agents",
        launchPolicy: "multi-window",
    },
    { view: "bots", aliases: ["bot", "bot settings", "openmausbot"], category: "Agents" },
    { view: "kronoscanvas", aliases: ["canvas", "draw", "diagram"], category: "Productivity" },
    { view: "appstream", aliases: ["app stream", "native app", "stream", "remote app"], category: "Applications" },
    { view: "installedapps", aliases: ["apps", "applications", "launcher"], category: "Applications" },
    {
        view: "computers",
        aliases: ["devices", "iphone", "ios", "simulator", "computer", "mobile"],
        category: "System",
        capabilities: ["screen-capture"],
    },
    {
        view: "linux-vms",
        aliases: [
            "machines",
            "machine launcher",
            "linux desktop",
            "cua",
            "agent desktop",
            "virtual linux",
            "mobile vm",
            "iphone vm",
            "android vm",
        ],
        launchPolicy: "singleton",
        category: "System",
        capabilities: ["screen-capture"],
    },
    { view: "kronsettings", aliases: ["settings", "preferences", "config"], category: "System" },
    { view: "help", aliases: ["docs", "documentation", "tips"], category: "System" },
];

export function makeViewAppDescriptor(view: string, runningBlockIds: string[]): AppDescriptor {
    const builtin = BuiltinViewApps.find((app) => app.view === view);
    return {
        id: `view:${view}`,
        kind: builtin?.kind ?? "builtin",
        name: blockViewToName(view),
        icon: hasViewIcon(view) ? viewIconId(view) : blockViewToIcon(view),
        category: builtin?.category,
        aliases: builtin?.aliases ?? [],
        view,
        runningBlockIds,
        pinned: builtin?.pinned ?? false,
        launchPolicy: builtin?.launchPolicy ?? "singleton",
        capabilities: builtin?.capabilities ?? [],
    };
}

export function makeInstalledAppDescriptor(app: InstalledAppInfo, resolvedIcon?: string): AppDescriptor {
    return {
        id: `app:${app.appid || app.path}`,
        kind: "native",
        name: app.name,
        icon:
            resolvedIcon ??
            (typeof app.icon === "string" && app.icon.startsWith("data:image/png") ? app.icon : undefined),
        category: app.category,
        aliases: [app.name.toLowerCase(), app.bundleid ?? "", app.description ?? ""].filter(Boolean),
        runningBlockIds: [],
        pinned: false,
        installedAppId: app.bundleid || app.appid,
        launchPolicy: "multi-window",
        capabilities: ["screen-capture", "accessibility", "clipboard", "files"],
    };
}

export function mergeAppDescriptors(
    builtins: AppDescriptor[],
    installed: AppDescriptor[],
    blocks: AppBlockRef[]
): AppDescriptor[] {
    const runningByView = new Map<string, string[]>();
    for (const block of blocks) {
        const existing = runningByView.get(block.view) ?? [];
        existing.push(block.blockId);
        runningByView.set(block.view, existing);
    }
    const mergedBuiltins = builtins.map((descriptor) =>
        descriptor.view != null
            ? { ...descriptor, runningBlockIds: runningByView.get(descriptor.view) ?? [] }
            : descriptor
    );
    return [...mergedBuiltins, ...installed];
}

// Everyday productivity apps surface before the alphabetical tail of /Applications.
const PreferredInstalledBundleIds = [
    "com.google.Chrome",
    "com.apple.Safari",
    "company.thebrowser.Browser",
    "com.microsoft.VSCode",
    "com.todesktop.230313mzl4w4u92",
    "com.figma.Desktop",
    "notion.id",
    "com.tinyspeck.slackmacgap",
    "com.hnc.Discord",
    "com.apple.mail",
    "com.apple.iCal",
    "com.apple.Notes",
    "com.spotify.client",
    "us.zoom.xos",
    "com.apple.Terminal",
    "com.googlecode.iterm2",
];

export function rankInstalledApps(descriptors: AppDescriptor[]): AppDescriptor[] {
    const preferredRank = (descriptor: AppDescriptor) => {
        const index = PreferredInstalledBundleIds.indexOf(descriptor.installedAppId ?? "");
        return index === -1 ? PreferredInstalledBundleIds.length : index;
    };
    return [...descriptors].sort((a, b) => {
        const runningDelta = Number(b.runningBlockIds.length > 0) - Number(a.runningBlockIds.length > 0);
        if (runningDelta !== 0) return runningDelta;
        const rankDelta = preferredRank(a) - preferredRank(b);
        if (rankDelta !== 0) return rankDelta;
        return a.name.localeCompare(b.name);
    });
}

export function searchApps(descriptors: AppDescriptor[], query: string): AppDescriptor[] {
    const needle = query.trim().toLowerCase();
    if (needle === "") return descriptors;
    return descriptors.filter((descriptor) => {
        const haystack = [descriptor.name, ...descriptor.aliases].join(" ").toLowerCase();
        return haystack.includes(needle);
    });
}

export type AppLaunchDecision =
    | { action: "focus"; blockId: string }
    | { action: "create"; view: string }
    | { action: "create-appstream"; appid: string; appname: string };

export type SystemAppLaunchHandlers = {
    focusBlock: (blockId: string) => void | Promise<void>;
    createView: (view: string) => void | Promise<void>;
    createAppStream: (appId: string, appName: string) => void | Promise<void>;
};

export function focusOrCreateDecision(
    descriptor: AppDescriptor,
    options: { newWindow?: boolean } = {}
): AppLaunchDecision {
    if (descriptor.runningBlockIds.length > 0 && !options.newWindow) {
        return { action: "focus", blockId: descriptor.runningBlockIds[0] };
    }
    if (descriptor.view != null) {
        return { action: "create", view: descriptor.view };
    }
    return { action: "create-appstream", appid: descriptor.installedAppId ?? descriptor.id, appname: descriptor.name };
}

export async function launchSystemApp(
    descriptor: AppDescriptor,
    handlers: SystemAppLaunchHandlers,
    options: { newWindow?: boolean } = {}
): Promise<AppLaunchDecision> {
    const decision = focusOrCreateDecision(descriptor, options);
    if (decision.action === "focus") {
        await handlers.focusBlock(decision.blockId);
    } else if (decision.action === "create") {
        await handlers.createView(decision.view);
    } else {
        await handlers.createAppStream(decision.appid, decision.appname);
    }
    const focusedBlockId = decision.action === "focus" ? decision.blockId : undefined;
    void OSSystemModel.getInstance()
        .recordAppTransition(descriptor.name, focusedBlockId ? "focused" : "launched", focusedBlockId)
        .catch(() => undefined);
    return decision;
}

export function systemAppIdForBlock(block: Pick<AppBlockRef, "view"> & { appStreamAppId?: string }): string {
    if (block.view === "appstream" && block.appStreamAppId) {
        return `app:${block.appStreamAppId}`;
    }
    return `view:${block.view}`;
}

let installedAppsCache: Promise<InstalledAppInfo[]> | null = null;

export function fetchInstalledApps(force = false): Promise<InstalledAppInfo[]> {
    if (force || installedAppsCache == null) {
        installedAppsCache = RpcApi.ListInstalledAppsCommand(TabRpcClient)
            .then(async (apps) => {
                const iconMap = await getApi()
                    .getNativeAppIcons(apps.map((app) => app.path))
                    .catch(() => ({}) as Record<string, string>);
                return apps.map((app) => ({ ...app, icon: iconMap[app.path] ?? app.icon }));
            })
            .catch(() => [] as InstalledAppInfo[]);
    }
    return installedAppsCache;
}

export function getBuiltinViewDescriptors(blocks: AppBlockRef[]): AppDescriptor[] {
    return BuiltinViewApps.map((app) =>
        makeViewAppDescriptor(
            app.view,
            blocks.filter((block) => block.view === app.view).map((block) => block.blockId)
        )
    );
}

export function useInstalledAppDescriptors(): AppDescriptor[] {
    const [apps, setApps] = useState<AppDescriptor[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetchInstalledApps().then((list) => {
            if (cancelled) return;
            setApps(list.map((app) => makeInstalledAppDescriptor(app)));
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return apps;
}
