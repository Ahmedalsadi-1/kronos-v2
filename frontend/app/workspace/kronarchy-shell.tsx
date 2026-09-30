// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AppIcon } from "@/app/components/app-icon";
import { SystemListRow, SystemPopover, SystemUIProvider } from "@/app/components/system-ui";
import {
    fetchInstalledApps,
    launchSystemApp,
    makeInstalledAppDescriptor,
    makeViewAppDescriptor,
    type AppDescriptor,
} from "@/app/store/app-registry";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import {
    publishWorkspacePresentation,
    readWorkspacePresentation,
    subscribeWorkspacePresentation,
    type WorkspacePresentation,
} from "@/app/tab/workspace-presentation";
import { createBlock, getApi, globalStore, refocusNode, setActiveTab } from "@/store/global";
import * as WOS from "@/store/wos";
import { cn } from "@/util/util";
import { requestKronTermSettings } from "@hermes/app/settings/kronterm-settings-host";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CommandCenterToggleEvent, focusOSSession, openSystemCenter } from "./command-center-events";
import "./kronarchy-shell.scss";
import { applyWorkspaceAppearance, readWorkspaceAppearance } from "./workspace-appearance";

const KronarchyEnabledStorageKey = "kronterm:kronarchy-enabled";
const CommandSpaceCompatibilityStorageKey = "kronterm:command-center-command-space-compat";

type LauncherItem = {
    id: string;
    label: string;
    description: string;
    icon: string;
    keywords: string;
    shortcut?: string;
    action: () => void | Promise<void>;
};

type LauncherSection = {
    id: string;
    label: string;
    items: LauncherItem[];
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function migrateKronarchyPreference(storage: StorageLike): boolean {
    try {
        const compatibilityValue = storage.getItem(CommandSpaceCompatibilityStorageKey);
        const legacyValue = storage.getItem(KronarchyEnabledStorageKey);
        if (legacyValue != null) {
            storage.removeItem(KronarchyEnabledStorageKey);
            if (compatibilityValue == null && legacyValue === "true") {
                storage.setItem(CommandSpaceCompatibilityStorageKey, "true");
                return true;
            }
        }
        return compatibilityValue === "true";
    } catch {
        return false;
    }
}

function readKronarchyEnabled(): boolean {
    return migrateKronarchyPreference(window.localStorage);
}

function publishLayoutMode(mode: WorkspacePresentation): void {
    const presentation = publishWorkspacePresentation(mode);
    void RpcApi.SetConfigCommand(TabRpcClient, { "app:layoutmode": presentation }).catch((error) => {
        console.warn("[Command Center] workspace presentation update failed", error);
    });
}

function shouldOpenKronarchyLauncher(
    event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey">,
    legacyCommandSpace: boolean
): boolean {
    const isCommandSpace = event.code === "Space" && event.metaKey && !event.altKey && !event.ctrlKey;
    return isCommandSpace && (event.shiftKey || legacyCommandSpace);
}

const SystemCommandCenterHost = ({ workspace, activeTabId }: { workspace: Workspace; activeTabId: string }) => {
    const [legacyCommandSpace] = useState(readKronarchyEnabled);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeItemId, setActiveItemId] = useState<string>();
    const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
    const [systemItems, setSystemItems] = useState<SystemSearchItem[]>([]);
    const [systemSearching, setSystemSearching] = useState(false);
    const layoutMode = useSyncExternalStore(
        subscribeWorkspacePresentation,
        () => readWorkspacePresentation("os"),
        () => "os"
    );
    const searchRef = useRef<HTMLInputElement>(null);
    const launcherReturnFocusRef = useRef<HTMLElement | null>(null);
    const tabIds = workspace?.tabids ?? [];

    const chooseLayout = useCallback((mode: WorkspacePresentation) => {
        publishLayoutMode(mode);
        setOpen(false);
    }, []);

    const launchWidget = useCallback(async (blockDef: BlockDef, ephemeral = false) => {
        await createBlock(blockDef, false, ephemeral);
        setOpen(false);
    }, []);

    const launchRegisteredApp = useCallback(
        async (descriptor: AppDescriptor, blockDef?: BlockDef, options: { newWindow?: boolean } = {}) => {
            const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", activeTabId)));
            const runningBlockIds = (tab?.blockids ?? []).filter((blockId) => {
                const block = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)));
                if (descriptor.view != null) {
                    return block?.meta?.view === descriptor.view;
                }
                return (
                    block?.meta?.view === "appstream" && block.meta?.["appstream:appid"] === descriptor.installedAppId
                );
            });
            await launchSystemApp(
                { ...descriptor, runningBlockIds },
                {
                    focusBlock: (blockId) => {
                        focusOSSession(blockId);
                        refocusNode(blockId);
                        setOpen(false);
                    },
                    createView: (view) => launchWidget(blockDef ?? { meta: { view } }),
                    createAppStream: (appId, appName) =>
                        launchWidget({
                            meta: {
                                view: "appstream",
                                "appstream:appid": appId,
                                "appstream:appname": appName,
                            } as MetaType,
                        }),
                },
                options
            );
        },
        [activeTabId, launchWidget]
    );

    const openKronos = useCallback(async () => {
        await launchRegisteredApp(makeViewAppDescriptor("hermes", []));
    }, [launchRegisteredApp]);

    const openSettings = useCallback(
        async (section: "theme" | "visual" | "shortcuts") => {
            requestKronTermSettings(section);
            await openKronos();
            setOpen(false);
        },
        [openKronos]
    );

    const sections = useMemo<LauncherSection[]>(
        () => [
            {
                id: "spaces",
                label: "Project spaces",
                items: tabIds.map((tabId, index) => ({
                    id: `workspace-tab-${tabId}`,
                    label: `Space ${index + 1}`,
                    description: tabId === activeTabId ? "Current project space" : "Switch to this project space",
                    icon: tabId === activeTabId ? "fa-folder-open" : "fa-folder",
                    keywords: `project space workspace ${index + 1} switch open`,
                    shortcut: index < 9 ? `⌘${index + 1}` : undefined,
                    action: () => {
                        setActiveTab(tabId);
                        setOpen(false);
                    },
                })),
            },
            {
                id: "apps",
                label: "Applications",
                items: [
                    {
                        id: "terminal",
                        label: "Terminal",
                        description: "Open a local shell",
                        icon: "fa-square-terminal",
                        keywords: "shell command cli",
                        shortcut: "⌘↩",
                        action: () =>
                            launchRegisteredApp(
                                makeViewAppDescriptor("term", []),
                                { meta: { view: "term", controller: "shell" } },
                                { newWindow: true }
                            ),
                    },
                    {
                        id: "browser",
                        label: "Browser",
                        description: "Open a web session",
                        icon: "fa-globe",
                        keywords: "web internet",
                        action: () =>
                            launchRegisteredApp(
                                makeViewAppDescriptor("web", []),
                                { meta: { view: "web" } },
                                { newWindow: true }
                            ),
                    },
                    {
                        id: "files",
                        label: "Files",
                        description: "Browse local files and folders",
                        icon: "fa-folder",
                        keywords: "preview directory explorer resource",
                        action: () =>
                            launchRegisteredApp(
                                makeViewAppDescriptor("preview", []),
                                { meta: { view: "preview", file: "~" } },
                                { newWindow: true }
                            ),
                    },
                    {
                        id: "kronos",
                        label: "KronTerm Agent",
                        description: "Open the system assistant",
                        icon: "fa-sparkles",
                        keywords: "kronoscode chamber chat ai hermes agent",
                        action: openKronos,
                    },
                    {
                        id: "activity",
                        label: "Activity Center",
                        description: "Inspect system and agent activity",
                        icon: "fa-bell",
                        keywords: "system notifications approvals jobs agents progress timeline",
                        action: () => {
                            openSystemCenter("activity");
                            setOpen(false);
                        },
                    },
                ],
            },
            {
                id: "workspace",
                label: "Workspace",
                items: [
                    {
                        id: "scratchpad",
                        label: "Scratchpad",
                        description: "Open a temporary terminal",
                        icon: "fa-layer-group",
                        keywords: "floating ephemeral terminal overlay",
                        action: () => launchWidget({ meta: { view: "term", controller: "shell" } }, true),
                    },
                    {
                        id: "layout-widgets",
                        label: "Tiled Widgets",
                        description: "Resizable split workspace",
                        icon: "fa-table-cells-large",
                        keywords: "windows tile split grid layout",
                        action: () => chooseLayout("widgets"),
                    },
                    {
                        id: "layout-tabs",
                        label: "Widget Tabs",
                        description: "Focused sessions with a tab strip",
                        icon: "fa-window-restore",
                        keywords: "tabs focused window layout",
                        action: () => chooseLayout("tabs"),
                    },
                    {
                        id: "layout-canvas",
                        label: "Canvas",
                        description: "Spatial project canvas",
                        icon: "fa-object-group",
                        keywords: "spatial infinite layout",
                        action: () => chooseLayout("canvas"),
                    },
                    {
                        id: "layout-os",
                        label: "KronTerm OS",
                        description: "System workspace with live application windows",
                        icon: "fa-desktop",
                        keywords: "os desktop spatial windows system",
                        action: () => chooseLayout("os"),
                    },
                ],
            },
            {
                id: "system",
                label: "System",
                items: [
                    {
                        id: "themes",
                        label: "System Appearance",
                        description: "Configure color, contrast, and motion",
                        icon: "fa-swatchbook",
                        keywords: "theme wallpaper color contrast motion appearance",
                        action: () => openSettings("theme"),
                    },
                    {
                        id: "settings",
                        label: "Settings",
                        description: "Configure KronTerm",
                        icon: "fa-sliders",
                        keywords: "preferences options visual setup",
                        action: () => openSettings("visual"),
                    },
                    {
                        id: "connections",
                        label: "Connections",
                        description: "Manage hosts and credentials",
                        icon: "fa-network-wired",
                        keywords: "ssh remote host setup",
                        action: () => launchWidget({ meta: { view: "waveconfig" } }),
                    },
                    {
                        id: "control-center",
                        label: "Control Center",
                        description: "Review permissions, restoration, and services",
                        icon: "fa-sliders",
                        keywords: "permissions grants capture restore services control center",
                        action: () => {
                            openSystemCenter("control");
                            setOpen(false);
                        },
                    },
                    {
                        id: "keyboard-shortcuts",
                        label: "Keyboard Shortcuts",
                        description: "Review command bindings",
                        icon: "fa-keyboard",
                        keywords: "keys hotkeys command space setup",
                        action: () => openSettings("shortcuts"),
                    },
                ],
            },
        ],
        [activeTabId, chooseLayout, launchRegisteredApp, launchWidget, openKronos, openSettings, tabIds]
    );

    const normalizedQuery = query.trim().toLowerCase();
    const extendedSections = useMemo<LauncherSection[]>(() => {
        if (!normalizedQuery) {
            return sections;
        }
        const appItems = installedApps.map((app): LauncherItem => {
            const descriptor = makeInstalledAppDescriptor(app);
            return {
                id: `installed-app-${app.bundleid || app.appid}`,
                label: app.name,
                description: app.description || app.category || "Installed application",
                icon: app.icon || "fa-window-maximize",
                keywords: `application app desktop ${app.category ?? ""} ${app.path}`,
                action: () => launchRegisteredApp(descriptor),
            };
        });
        const resourceItems = systemItems.map((item): LauncherItem => ({
            id: `resource-${item.kind}-${item.path}`,
            label: item.name,
            description: item.detail,
            icon: item.kind === "folder" ? "fa-folder" : item.kind === "wallpaper" ? "fa-image" : "fa-file-lines",
            keywords: `${item.kind} file folder resource ${item.path}`,
            action: () => launchWidget({ meta: { view: "preview", file: item.path } }),
        }));
        return [
            ...sections,
            ...(appItems.length > 0 ? [{ id: "installed-apps", label: "Computer applications", items: appItems }] : []),
            ...(resourceItems.length > 0
                ? [{ id: "resources", label: "Files and resources", items: resourceItems }]
                : []),
        ];
    }, [installedApps, launchRegisteredApp, launchWidget, normalizedQuery, sections, systemItems]);
    const visibleSections = useMemo(
        () =>
            extendedSections
                .map((section) => ({
                    ...section,
                    items: section.items.filter((item) =>
                        `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalizedQuery)
                    ),
                }))
                .filter((section) => section.items.length > 0),
        [extendedSections, normalizedQuery]
    );
    const visibleItems = useMemo(() => visibleSections.flatMap((section) => section.items), [visibleSections]);
    const activeLauncherItem = visibleItems.find((item) => item.id === activeItemId) ?? visibleItems[0];

    useEffect(() => {
        applyWorkspaceAppearance(readWorkspaceAppearance());
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldOpenKronarchyLauncher(event, legacyCommandSpace)) {
                event.preventDefault();
                event.stopPropagation();
                setOpen((current) => !current);
                return;
            }
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        const handleCommandCenterToggle = () => setOpen((current) => !current);
        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener(CommandCenterToggleEvent, handleCommandCenterToggle);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener(CommandCenterToggleEvent, handleCommandCenterToggle);
        };
    }, [legacyCommandSpace]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setActiveItemId(undefined);
            launcherReturnFocusRef.current?.focus();
            launcherReturnFocusRef.current = null;
            return;
        }
        launcherReturnFocusRef.current = document.activeElement as HTMLElement;
        window.requestAnimationFrame(() => searchRef.current?.focus());
    }, [open]);

    useEffect(() => {
        if (!open || installedApps.length > 0) {
            return;
        }
        let cancelled = false;
        void fetchInstalledApps()
            .then((apps) => {
                if (!cancelled) {
                    setInstalledApps(apps.sort((left, right) => left.name.localeCompare(right.name)));
                }
            })
            .catch((error) => console.warn("[Command Center] failed to list installed applications", error));
        return () => {
            cancelled = true;
        };
    }, [installedApps.length, open]);

    useEffect(() => {
        if (!open || normalizedQuery.length < 2) {
            setSystemItems([]);
            setSystemSearching(false);
            return;
        }
        let cancelled = false;
        setSystemSearching(true);
        const timeout = window.setTimeout(() => {
            void getApi()
                .searchSystemItems(normalizedQuery)
                .then((items) => {
                    if (!cancelled) {
                        setSystemItems(items);
                    }
                })
                .catch((error) => {
                    console.warn("[Command Center] system search failed", error);
                    if (!cancelled) {
                        setSystemItems([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setSystemSearching(false);
                    }
                });
        }, 180);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [normalizedQuery, open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        setActiveItemId((current) => {
            if (current && visibleItems.some((item) => item.id === current)) {
                return current;
            }
            return visibleItems[0]?.id;
        });
    }, [open, visibleItems]);

    const handleLauncherKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === "Tab") {
                const focusable = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                        'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
                    )
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
                return;
            }
            if (event.key === "Enter") {
                const activeItem = visibleItems.find((item) => item.id === activeItemId) ?? visibleItems[0];
                if (activeItem) {
                    event.preventDefault();
                    void activeItem.action();
                }
                return;
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                return;
            }
            event.preventDefault();
            if (visibleItems.length === 0) {
                return;
            }
            const currentIndex = Math.max(
                0,
                visibleItems.findIndex((item) => item.id === activeItemId)
            );
            const direction = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex = (currentIndex + direction + visibleItems.length) % visibleItems.length;
            setActiveItemId(visibleItems[nextIndex]?.id);
        },
        [activeItemId, visibleItems]
    );

    if (!open) {
        return null;
    }

    return (
        <SystemUIProvider>
            <div
                className="kronarchy-launcher-backdrop"
                data-workspace-presentation={layoutMode}
                role="presentation"
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                        setOpen(false);
                    }
                }}
            >
                <SystemPopover
                    className="kronarchy-launcher"
                    aria-modal="true"
                    aria-label="KronTerm Command Center"
                    onKeyDown={handleLauncherKeyDown}
                >
                    <header className="kronarchy-launcher-header">
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search apps, spaces, files, settings, and actions"
                            aria-label="Search applications, project spaces, files, settings, and actions"
                            aria-describedby="kronarchy-launcher-status"
                        />
                        <kbd aria-hidden="true">esc</kbd>
                    </header>
                    <div className="kronarchy-launcher-results">
                        {visibleSections.length > 0 ? (
                            visibleSections.map((section) => (
                                <div key={section.id} className="kronarchy-launcher-section">
                                    <h2>{section.label}</h2>
                                    {section.items.map((item) => {
                                        const selectedLayout = item.id === `layout-${layoutMode}`;
                                        return (
                                            <SystemListRow
                                                key={item.id}
                                                className={cn(
                                                    selectedLayout && "is-selected",
                                                    activeItemId === item.id && "is-active"
                                                )}
                                                icon={<AppIcon icon={item.icon} />}
                                                title={item.label}
                                                detail={item.description}
                                                trailing={
                                                    selectedLayout ? (
                                                        <i className="fa-solid fa-check" aria-hidden="true" />
                                                    ) : item.shortcut ? (
                                                        <kbd>{item.shortcut}</kbd>
                                                    ) : undefined
                                                }
                                                onClick={() => void item.action()}
                                                onMouseEnter={() => setActiveItemId(item.id)}
                                            />
                                        );
                                    })}
                                </div>
                            ))
                        ) : (
                            <p className="kronarchy-launcher-empty">
                                {systemSearching
                                    ? "Searching this Mac…"
                                    : "No matching application, resource, or action"}
                            </p>
                        )}
                    </div>
                    <footer id="kronarchy-launcher-status" className="kronarchy-launcher-status" aria-live="polite">
                        <span>{activeLauncherItem?.description ?? "Type to search across KronTerm"}</span>
                        <span>↑↓ Navigate · ↩ Open</span>
                    </footer>
                </SystemPopover>
            </div>
        </SystemUIProvider>
    );
};

const KronarchyShell = SystemCommandCenterHost;

export {
    CommandSpaceCompatibilityStorageKey,
    KronarchyEnabledStorageKey,
    KronarchyShell,
    migrateKronarchyPreference,
    readKronarchyEnabled,
    shouldOpenKronarchyLauncher,
    SystemCommandCenterHost,
};
