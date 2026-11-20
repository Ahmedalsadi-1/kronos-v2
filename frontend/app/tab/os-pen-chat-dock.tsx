// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Block } from "@/app/block/block";
import { BlockChromeProvider } from "@/app/block/block-chrome-context";
import { PersistentBlockSlot } from "@/app/block/persistent-block";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import { ObjectService } from "@/app/store/services";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { DeviceWorkspaceSelectionContext } from "@/app/view/computers/device-workspace-layout";
import { useBrowserSearchSuggestions } from "@/app/view/webview/browser-address-bar";
import {
    BrowserLibraryModel,
    BrowserLibraryOpenEvent,
    isPrivateBrowserPartition,
    savedBrowserPage,
    searchBrowserHistory,
    type OpenSavedBrowserPage,
} from "@/app/view/webview/browser-library";
import type { WebViewModel } from "@/app/view/webview/webview";
import { makeNativeIslandNodeModel } from "@/app/workspace/native-island-app";
import { getApi, getBlockComponentModel } from "@/store/global";
import type { ComputerTarget } from "@/types/computer-targets";
import type { HermesReviewFile } from "@hermes/global";
import { desktopGit } from "@hermes/lib/desktop-git";
import { $currentCwd } from "@hermes/store/session";
import { useStore } from "@nanostores/react";
import { useAtomValue } from "jotai";
import {
    Files,
    GitPullRequest,
    Globe,
    Image,
    Maximize2,
    Minimize2,
    Monitor,
    PanelRight,
    Plus,
    Search,
    Smartphone,
    Terminal,
    X,
} from "lucide-react";
import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { BrowserTabPreview } from "./browser-tab-preview";
import { ChatBrowserTab } from "./chat-browser-tab";
import { nativeStartCanvasChat, nativeStartComposer, nativeStartTool } from "./os-chat-start-native";
import { OSChatStartPage } from "./os-chat-start-page";
import { OSPenBrowserToolbar } from "./os-pen-browser-toolbar";
import {
    PenChatDockMeta,
    type PenChatDockApp,
    type PenChatDockTab,
    type PenMobileSelection,
} from "./os-pen-chat-dock-model";
import "./os-pen-chat-dock.css";
import { OSPenFiles } from "./os-pen-files";
import { OSPenWorkspaceChrome } from "./os-pen-workspace-chrome";
import { PenTaskGroupMenu } from "./pen-task-group-menu";
import type { PenTaskGroup } from "./pen-task-history";

const ChatPanel = "[data-chat-fullscreen]";

const Apps = {
    widget: { label: "Widget", icon: Monitor, meta: { view: "preview" } },
    browser: { label: "Browser", icon: Globe, meta: { view: "web" } },
    terminal: { label: "Terminal", icon: Terminal, meta: { view: "term", controller: "shell" } },
    files: { label: "Files", icon: Files, meta: { view: "preview" } },
    sandbox: { label: "Sandbox VM", icon: Monitor, meta: { view: "linux-vms", "machine:kind": "desktop" } },
    android: { label: "Android Emulator", icon: Smartphone, meta: { view: "web", url: "http://127.0.0.1:3201/" } },
    iphone: { label: "iPhone Simulator", icon: Smartphone, meta: { view: "web", url: "http://localhost:3200/" } },
} satisfies Record<
    PenChatDockTab["app"],
    { label: string; icon: typeof Globe; meta: { view: string } & Record<string, string> }
>;

function DockBlock({
    tab,
    active,
    close,
    cwd,
    onMobileSelection,
    navigationTarget,
}: {
    tab: PenChatDockTab;
    navigationTarget?: HTMLElement;
    active: boolean;
    close: () => void;
    cwd?: string;
    onMobileSelection?: (selection: PenMobileSelection | null) => void;
}) {
    const platform = tab.app === "android" || tab.app === "iphone" ? tab.app : tab.mobilePreview;
    const needsTarget = platform === "iphone" || tab.app === "android";
    const [visited, setVisited] = useState(active);
    const [deviceError, setDeviceError] = useState("");
    const [deviceReady, setDeviceReady] = useState(false);
    const closeRef = useRef(close);
    closeRef.current = close;
    const model = useMemo(() => makeNativeIslandNodeModel(tab.id, () => closeRef.current()), [tab.id]);
    useEffect(() => {
        if (active) setVisited(true);
    }, [active]);
    const reportDevice = useCallback(
        (target: ComputerTarget | null) => {
            if (active && platform) {
                onMobileSelection?.({ platform, targetId: target?.id, name: target?.name });
            }
        },
        [active, onMobileSelection, platform]
    );
    useEffect(() => {
        if (!active || !platform) return;
        return () => onMobileSelection?.(null);
    }, [active, onMobileSelection, platform]);
    useEffect(() => {
        if (!active || !needsTarget) return;
        let cancelled = false;
        const connect = async () => {
            let target: ComputerTarget;
            if (platform === "iphone") {
                const result = await getApi().resolveIPhonePreviewTarget();
                if (result.success === false) throw new Error(result.error.message);
                target = result.data;
            } else {
                const result = await getApi().listComputerTargets();
                if (result.success === false) throw new Error(result.error.message);
                const devices = result.data.filter((d) => d.kind === "android-emulator" || d.kind === "android-device");
                target = devices.find((d) => d.status === "booted") ?? devices.find((d) => d.status === "shutdown");
                if (!target) throw new Error("No Android device is available.");
            }
            if (cancelled) return;
            const url =
                platform === "iphone"
                    ? "http://localhost:3200/"
                    : `http://127.0.0.1:3201/?target=${encodeURIComponent(target.id)}`;
            if (tab.app !== "browser") {
                await RpcApi.SetMetaCommand(TabRpcClient, { oref: `block:${tab.id}`, meta: { view: "web", url } });
            }
            if (cancelled) return;
            const preview = getBlockComponentModel(tab.id)?.viewModel as WebViewModel | undefined;
            // Restored webviews may have loaded before the local preview helper was ready.
            if (preview?.viewType === "web") preview.hardReload();
            reportDevice(target);
            setDeviceError("");
            setDeviceReady(true);
        };
        void connect().catch((error) => {
            if (!cancelled) setDeviceError(error.message);
        });
        return () => {
            cancelled = true;
        };
    }, [active, needsTarget, platform, tab.app, tab.id, reportDevice]);
    if (!active && !visited && tab.app !== "browser") return null;
    const content = (
        <div className="relative min-h-0 flex-1">
            <BlockChromeProvider mode="integrated" onClose={close}>
                <DeviceWorkspaceSelectionContext.Provider value={reportDevice}>
                    {tab.canvas ? (
                        <PersistentBlockSlot blockId={tab.id} chrome="integrated" />
                    ) : (
                        <Block nodeModel={model} preview={false} />
                    )}
                </DeviceWorkspaceSelectionContext.Provider>
            </BlockChromeProvider>
        </div>
    );
    return (
        <section
            hidden={!active && tab.app !== "browser"}
            data-backgrounded={(!active && tab.app === "browser") || undefined}
            className="pen-chat-dock-page"
            data-app={tab.app}
            aria-label={Apps[tab.app].label}
            data-widget-preview-id={tab.id}
        >
            {deviceError && (
                <p role="alert" className="pen-chat-dock-error">
                    {deviceError}
                </p>
            )}
            {tab.app === "browser" && !tab.mobilePreview && (
                <OSPenBrowserToolbar blockId={tab.id} target={navigationTarget} />
            )}
            {tab.app === "files" ? (
                <OSPenFiles id={tab.id} root={cwd || "~"} path={tab.path}>
                    {content}
                </OSPenFiles>
            ) : needsTarget && !deviceReady ? (
                <p role="status">{deviceError || "Starting device preview…"}</p>
            ) : (
                content
            )}
        </section>
    );
}

export function OSPenChatDock({
    workspaceId = "default",
    editorDocument,
    visible,
    tabs,
    focusRequest,
    workingTabIds = [],
    taskGroups = [],
    onActiveTab,
    onFullChat,
    onMobileSelection,
    imageTab,
}: {
    workspaceId?: string;
    imageTab?: { title: string; mount: HTMLElement; close: () => void };
    editorDocument: Document;
    visible: boolean;
    tabs: PenChatDockTab[];
    focusRequest?: { id: string; background?: boolean };
    workingTabIds?: string[];
    taskGroups?: PenTaskGroup[];
    onActiveTab?: (id: string | undefined) => void;
    onFullChat: (active: boolean) => void;
    onMobileSelection?: (selection: PenMobileSelection | null) => void;
}) {
    const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
    const [keptTabs, setKeptTabs] = useState<string[]>([]);
    const [toolbar, setToolbar] = useState<HTMLElement>(null);
    const library = BrowserLibraryModel.getInstance();
    const browserLibraryState = useAtomValue(library.state);
    const [startAction, setStartAction] = useState<"browser" | "task" | "canvas">();
    const [tabOrder, setTabOrder] = useState<string[]>(
        () => globalStore.get(library.state).sessions[workspaceId]?.order ?? []
    );
    const [split, setSplit] = useState<{ primary: string; secondary: string; axis: "horizontal" | "vertical" }>(null);
    const [draggingTab, setDraggingTab] = useState<string>(null);
    const [splitSize, setSplitSize] = useState(50);
    const draggedTab = useRef<string>(null);
    const [previewSlot, setPreviewSlot] = useState<HTMLElement>(null);
    const [tabSlot, setTabSlot] = useState<HTMLElement>(null);
    const [chatWidth, setChatWidth] = useState(28);
    const [expanded, setExpanded] = useState(false);
    const initialPresentation = useRef(false);
    const [sidebarWidth, setSidebarWidth] = useState(0);
    const [browserToolbarTarget, setBrowserToolbarTarget] = useState<HTMLElement>(null);
    const [resizing, setResizing] = useState(false);
    const [startSearchIntent, setStartSearchIntent] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [highlight, setHighlight] = useState(-1);
    const [bookmarks, setBookmarks] = useState<SuggestionType[]>([]);
    const [recent, setRecent] = useState<string[]>([]);
    const suggestionId = useId();
    const dockRef = useRef<HTMLElement>(null);
    const resizeBounds = useRef<DOMRect>(null);
    const tabRequest = useRef(0);
    const [top, setTop] = useState(48);
    const contentTop = sidebarWidth > 0 ? 0 : top;
    const [open, setOpen] = useState(false);
    const [reviewsOpen, setReviewsOpen] = useState(false);
    const [active, setActive] = useState("new");
    const [changesOpen, setChangesOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [review, setReview] = useState<{ files: HermesReviewFile[]; error?: string }>();
    const [selected, setSelected] = useState<HermesReviewFile>();
    const [diff, setDiff] = useState("");
    const cwd = useStore($currentCwd);
    const opening = useRef(false);
    const root = editorDocument.documentElement;
    const showDock = Boolean(toolbar && visible && open);
    const floating = expanded && showDock;
    useEffect(() => {
        if (!tabs.length) return;
        const previous = globalStore.get(library.state).sessions[workspaceId];
        const privateTab = (id: string) => isPrivateBrowserPartition(tabs.find((tab) => tab.id === id)?.partition);
        library.saveSession(workspaceId, {
            active: privateTab(active) ? (previous?.active ?? "new") : active,
            order: tabOrder.filter((id) => !privateTab(id)),
        });
    }, [active, library, tabOrder, tabs.length, workspaceId]);

    const showReviews = Boolean(toolbar && visible && reviewsOpen);
    const activeTab =
        tabs.some((tab) => tab.id === active) ||
        (changesOpen && active === "changes") ||
        (imageTab && active === "image")
            ? active
            : "new";
    const activeSplit =
        split &&
        (split.primary === activeTab || split.secondary === activeTab) &&
        tabs.some(({ id }) => id === split.primary) &&
        tabs.some(({ id }) => id === split.secondary)
            ? split
            : null;
    useEffect(() => {
        if (!startAction) return;
        const style = editorDocument.createElement("style");
        style.textContent = `
            @keyframes kronos-start-task { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
            @keyframes kronos-start-canvas { from { opacity: 0; clip-path: inset(12% 18% round 18px); } to { opacity: 1; clip-path: inset(0 round 0px); } }
            [data-kronos-start-transition="task"] [data-chat-fullscreen] { animation: kronos-start-task 260ms cubic-bezier(.2,.82,.2,1); }
            [data-kronos-start-transition="canvas"] canvas { animation: kronos-start-canvas 300ms cubic-bezier(.2,.82,.2,1); }
            @media(prefers-reduced-motion:reduce) { [data-kronos-start-transition] * { animation:none !important; } }
        `;
        editorDocument.head.append(style);
        root.dataset.kronosStartTransition = startAction;
        const timer = window.setTimeout(() => setStartAction(undefined), 1000);
        return () => {
            clearTimeout(timer);
            style.remove();
            root.removeAttribute("data-kronos-start-transition");
        };
    }, [startAction, editorDocument, root]);
    useLayoutEffect(() => {
        root.toggleAttribute("data-kronos-chat-start", showDock && activeTab === "new");
        return () => root.removeAttribute("data-kronos-chat-start");
    }, [root, showDock, activeTab]);

    const showChangesTab = showDock && activeTab === "changes";

    useEffect(() => {
        onActiveTab?.(
            showDock && activeTab !== "new" && activeTab !== "changes" && activeTab !== "image" ? activeTab : undefined
        );
    }, [activeTab, onActiveTab, showDock]);

    useEffect(() => {
        if (!imageTab) return;
        setOpen(true);
        setActive("image");
    }, [imageTab?.mount]);

    const mountImage = useCallback(
        (element: HTMLElement | null) => {
            if (element && imageTab) element.append(imageTab.mount);
        },
        [imageTab?.mount]
    );

    const requestedTab = tabs.some(({ id }) => id === focusRequest?.id) ? focusRequest : undefined;
    useEffect(() => {
        if (!toolbar || !requestedTab || requestedTab.background) return;
        setOpen(true);
        setActive(requestedTab.id);
    }, [toolbar, requestedTab]);

    useEffect(() => {
        const slot = editorDocument.createElement("div");
        slot.dataset.kronosChatControls = "";
        const previews = editorDocument.createElement("div");
        previews.dataset.kronosBrowserPreviews = "";
        previews.setAttribute("role", "group");
        previews.setAttribute("aria-label", "Browser tabs");
        const strip = editorDocument.createElement("div");
        strip.dataset.kronosChatTabs = "";
        strip.setAttribute("role", "group");
        strip.setAttribute("aria-label", "Widget tabs");
        const style = editorDocument.createElement("style");
        style.textContent = `
            [data-kronos-full-chat] [data-kronos-pen-navigation],
            [data-kronos-full-chat] [data-pen-chat-hide] { display: none !important; }
            [data-kronos-full-chat] [data-titlebar-right] > :not([data-kronos-pen-system-controls]):not([data-kronos-chat-controls]):not([data-kronos-chat-tabs])
                button:not([aria-label="Settings"]):not([title="Settings"]):not([data-pen-chat-keep]) { display: none !important; }
            @media (min-width: 641px) {
                [data-kronos-chat-split] [data-chat-fullscreen] {
                    right: var(--kronos-chat-dock-width) !important;
                    overflow: hidden;
                }
                [data-kronos-chat-split] [data-agent-spotlight] {
                    left: max(16px, calc((100% - var(--kronos-chat-dock-width) - 720px) / 2)) !important;
                    width: min(720px, calc(100% - var(--kronos-chat-dock-width) - 32px)) !important;
                    translate: none !important;
                    transform: none !important;
                }
            }
            [data-kronos-chat-split] [data-titlebar-right] {
                position: absolute; right: 0; width: var(--kronos-chat-dock-width);
                max-width: none !important; border-radius: 0; box-sizing: border-box;
                height: 55px !important; min-height: 55px; background: #303132; padding: 5px 12px; gap: 8px;
            }
            @media (max-width: 640px) {
                [data-kronos-chat-split] [data-titlebar-right] { width: 100%; }
            }
            [data-kronos-full-chat]:not([data-kronos-chat-split]) [data-chat-fullscreen] { right: 0 !important; }
            [data-kronos-full-chat] [data-chat-fullscreen] {
                transition: right 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, visibility 280ms;
            }
            [data-kronos-full-chat] [data-titlebar-right] {
                transition: width 280ms cubic-bezier(0.22, 1, 0.36, 1);
            }
            [data-kronos-dock-resizing] [data-chat-fullscreen],
            [data-kronos-dock-resizing] [data-titlebar-right] { transition: none; }
            @media (prefers-reduced-motion: reduce) {
                [data-kronos-full-chat] [data-chat-fullscreen],
                [data-kronos-full-chat] [data-titlebar-right] { transition: none; }
            }
            [data-kronos-chat-tabs] { display: none; }
            [data-kronos-full-chat]:not([data-kronos-chat-split]) [data-titlebar-right]:has([data-kronos-chat-tabs] > div) {
                width: min(820px, 70vw); max-width: none !important;
            }
            [data-kronos-full-chat] [data-kronos-chat-tabs]:has(> div) {
                display: flex; flex: 1; min-width: 0; height: 100%; overflow-x: auto;
                align-items: center; gap: 4px; scrollbar-width: none; -webkit-app-region: no-drag;
            }
            [data-kronos-chat-tabs] > div { display: flex; flex: 0 1 308px; min-width: 100px; align-items: center; border-radius: 10px; height: 42px; width: 308px; border: 1px solid transparent; color: #999; }
            [data-kronos-chat-tabs] > div[data-active="true"] { background: #3c3c3c; border-color: #505050; color: #eee; }
            [data-kronos-chat-tabs] > div {
                transition: flex-basis 180ms ease, margin-inline-start 180ms ease, border-radius 180ms ease,
                    background-color 180ms ease;
            }
            [data-kronos-chat-tabs] > div[data-split-side] {
                flex: 0 1 154px;
                border-color: #505050;
                background: #303030;
                color: #ddd;
            }
            [data-kronos-chat-tabs] > div[data-split-side][data-active="true"] { background: #3c3c3c; color: #eee; }
            [data-kronos-chat-tabs] > div[data-split-side="start"] {
                border-start-end-radius: 0;
                border-end-end-radius: 0;
            }
            [data-kronos-chat-tabs] > div[data-split-side="end"] {
                margin-inline-start: -4px;
                border-inline-start: 0;
                border-start-start-radius: 0;
                border-end-start-radius: 0;
            }
            @media (prefers-reduced-motion: reduce) {
                [data-kronos-chat-tabs] > div { transition: none; }
            }
            [data-kronos-chat-tabs] button {
                display: flex; align-items: center; gap: 7px; padding-inline: 12px; font-size: 16px;
                min-height: 40px; white-space: nowrap; border-radius: 10px; cursor: pointer;
            }
            [data-kronos-chat-tabs] > div { max-width: 308px; }
            [data-kronos-chat-tabs] > div > div > button { width: 100%; }
            [data-kronos-chat-tabs] > div > button { margin-left: auto; padding-inline: 8px; }
            [data-kronos-chat-tabs] button { min-width: 0; }
            [data-kronos-chat-tabs] button svg { flex: none; }
            [data-kronos-chat-tabs] button span { overflow: hidden; text-overflow: ellipsis; }
            [data-kronos-chat-tabs] button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
            [data-kronos-chat-tabs] button[data-agent-working] {
                background: color-mix(in srgb, #a78bfa 17%, transparent);
                box-shadow: inset 0 0 0 1px #a78bfa99, inset 0 0 10px #a78bfa45;
            }
            [data-kronos-chat-tabs] button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
            [data-kronos-attach-files] {
                display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
                padding: 4px 7px; border-radius: 5px; font-size: 11px; opacity: .75;
            }
            @media (max-width: 720px) {
                [data-kronos-attach-files] span { display: none; }
            }
            [data-kronos-attach-files]:hover { background: color-mix(in srgb, currentColor 10%, transparent); opacity: 1; }
            [data-kronos-composer-attachments] { max-height: 124px; padding: 6px; gap: 8px; }
            [data-kronos-composer-attachments] span { max-width: min(160px, 24vw); }
            [data-kronos-composer-attachments] button { opacity: 1; cursor: pointer; }
            [data-kronos-composer-attachments] button:focus-visible,
            [data-kronos-attach-files]:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
            [data-kronos-browser-previews] {
                display: flex; gap: 6px; overflow-x: auto; padding: 4px 5px 6px;
                color: inherit;
            }
            [data-kronos-browser-previews]:empty { display: none; }
            [data-kronos-browser-previews] button {
                flex: 0 0 112px; min-width: 0; display: grid; overflow: hidden;
                border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
                background: var(--ui-chat-surface-background); cursor: pointer;
            }
            [data-kronos-browser-previews] button:hover,
            [data-kronos-browser-previews] button[aria-pressed="true"] { border-color: currentColor; }
            [data-kronos-browser-previews] button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
            [data-kronos-browser-preview-image] {
                display: grid; place-items: center; width: 100%; height: 52px; overflow: hidden;
                background: color-mix(in srgb, currentColor 8%, transparent);
            }
            [data-kronos-browser-preview-image] img { width: 100%; height: 52px; object-fit: cover; object-position: top; }
            [data-kronos-browser-preview-label] {
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 6px;
                font-size: 11px; text-align: left;
            }
            [data-kronos-chat-controls] { display: flex; align-items: center; gap: 3px; }
            [data-kronos-chat-controls] button {
                display: grid; place-items: center; width: 32px; height: 32px; cursor: pointer; border-radius: 8px;
            }
            [data-kronos-chat-controls] button:hover,
            [data-kronos-chat-controls] button[aria-expanded="true"] {
                background: color-mix(in srgb, currentColor 12%, transparent);
            }
            [data-kronos-chat-controls] button:focus-visible { outline: 2px solid currentColor; }
        `;
        editorDocument.head.append(style);
        let wasFull = false;
        let currentComposer: Element | null = null;
        const sync = () => {
            const chat = editorDocument.querySelector<HTMLElement>(ChatPanel);
            const titlebar = editorDocument.querySelector<HTMLElement>("[data-titlebar-right]");
            const full = Boolean(visible && chat?.getClientRects().length);
            root.toggleAttribute("data-kronos-full-chat", full);
            if (full !== wasFull) onFullChat((wasFull = full));
            const composer = full && titlebar ? chat.querySelector('[data-slot="composer-dock"]') : null;
            if (composer !== currentComposer) {
                currentComposer = composer;
                if (composer) composer.prepend(previews);
                else previews.remove();
                setPreviewSlot(composer ? previews : null);
            }
            if (!full || !titlebar) {
                setOpen(false);
                setExpanded(false);
                setReviewsOpen(false);
                slot.remove();
                strip.remove();
                setTabSlot(null);
                setToolbar(null);
                return;
            }
            if (!initialPresentation.current) {
                initialPresentation.current = true;
                setOpen(true);
                setExpanded(true);
            }
            if (slot.parentElement !== titlebar) titlebar.append(slot);
            if (strip.parentElement !== titlebar) titlebar.prepend(strip);
            setTabSlot(strip);
            for (const button of titlebar.querySelectorAll("button")) {
                if (button.textContent.trim() === "Sign In") button.setAttribute("data-pen-chat-keep", "");
            }
            const titlebarBounds = titlebar.closest("[data-kronos-sidebar-footer]")
                ? editorDocument.querySelector("[data-titlebar-left]")?.getBoundingClientRect()
                : titlebar.getBoundingClientRect();
            setTop(Math.ceil(titlebarBounds?.bottom || 48));
            setToolbar(slot);
        };
        const observer = new MutationObserver(sync);
        observer.observe(editorDocument.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-chat-fullscreen", "hidden"],
        });
        editorDocument.defaultView?.addEventListener("resize", sync);
        sync();
        return () => {
            observer.disconnect();
            editorDocument.defaultView?.removeEventListener("resize", sync);
            slot.remove();
            strip.remove();
            previews.remove();
            style.remove();
            root.removeAttribute("data-kronos-full-chat");
            onFullChat(false);
        };
    }, [editorDocument, onFullChat, root, visible]);

    useEffect(() => {
        root.toggleAttribute("data-kronos-chat-split", showDock && !floating);
        return () => root.removeAttribute("data-kronos-chat-split");
    }, [root, showDock, floating]);

    useEffect(() => {
        root.toggleAttribute("data-kronos-dock-resizing", resizing);
        return () => root.removeAttribute("data-kronos-dock-resizing");
    }, [root, resizing]);

    const mobileActive =
        !activeSplit &&
        tabs.some(
            ({ id, app, mobilePreview }) => id === activeTab && (app === "iphone" || app === "android" || mobilePreview)
        );
    const dockWidth = floating
        ? `calc(100% - ${sidebarWidth}px - 8px)`
        : mobileActive
          ? `min(calc(100% - ${sidebarWidth + 400}px), max(422px, calc((100dvh - ${contentTop}px - 136px) * 0.46 + 96px)))`
          : `min(${100 - chatWidth}%, calc(100% - ${sidebarWidth + 400}px))`;
    useEffect(() => {
        root.style.setProperty("--kronos-chat-dock-width", dockWidth);
        return () => {
            root.style.removeProperty("--kronos-chat-dock-width");
        };
    }, [root, dockWidth]);

    useEffect(() => {
        if (!showDock || activeTab !== "new" || !searchOpen) return;
        const reqnum = ++tabRequest.current;
        const timer = window.setTimeout(() => {
            void RpcApi.FetchSuggestionsCommand(TabRpcClient, {
                suggestiontype: "bookmark",
                query: query.trim(),
                widgetid: "pen-chat-url",
                reqnum,
            })
                .then((result) => {
                    if (tabRequest.current === reqnum) setBookmarks(result.suggestions ?? []);
                })
                .catch(() => {
                    if (tabRequest.current === reqnum) setBookmarks([]);
                });
        }, 100);
        return () => {
            window.clearTimeout(timer);
            tabRequest.current++;
        };
    }, [activeTab, query, searchOpen, showDock]);

    useEffect(() => {
        if (highlight < 0) return;
        document.getElementById(`${suggestionId}-${highlight}`)?.scrollIntoView({ block: "nearest" });
    }, [highlight, suggestionId]);

    useEffect(() => {
        if (!showReviews) return;
        const dismiss = (event: KeyboardEvent) => {
            if (event.key === "Escape") setReviewsOpen(false);
        };
        document.addEventListener("keydown", dismiss);
        editorDocument.addEventListener("keydown", dismiss);
        return () => {
            document.removeEventListener("keydown", dismiss);
            editorDocument.removeEventListener("keydown", dismiss);
        };
    }, [editorDocument, showReviews]);

    useEffect(() => {
        if (!showReviews && !showChangesTab) return;
        setReview(undefined);
        setSelected(undefined);
        const git = desktopGit()?.review;
        if (!cwd || !git) {
            setReview({ files: [], error: "Open a Git workspace to review changes." });
            return;
        }
        let current = true;
        git.list(cwd, "uncommitted", null).then(
            (result) => {
                if (current) setReview({ files: result.files });
            },
            () => {
                if (current) setReview({ files: [], error: "Could not load workspace changes." });
            }
        );
        return () => {
            current = false;
        };
    }, [cwd, showReviews, showChangesTab]);

    useEffect(() => {
        setDiff("");
        if (!selected || !cwd) return;
        let current = true;
        desktopGit()
            ?.review?.diff(cwd, selected.path, "uncommitted", null, selected.staged)
            .then(
                (result) => {
                    if (current) setDiff(result || "No text diff available.");
                },
                () => {
                    if (current) setDiff("Could not load this diff.");
                }
            );
        return () => {
            current = false;
        };
    }, [cwd, selected]);

    const togglePanel = () => {
        setReviewsOpen(false);
        if (open) setExpanded(false);
        setOpen(!open);
    };
    const showChanges = () => {
        setReviewsOpen(false);
        setOpen(true);
        setChangesOpen(true);
        setActive("changes");
    };
    const launch = async (app: PenChatDockApp, input?: string, forceNew = false, partition?: string) => {
        if (opening.current) return;
        setOpen(true);
        const existing = !forceNew && !input && tabs.find((tab) => tab.app === app);
        if (existing && app !== "iphone") {
            setActive(existing.id);
            return existing.id;
        }
        opening.current = true;
        setPending(true);
        setError("");
        try {
            const value = input?.trim();
            if (app === "browser" && value && /^(?:javascript|data|file|blob):/i.test(value)) {
                throw new Error("Enter a website URL or a search term.");
            }
            const meta = {
                ...Apps[app].meta,
                [PenChatDockMeta]: app,
                ...(app === "browser" && partition ? { "web:partition": partition } : {}),
                ...(app === "browser" && value ? { url: value } : {}),
                ...(app === "files" ? { file: value || cwd || "~" } : {}),
                ...(app === "terminal" && cwd ? { "cmd:cwd": cwd } : {}),
            };
            if (existing) {
                await RpcApi.SetMetaCommand(TabRpcClient, { oref: `block:${existing.id}`, meta });
                setActive(existing.id);
                return;
            }
            const id = await ObjectService.CreateBlock({ meta }, { termsize: { rows: 25, cols: 80 } });
            setActive(id);
            if (app === "browser" && value) {
                setRecent((current) => [value, ...current.filter((item) => item !== value)].slice(0, 8));
            }
            setQuery("");
            setSearchOpen(false);
            return id;
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not open this widget.");
        } finally {
            opening.current = false;
            setPending(false);
        }
    };
    const launchRef = useRef(launch);
    launchRef.current = launch;
    useEffect(() => {
        const restore = (event: Event) => {
            const detail = (event as CustomEvent<OpenSavedBrowserPage>).detail;
            if (!visible || detail.opened) return;
            detail.opened = (async () => {
                const page = savedBrowserPage(detail.page);
                if (!page) throw new Error("This saved browser page cannot be opened.");
                const id = await launchRef.current("browser", page.url, true, page.partition);
                if (!id) throw new Error("Could not reopen this page. Please try again.");
                if (detail.closedId) library.forgetClosed(detail.closedId);
            })();
        };
        const reopen = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "t" || event.repeat)
                return;
            const page = globalStore.get(library.state).closed[0];
            if (!visible || !page || event.defaultPrevented) return;
            event.preventDefault();
            const detail: OpenSavedBrowserPage = { page, closedId: page.id };
            restore(new CustomEvent(BrowserLibraryOpenEvent, { detail }));
            void detail.opened?.catch((failure) => setError(failure.message));
        };
        window.addEventListener(BrowserLibraryOpenEvent, restore);
        document.addEventListener("keydown", reopen);
        editorDocument.addEventListener("keydown", reopen);
        return () => {
            window.removeEventListener(BrowserLibraryOpenEvent, restore);
            document.removeEventListener("keydown", reopen);
            editorDocument.removeEventListener("keydown", reopen);
        };
    }, [editorDocument, library, visible]);
    useEffect(() => {
        const openChatLink = (event: MouseEvent) => {
            if (
                !visible ||
                !toolbar ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            )
                return;
            const target = event.target as Element;
            const link = target.closest?.("a[href]") as HTMLAnchorElement;
            if (!link?.closest(ChatPanel) || link.hasAttribute("download")) return;
            const href = link.getAttribute("href");
            if (!href || href.startsWith("#")) return;
            let app: PenChatDockApp;
            let value: string;
            if (/^https?:\/\//i.test(href)) {
                app = "browser";
                value = href;
            } else if (href.startsWith("/") && !href.startsWith("//")) {
                app = "files";
                value = href;
            } else if (href.startsWith("file://")) {
                const file = new URL(href);
                if (file.hostname && file.hostname !== "localhost") return;
                app = "files";
                value = decodeURIComponent(file.pathname);
            } else return;
            event.preventDefault();
            event.stopPropagation();
            void launchRef.current(app, value);
        };
        editorDocument.addEventListener("click", openChatLink, true);
        return () => editorDocument.removeEventListener("click", openChatLink, true);
    }, [editorDocument, toolbar, visible]);

    useEffect(() => {
        if (!visible || !toolbar) return;
        const openFiles = (event: Event) => {
            event.preventDefault();
            void launchRef.current("files");
        };
        const documents = new Set([document, editorDocument]);
        for (const target of documents) target.addEventListener("kronos:open-chat-files", openFiles);
        return () => {
            for (const target of documents) target.removeEventListener("kronos:open-chat-files", openFiles);
        };
    }, [editorDocument, visible, toolbar]);

    const close = async (id: string) => {
        setError("");
        try {
            const tab = tabs.find((tab) => tab.id === id && tab.app === "browser" && !tab.mobilePreview);
            const block = getBlockComponentModel(id)?.viewModel as WebViewModel;
            const meta = block?.blockAtom ? globalStore.get(block.blockAtom)?.meta : null;
            const page =
                tab &&
                savedBrowserPage({
                    url: meta?.url ?? tab.url,
                    title: tab.title,
                    partition: (meta?.["web:partition"] as string) ?? tab.partition,
                });
            await ObjectService.DeleteBlock(id);
            if (page) library.rememberClosed(page);
            setActive((current) => (current === id ? "new" : current));
        } catch {
            setError("Could not close this widget.");
        }
    };

    const added = review?.files.reduce((sum, file) => sum + file.added, 0) ?? 0;
    const removed = review?.files.reduce((sum, file) => sum + file.removed, 0) ?? 0;
    const displayTabs = [
        { id: "new", label: "New tab", icon: Globe },
        ...(changesOpen ? [{ id: "changes", label: "Changes", icon: GitPullRequest }] : []),
        ...(imageTab ? [{ id: "image", label: imageTab.title, icon: Image }] : []),
        ...tabs.map(({ id, app, title }) => ({ id, icon: Apps[app].icon, label: title || Apps[app].label })),
    ];
    const tabsById = new Map(displayTabs.map((tab) => [tab.id, tab]));
    const orderedIds = [
        ...tabOrder.filter((id) => tabsById.has(id)),
        ...displayTabs
            .slice(1)
            .filter(({ id }) => !tabOrder.includes(id))
            .map(({ id }) => id),
    ];
    // Remember arrival order even before a manual drag; workspace order can prepend new blocks.
    useEffect(() => {
        setTabOrder((previous) =>
            previous.length === orderedIds.length && previous.every((id, index) => id === orderedIds[index])
                ? previous
                : orderedIds
        );
    }, [orderedIds.join("\0")]);
    const orderedTabs = [displayTabs[0], ...orderedIds.map((id) => tabsById.get(id))];
    const groupedIds = new Set(taskGroups.flatMap(({ tabIds }) => tabIds.filter((id) => !keptTabs.includes(id))));
    const ungroupedTabs = orderedTabs.filter(({ id }) => !groupedIds.has(id));
    const groupedTabs = taskGroups.flatMap((group) =>
        orderedTabs.filter(({ id }) => group.tabIds.includes(id) && !keptTabs.includes(id))
    );
    orderedTabs.splice(0, orderedTabs.length, ...ungroupedTabs, ...groupedTabs);
    const groupForTab = (id: string) =>
        keptTabs.includes(id) ? undefined : taskGroups.find((group) => group.tabIds.includes(id));
    if (activeSplit) {
        const primary = orderedTabs.findIndex(({ id }) => id === activeSplit.primary);
        const secondary = orderedTabs.findIndex(({ id }) => id === activeSplit.secondary);
        const pairStart = Math.min(primary, secondary);
        const pair = [orderedTabs[primary], orderedTabs[secondary]];
        orderedTabs.splice(Math.max(primary, secondary), 1);
        orderedTabs.splice(pairStart, 1, ...pair);
    }
    const startTabDrag = (event: React.DragEvent, id: string) => {
        draggedTab.current = id;
        setDraggingTab(id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
    };
    const endTabDrag = () => {
        draggedTab.current = null;
        setDraggingTab(null);
    };
    const acceptTabDrop = (event: React.DragEvent) => {
        if (!draggedTab.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    };
    const dropOnTabBar = (event: React.DragEvent, target: string | null, vertical = false) => {
        const source = draggedTab.current;
        if (!source) return;
        const inSplit = source === activeSplit?.primary || source === activeSplit?.secondary;
        if (target === "new" && !inSplit) return;
        event.preventDefault();
        endTabDrag();
        if (inSplit) {
            setSplit(null);
            setActive(source);
        }
        if (target === source || target === "new") return;
        const ids = orderedTabs
            .slice(1)
            .map((tab) => tab.id)
            .filter((id) => id !== source);
        const bounds = event.currentTarget.getBoundingClientRect();
        const index = target == null ? ids.length : ids.indexOf(target);
        const after =
            target != null &&
            (vertical
                ? event.clientY >= bounds.top + bounds.height / 2
                : event.clientX >= bounds.left + bounds.width / 2);
        ids.splice(index + Number(after), 0, source);
        setTabOrder(ids);
    };
    const value = query.trim();
    const looksLikeUrl =
        /^(?:https?:\/\/|(?:\d{1,3}\.){3}\d{1,3}(?=[:/]|$)|localhost(?=[:/]|$)|[^\s/]+\.[a-z]{2,}(?=[:/]|$))/i.test(
            value
        );
    const webSuggestions = useBrowserSearchSuggestions(
        query,
        showDock && activeTab === "new" && searchOpen && startSearchIntent && !looksLikeUrl
    );
    const options = [
        ...tabs
            .filter(
                (tab) =>
                    tab.app === "browser" &&
                    !isPrivateBrowserPartition(tab.partition) &&
                    tab.url &&
                    `${tab.title} ${tab.url}`.toLowerCase().includes(value.toLowerCase())
            )
            .map((tab) => ({ value: tab.url, label: tab.title || tab.url, detail: tab.url, icon: Globe })),
        ...[...searchBrowserHistory(browserLibraryState.history, value), ...browserLibraryState.pins].map((page) => ({
            value: page.url,
            label: page.title || page.url,
            detail: page.url,
            icon: Globe,
        })),
        ...(value
            ? [
                  {
                      value,
                      label: looksLikeUrl ? value : `Search for “${value}”`,
                      detail: "",
                      icon: looksLikeUrl ? Globe : Search,
                  },
              ]
            : []),
        ...webSuggestions.map((phrase) => ({
            value: phrase,
            label: phrase,
            detail: "DuckDuckGo suggestion",
            icon: Search,
        })),
        ...bookmarks.flatMap((item) => {
            const url = item["url:url"];
            return url && url !== value ? [{ value: url, label: item.display || url, detail: url, icon: Globe }] : [];
        }),
        ...recent
            .filter((item) => item !== value && item.toLowerCase().includes(value.toLowerCase()))
            .map((item) => ({ value: item, label: item, detail: "", icon: Search })),
    ]
        .filter((option, index, all) => all.findIndex((item) => item.value === option.value) === index)
        .slice(0, 8);
    const suggestionsOpen = searchOpen && options.length > 0;
    const resizeChat = (position: number) => {
        const bounds = resizeBounds.current;
        if (bounds?.width) setChatWidth(Math.min(65, Math.max(22, ((position - bounds.left) / bounds.width) * 100)));
    };

    return (
        <>
            <OSPenWorkspaceChrome
                onBrowserToolbarTarget={setBrowserToolbarTarget}
                editorDocument={editorDocument}
                visible={visible}
                floating={floating}
                showMedia={showDock}
                tabs={orderedTabs.flatMap(({ id }) => tabs.find((tab) => tab.id === id) ?? [])}
                activeTab={activeTab}
                onSidebarWidth={setSidebarWidth}
                onSelectTab={(id) => {
                    setActive(id);
                    setOpen(true);
                }}
                onCloseTab={(id) => void close(id)}
                onNewTab={() => {
                    setActive("new");
                    setOpen(true);
                }}
                onOpenBrowser={(url) => void launch("browser", url)}
                onRegular={() => {
                    setExpanded(false);
                    setOpen(false);
                }}
                onMedia={() => {
                    setExpanded(false);
                    setOpen(true);
                }}
                onFloating={() => {
                    setExpanded(true);
                    setOpen(true);
                }}
            />
            {visible &&
                previewSlot &&
                createPortal(
                    tabs
                        .filter(({ app, id }) => app === "browser" || id === requestedTab?.id)
                        .map((tab) => (
                            <ChatBrowserTab
                                key={tab.id}
                                tab={tab}
                                selected={showDock && activeTab === tab.id}
                                rendered={tab.app === "browser"}
                                onOpen={() => {
                                    setReviewsOpen(false);
                                    setActive(tab.id);
                                    setOpen(true);
                                }}
                            />
                        )),
                    previewSlot
                )}
            {toolbar &&
                createPortal(
                    <>
                        <button
                            type="button"
                            title="Mini Reviews"
                            aria-label="Mini Reviews"
                            aria-expanded={showReviews}
                            onClick={() => setReviewsOpen(!reviewsOpen)}
                        >
                            <GitPullRequest size={16} />
                        </button>
                        {showDock && (
                            <button
                                type="button"
                                title={expanded ? "Restore tab" : "Expand tab"}
                                aria-label={expanded ? "Restore tab" : "Expand tab"}
                                aria-pressed={expanded}
                                onClick={() => {
                                    setExpanded(!expanded);
                                }}
                            >
                                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>
                        )}
                        <button
                            type="button"
                            title="Widget side panel"
                            aria-label="Widget side panel"
                            aria-expanded={showDock}
                            onClick={togglePanel}
                        >
                            <PanelRight size={16} />
                        </button>
                    </>,
                    toolbar
                )}
            {showReviews && (
                <aside
                    className="pen-chat-review"
                    style={{ top: contentTop }}
                    aria-label="Mini Reviews"
                    data-live-block-occluder=""
                >
                    <div>Reviews</div>
                    <button type="button" onClick={showChanges}>
                        <GitPullRequest size={16} /> Changes
                        <span className="pen-chat-review-total">
                            {review && !review.error && (
                                <>
                                    <span>+{added}</span> <span>−{removed}</span>
                                </>
                            )}
                        </span>
                    </button>
                    <div role="status">
                        {review?.error ?? (review ? `${review.files.length} changed files` : "Loading changes…")}
                    </div>
                </aside>
            )}
            {sidebarWidth === 0 &&
                (showDock || (visible && (tabs.length > 0 || taskGroups.length > 0))) &&
                tabSlot &&
                createPortal(
                    <>
                        {orderedTabs.map(({ id, label, icon: Icon }, index) => (
                            <Fragment key={id}>
                                {groupForTab(id) &&
                                    groupForTab(orderedTabs[index - 1]?.id)?.id !== groupForTab(id).id && (
                                        <PenTaskGroupMenu
                                            group={groupForTab(id)}
                                            tabs={tabs}
                                            keptTabs={keptTabs}
                                            collapsed={collapsedGroups.includes(groupForTab(id).id)}
                                            onToggle={() =>
                                                setCollapsedGroups((groups) =>
                                                    groups.includes(groupForTab(id).id)
                                                        ? groups.filter((key) => key !== groupForTab(id).id)
                                                        : [...groups, groupForTab(id).id]
                                                )
                                            }
                                            onKeep={(tabId) => setKeptTabs((ids) => [...ids, tabId])}
                                            onOpen={(tabId) => {
                                                setActive(tabId);
                                                setOpen(true);
                                            }}
                                            onClose={async (ids) => {
                                                for (const tabId of ids) await close(tabId);
                                            }}
                                        />
                                    )}
                                <div
                                    hidden={Boolean(groupForTab(id) && collapsedGroups.includes(groupForTab(id).id))}
                                    data-active={id === activeTab}
                                    data-split-side={
                                        id === activeSplit?.primary
                                            ? "start"
                                            : id === activeSplit?.secondary
                                              ? "end"
                                              : undefined
                                    }
                                    key={id}
                                    onContextMenu={(event) => {
                                        if (!tabs.some((tab) => tab.id === id)) return;
                                        const canSplit = id !== activeTab && tabs.some((tab) => tab.id === activeTab);
                                        const inSplit = id === activeSplit?.primary || id === activeSplit?.secondary;
                                        if (!canSplit && !inSplit) return;
                                        event.preventDefault();
                                        ContextMenuModel.getInstance().showContextMenu(
                                            inSplit
                                                ? [
                                                      {
                                                          label: "Detach from Split",
                                                          click: () => {
                                                              setSplit(null);
                                                              setActive(id);
                                                          },
                                                      },
                                                  ]
                                                : [
                                                      {
                                                          label: "Split Right of Active Tab",
                                                          click: () =>
                                                              setSplit({
                                                                  primary: activeTab,
                                                                  secondary: id,
                                                                  axis: "horizontal",
                                                              }),
                                                      },
                                                  ],
                                            event
                                        );
                                    }}
                                    onDragOver={acceptTabDrop}
                                    onDrop={(event) => dropOnTabBar(event, id)}
                                >
                                    <BrowserTabPreview blockId={id} label={label} active={id === activeTab}>
                                        <button
                                            type="button"
                                            draggable={id !== "new"}
                                            data-agent-working={workingTabIds.includes(id) || undefined}
                                            aria-pressed={id === activeTab}
                                            onClick={() => {
                                                setActive(id);
                                                setOpen(true);
                                            }}
                                            onDragStart={(event) => startTabDrag(event, id)}
                                            onDragEnd={endTabDrag}
                                        >
                                            <Icon size={15} /> <span>{label}</span>
                                        </button>
                                    </BrowserTabPreview>
                                    {id !== "new" && (
                                        <button
                                            type="button"
                                            aria-label={`Close ${label}`}
                                            onClick={() => {
                                                if (id === "image") {
                                                    imageTab?.close();
                                                    setActive("new");
                                                    return;
                                                }
                                                if (id !== "changes") {
                                                    void close(id);
                                                    return;
                                                }
                                                setChangesOpen(false);
                                                setActive((current) => (current === id ? "new" : current));
                                            }}
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            </Fragment>
                        ))}
                        {taskGroups
                            .filter(
                                (group) => !tabs.some(({ id }) => group.tabIds.includes(id) && !keptTabs.includes(id))
                            )
                            .map((group) => (
                                <PenTaskGroupMenu
                                    key={group.id}
                                    group={group}
                                    tabs={tabs}
                                    keptTabs={keptTabs}
                                    collapsed
                                    onToggle={() => {}}
                                    onKeep={(id) => setKeptTabs((ids) => [...ids, id])}
                                    onOpen={(id) => {
                                        setActive(id);
                                        setOpen(true);
                                    }}
                                    onClose={async (ids) => {
                                        for (const id of ids) await close(id);
                                    }}
                                />
                            ))}
                        <button
                            type="button"
                            aria-label="New widget tab"
                            onClick={() => setActive("new")}
                            onDragOver={acceptTabDrop}
                            onDrop={(event) => dropOnTabBar(event, null)}
                        >
                            <Plus size={16} />
                        </button>
                    </>,
                    tabSlot
                )}
            <aside
                ref={dockRef}
                hidden={!visible || (!showDock && !tabs.some(({ app }) => app === "browser"))}
                data-backgrounded={!showDock || undefined}
                aria-hidden={!showDock || undefined}
                inert={!showDock}
                data-background-browser={tabs.some(({ app }) => app === "browser")}
                className="pen-chat-dock"
                data-start-action={startAction}
                data-island-overlay={floating || undefined}
                data-resizing={resizing || undefined}
                style={
                    {
                        top: contentTop,
                        "--kronos-chat-dock-width": dockWidth,
                    } as CSSProperties
                }
                aria-label="Chat widgets"
            >
                <div
                    hidden={mobileActive || expanded}
                    className="pen-chat-divider"
                    role="separator"
                    tabIndex={0}
                    aria-label="Resize chat and widgets"
                    aria-orientation="vertical"
                    aria-valuemin={22}
                    aria-valuemax={65}
                    aria-valuenow={Math.round(chatWidth)}
                    onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        setResizing(true);
                        resizeBounds.current = dockRef.current?.parentElement?.getBoundingClientRect();
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeChat(event.clientX);
                    }}
                    onLostPointerCapture={() => {
                        setResizing(false);
                        resizeBounds.current = null;
                    }}
                    onDoubleClick={() => setChatWidth(28)}
                    onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        setChatWidth((width) =>
                            Math.min(65, Math.max(22, width + (event.key === "ArrowLeft" ? -2 : 2)))
                        );
                    }}
                />
                {error && (
                    <p className="pen-chat-dock-error" role="alert">
                        {error}
                    </p>
                )}
                <OSChatStartPage
                    active={showDock && activeTab === "new"}
                    query={query}
                    onQuery={(value) => {
                        setQuery(value);
                        setSearchOpen(true);
                    }}
                    pending={pending}
                    onSearchIntent={setStartSearchIntent}
                    destinations={options}
                    onBrowser={async (value) => {
                        setStartAction("browser");
                        const id = await launch("browser", value);
                        if (!id) throw new Error("Could not open the browser. Please try again.");
                    }}
                    onLaunch={launch}
                    onChanges={showChanges}
                    onChat={async (text, canvas) => {
                        setStartAction(canvas ? "canvas" : "task");
                        if (canvas) {
                            await nativeStartCanvasChat(editorDocument, text);
                        } else {
                            await nativeStartComposer(editorDocument).send(text);
                        }
                        setExpanded(false);
                        setOpen(false);
                    }}
                    onTool={async (label, text) => {
                        const invoke = nativeStartTool(editorDocument, label, text);
                        setExpanded(false);
                        setOpen(false);
                        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                        invoke();
                    }}
                />
                {activeTab === "changes" && (
                    <section
                        className="pen-chat-changes"
                        aria-label="Workspace changes"
                        data-widget-preview-id="changes"
                    >
                        <p>{review?.error ?? (review ? `${review.files.length} changed files` : "Loading changes…")}</p>
                        {review?.files.map((file) => (
                            <button
                                type="button"
                                key={`${file.path}:${file.staged}`}
                                aria-pressed={selected === file}
                                onClick={() => setSelected(file)}
                            >
                                {file.path}{" "}
                                <span>
                                    +{file.added} −{file.removed}
                                </span>
                            </button>
                        ))}
                        {selected && <pre>{diff || "Loading diff…"}</pre>}
                    </section>
                )}
                {imageTab && (
                    <section
                        ref={mountImage}
                        hidden={!showDock || activeTab !== "image"}
                        className="pen-chat-dock-page"
                        aria-label={imageTab.title}
                    />
                )}
                <div
                    className="pen-chat-widget-panes"
                    hidden={!tabs.some(({ id }) => id === activeTab) && !tabs.some(({ app }) => app === "browser")}
                    data-backgrounded={!tabs.some(({ id }) => id === activeTab) || undefined}
                    data-split={Boolean(activeSplit)}
                    data-split-axis={activeSplit?.axis}
                    style={{ "--pen-split-size": splitSize } as CSSProperties}
                >
                    {draggingTab && draggingTab !== activeTab && tabs.some(({ id }) => id === draggingTab) && (
                        <div className="pen-chat-split-drop">
                            {(["left", "right", "top", "bottom"] as const).map((side) => (
                                <div
                                    key={side}
                                    data-side={side}
                                    onDragOver={acceptTabDrop}
                                    onDrop={(event) => {
                                        const source = draggedTab.current;
                                        if (!source || source === activeTab) return;
                                        event.preventDefault();
                                        endTabDrag();
                                        setSplitSize(50);
                                        const before = side === "left" || side === "top";
                                        setSplit({
                                            primary: before ? source : activeTab,
                                            secondary: before ? activeTab : source,
                                            axis: side === "left" || side === "right" ? "horizontal" : "vertical",
                                        });
                                    }}
                                >
                                    <span>Split {side}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeSplit && (
                        <div
                            className="pen-chat-split-divider"
                            role="separator"
                            aria-label="Resize widget panes"
                            aria-orientation={activeSplit.axis === "vertical" ? "horizontal" : "vertical"}
                            aria-valuemin={20}
                            aria-valuemax={80}
                            aria-valuenow={splitSize}
                            tabIndex={0}
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={(event) => {
                                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                                const pane = event.currentTarget.parentElement;
                                const bounds = pane.getBoundingClientRect();
                                const stacked = activeSplit.axis === "vertical";
                                const fraction = stacked
                                    ? (event.clientY - bounds.top) / bounds.height
                                    : (event.clientX - bounds.left) / bounds.width;
                                if (Number.isFinite(fraction))
                                    setSplitSize(Math.max(20, Math.min(80, Math.round(fraction * 100))));
                            }}
                            onKeyDown={(event) => {
                                const step = { ArrowLeft: -5, ArrowUp: -5, ArrowRight: 5, ArrowDown: 5 }[event.key];
                                if (step == null) return;
                                event.preventDefault();
                                setSplitSize((size) => Math.max(20, Math.min(80, size + step)));
                            }}
                        />
                    )}
                    {tabs
                        .filter((tab) => !tab.canvas || toolbar)
                        .map((tab) => (
                            <div
                                className="pen-chat-widget-pane"
                                key={tab.id}
                                hidden={
                                    tab.app !== "browser" &&
                                    tab.id !== activeTab &&
                                    tab.id !== activeSplit?.primary &&
                                    tab.id !== activeSplit?.secondary
                                }
                                data-backgrounded={
                                    (tab.app === "browser" &&
                                        tab.id !== activeTab &&
                                        tab.id !== activeSplit?.primary &&
                                        tab.id !== activeSplit?.secondary) ||
                                    undefined
                                }
                                inert={
                                    tab.id !== activeTab &&
                                    tab.id !== activeSplit?.primary &&
                                    tab.id !== activeSplit?.secondary
                                }
                                data-background-browser={tab.app === "browser"}
                                data-secondary={tab.id === activeSplit?.secondary}
                            >
                                {(tab.id === activeSplit?.primary || tab.id === activeSplit?.secondary) && (
                                    <span
                                        className="pen-chat-pane-drag"
                                        draggable
                                        title="Drag to tab bar to detach"
                                        onDragStart={(event) => startTabDrag(event, tab.id)}
                                        onDragEnd={endTabDrag}
                                    >
                                        ⠿
                                    </span>
                                )}
                                <DockBlock
                                    tab={tab}
                                    navigationTarget={tab.id === activeTab ? browserToolbarTarget : null}
                                    cwd={cwd}
                                    onMobileSelection={onMobileSelection}
                                    close={() => void close(tab.id)}
                                    active={
                                        showDock &&
                                        (tab.id === activeTab ||
                                            tab.id === activeSplit?.primary ||
                                            tab.id === activeSplit?.secondary)
                                    }
                                />
                            </div>
                        ))}
                </div>
            </aside>
        </>
    );
}
