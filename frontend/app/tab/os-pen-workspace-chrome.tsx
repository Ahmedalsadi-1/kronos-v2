// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import ExpandedLogo from "@/app/asset/logo-expanded.svg?url";
import CompactLogo from "@/app/asset/logo.svg?url";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { BrowserPinnedPages } from "@/app/view/webview/browser-library-menu";
import { BrowserWorkspaceSearch } from "@/app/view/webview/browser-workspace-search";
import { SystemCenterOpenEvent } from "@/app/workspace/command-center-events";
import {
    ArrowDownToLine,
    Eye,
    EyeOff,
    Globe,
    GripHorizontal,
    MessageCircle,
    PanelRight,
    Plus,
    Settings,
    Terminal,
    X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PenChatDockTab } from "./os-pen-chat-dock-model";
import workspaceStyles from "./os-pen-workspace-chrome.css?inline";
import { OSWebDownloads } from "./os-web-navbar";

type Slots = {
    title?: HTMLElement;
    titlebar?: HTMLElement;
    browser?: HTMLElement;
    tabs?: HTMLElement;
    footer?: HTMLElement;
    rail?: HTMLElement;
    controls?: HTMLElement;
    resize?: HTMLElement;
};
type FloatingPosition = { x: number; bottom: number };

export function OSPenWorkspaceChrome({
    editorDocument,
    visible,
    floating,
    showMedia,
    tabs,
    activeTab,
    onSelectTab,
    onCloseTab,
    onNewTab,
    onOpenBrowser,
    onRegular,
    onMedia,
    onFloating,
    onSidebarWidth,
    onBrowserToolbarTarget,
}: {
    editorDocument: Document;
    visible: boolean;
    floating: boolean;
    showMedia: boolean;
    tabs: PenChatDockTab[];
    activeTab: string;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    onOpenBrowser: (url: string) => void;
    onRegular: () => void;
    onMedia: () => void;
    onFloating: () => void;
    onSidebarWidth: (width: number) => void;
    onBrowserToolbarTarget: (element: HTMLDivElement | null) => void;
}) {
    const root = editorDocument.documentElement;
    const view = editorDocument.defaultView;
    const [slots, setSlots] = useState<Slots>({});
    const [threadVisible, setThreadVisible] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(272);
    const [islandWidth, setIslandWidth] = useState(800);
    const [threadHeight, setThreadHeight] = useState(180);
    const [position, setPosition] = useState<FloatingPosition>();
    const [viewport, setViewport] = useState({ width: root.clientWidth || 1000, height: root.clientHeight || 800 });
    const [bookmarks, setBookmarks] = useState<SuggestionType[]>([]);
    const drag = useRef<{
        kind: "move" | "resize" | "sidebar";
        x: number;
        y: number;
        left: number;
        bottom: number;
        width: number;
        height: number;
    }>(null);
    const sidebarOpen = Boolean(slots.rail);
    const sidebarInset = sidebarOpen ? Math.min(sidebarWidth, viewport.width * 0.42) : 0;
    const browser = showMedia
        ? tabs.find(({ id, app, mobilePreview }) => id === activeTab && app === "browser" && !mobilePreview)
        : undefined;
    const inline = floating && !sidebarOpen && Boolean(browser);
    const width = Math.min(islandWidth, Math.max(1, viewport.width - sidebarInset - 24));
    const height = Math.min(threadHeight, Math.max(96, viewport.height - 230));
    const clampPosition = (next: FloatingPosition) => ({
        x: Math.max(sidebarInset + 12, Math.min(viewport.width - width - 12, next.x)),
        bottom: Math.max(16, Math.min(viewport.height - 160 - (threadVisible ? height + 8 : 0), next.bottom)),
    });
    const move = (x: number, bottom: number) => setPosition(clampPosition({ x, bottom }));
    const startDrag = (event: React.PointerEvent<HTMLElement> | PointerEvent, kind: "move" | "resize" | "sidebar") => {
        if (event.button !== 0) return;
        const island = editorDocument.querySelector<HTMLElement>("[data-agent-spotlight]");
        const box = island?.getBoundingClientRect();
        if (kind !== "sidebar" && !box?.width) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = {
            kind,
            x: event.screenX,
            y: event.screenY,
            left: box?.left ?? 0,
            bottom: box ? viewport.height - box.bottom : 20,
            width: kind === "sidebar" ? sidebarWidth : width,
            height,
        };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    };
    const moveDrag = (event: React.PointerEvent<HTMLElement> | PointerEvent) => {
        const start = drag.current;
        if (!start) return;
        const dx = event.screenX - start.x;
        const dy = event.screenY - start.y;
        if (start.kind === "sidebar") {
            setSidebarWidth(
                Math.max(Math.min(220, viewport.width * 0.42), Math.min(380, viewport.width * 0.42, start.width + dx))
            );
        } else if (start.kind === "resize") {
            setIslandWidth(Math.max(280, Math.min(800, viewport.width - sidebarInset - 24, start.width + dx * 2)));
            setThreadHeight(Math.max(96, Math.min(viewport.height - 230, start.height - dy)));
        } else move(start.left + dx, start.bottom - dy);
    };
    const stopDrag = () => {
        drag.current = null;
    };
    const dragProps = { onPointerMove: moveDrag, onPointerUp: stopDrag, onLostPointerCapture: stopDrag };

    useLayoutEffect(() => {
        root.style.setProperty(
            "--kronos-window-controls-inset",
            view?.navigator.platform.startsWith("Mac") ? "72px" : "0px"
        );
        const style = editorDocument.createElement("style");
        style.textContent = workspaceStyles;
        editorDocument.head.append(style);
        const title = editorDocument.createElement("span");
        title.dataset.kronosSidebarToggle = "";
        const sync = () => {
            const left = editorDocument.querySelector<HTMLElement>("[data-titlebar-left]");
            if (left && title.parentElement !== left) left.append(title);
            const rail = editorDocument.querySelector<HTMLElement>("[data-kronos-history-docked]");
            const next: Slots = {
                title: left ? title : undefined,
                titlebar: left,
                rail,
                browser: rail?.querySelector("[data-kronos-sidebar-browser]"),
                tabs: rail?.querySelector("[data-kronos-sidebar-tabs]"),
                footer: rail?.querySelector("[data-kronos-sidebar-footer]"),
            };
            setSlots((previous) =>
                previous.title === next.title &&
                previous.titlebar === next.titlebar &&
                previous.rail === next.rail &&
                previous.browser === next.browser &&
                previous.tabs === next.tabs &&
                previous.footer === next.footer
                    ? previous
                    : { ...previous, ...next }
            );
        };
        const observer = new MutationObserver(sync);
        observer.observe(editorDocument.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-kronos-history-docked"],
        });
        const resizeViewport = () => setViewport({ width: root.clientWidth || 1000, height: root.clientHeight || 800 });
        view?.addEventListener("resize", resizeViewport);
        sync();
        return () => {
            observer.disconnect();
            view?.removeEventListener("resize", resizeViewport);
            style.remove();
            root.style.removeProperty("--kronos-window-controls-inset");
            title.remove();
        };
    }, [editorDocument, root, view]);

    useLayoutEffect(() => {
        root.toggleAttribute("data-kronos-sidebar-open", visible && sidebarOpen);
        root.style.setProperty("--kronos-sidebar-width", sidebarInset + "px");
        onSidebarWidth(sidebarInset);
        return () => {
            root.removeAttribute("data-kronos-sidebar-open");
            root.style.removeProperty("--kronos-sidebar-width");
        };
    }, [onSidebarWidth, root, sidebarInset, sidebarOpen, visible]);

    useLayoutEffect(() => {
        const left = slots.titlebar;
        if (sidebarOpen || !left) return;
        let frame: number;
        const measure = () => {
            // Native width caps can leave the sidebar toggle outside the group's box.
            const right = Math.max(
                left.getBoundingClientRect().right,
                ...Array.from(
                    left.querySelectorAll("button, [data-kronos-sidebar-toggle]"),
                    (element) => element.getBoundingClientRect().right
                )
            );
            root.style.setProperty("--kronos-titlebar-start", (right > 0 ? Math.ceil(right) + 8 : 228) + "px");
        };
        const schedule = () => {
            if (frame != null) return;
            frame = requestAnimationFrame(() => {
                frame = undefined;
                measure();
            });
        };
        const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
        resize?.observe(left);
        resize?.observe(slots.title);
        const mutations = new MutationObserver(schedule);
        mutations.observe(left, {
            childList: true,
            characterData: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style"],
        });
        view?.addEventListener("resize", schedule);
        editorDocument.fonts?.addEventListener("loadingdone", schedule);
        measure();
        return () => {
            if (frame != null) cancelAnimationFrame(frame);
            resize?.disconnect();
            mutations.disconnect();
            view?.removeEventListener("resize", schedule);
            editorDocument.fonts?.removeEventListener("loadingdone", schedule);
            root.style.removeProperty("--kronos-titlebar-start");
        };
    }, [editorDocument, root, sidebarOpen, slots.title, slots.titlebar, view]);

    useLayoutEffect(() => {
        if (!sidebarOpen || !slots.footer) return;
        const titlebar = editorDocument.querySelector<HTMLElement>("[data-titlebar-right]");
        if (!titlebar) return;
        const anchor = editorDocument.createComment("Workspace titlebar");
        titlebar.before(anchor);
        slots.footer.append(titlebar);
        return () => {
            anchor.replaceWith(titlebar);
        };
    }, [editorDocument, sidebarOpen, slots.footer]);

    useLayoutEffect(() => {
        root.toggleAttribute("data-kronos-floating-chat", visible && floating);
        root.toggleAttribute("data-kronos-thread-hidden", !threadVisible);
        const current = position ? clampPosition(position) : undefined;
        const geometry = {
            "--kronos-island-width": width + "px",
            "--kronos-island-thread-height": height + "px",
            "--kronos-island-left": (current?.x ?? sidebarInset + (viewport.width - sidebarInset - width) / 2) + "px",
            "--kronos-island-bottom": (current?.bottom ?? 20) + "px",
        };
        for (const [key, value] of Object.entries(geometry)) root.style.setProperty(key, value);
        view?.dispatchEvent(new CustomEvent("kronos:chat-presentation", { detail: visible && floating }));
        return () => {
            root.removeAttribute("data-kronos-floating-chat");
            root.removeAttribute("data-kronos-thread-hidden");
            for (const key of Object.keys(geometry)) root.style.removeProperty(key);
        };
    }, [floating, height, position, root, sidebarInset, threadVisible, viewport, visible, width]);

    useEffect(() => {
        if (!floating || !visible) return;
        const controls = editorDocument.createElement("div");
        controls.dataset.kronosIslandControls = "";
        const resize = editorDocument.createElement("div");
        resize.dataset.kronosIslandResize = "";
        let animation: number;
        const sync = () => {
            const island = editorDocument.querySelector<HTMLElement>("[data-agent-spotlight]");
            const row = island?.querySelector<HTMLElement>("[data-kronos-pen-composer-controls]");
            const screen = row?.querySelector("button[aria-label='Choose sandbox computer']");
            const parent = inline && screen ? row : editorDocument.body;
            if (parent && controls.parentElement !== parent) {
                if (inline && screen) screen.after(controls);
                else parent.append(controls);
            }
            controls.toggleAttribute("data-inline", inline && Boolean(screen));
            controls.hidden = !inline || !screen;
            if (!inline || !screen) {
                const rect = island?.getBoundingClientRect();
                const mini =
                    threadVisible &&
                    island?.querySelector<HTMLElement>("[data-kronos-mini-chat]")?.getBoundingClientRect();
                if (rect?.width) {
                    controls.style.left = rect.left + rect.width / 2 + "px";
                    controls.style.top = (mini && mini.height ? mini.top : rect.top) - 32 + "px";
                }
            }
            const mini = island?.querySelector<HTMLElement>("[data-kronos-mini-chat]")?.getBoundingClientRect();
            resize.toggleAttribute("data-composer-only", !threadVisible || !mini?.height);
            if (island && resize.parentElement !== island) island.append(resize);
            setSlots((previous) =>
                previous.controls === controls && previous.resize === resize
                    ? previous
                    : { ...previous, controls, resize }
            );
            animation = requestAnimationFrame(sync);
        };
        sync();
        return () => {
            cancelAnimationFrame(animation);
            controls.remove();
            resize.remove();
            setSlots((previous) => ({ ...previous, controls: undefined, resize: undefined }));
        };
    }, [editorDocument, floating, inline, threadVisible, visible]);

    useEffect(() => {
        if (!floating) return;
        const start = (event: PointerEvent) => {
            if (
                !(event.target as Element).closest("[data-agent-notch-header]") ||
                (event.target as Element).closest("button")
            )
                return;
            startDrag(event, "move");
        };
        const open = (event: MouseEvent) => {
            if (!(event.target as Element).closest("[data-agent-spotlight] button[aria-label='Open chat tab']")) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onRegular();
        };
        editorDocument.addEventListener("pointerdown", start, true);
        editorDocument.addEventListener("pointermove", moveDrag);
        editorDocument.addEventListener("pointerup", stopDrag);
        editorDocument.addEventListener("pointercancel", stopDrag);
        editorDocument.addEventListener("click", open, true);
        return () => {
            editorDocument.removeEventListener("pointerdown", start, true);
            editorDocument.removeEventListener("pointermove", moveDrag);
            editorDocument.removeEventListener("pointerup", stopDrag);
            editorDocument.removeEventListener("pointercancel", stopDrag);
            editorDocument.removeEventListener("click", open, true);
        };
    }, [editorDocument, floating, height, onRegular, sidebarInset, viewport, width]);

    useEffect(
        () => () => {
            view?.dispatchEvent(new CustomEvent("kronos:chat-presentation", { detail: false }));
        },
        [view]
    );
    useEffect(() => {
        let current = true;
        void RpcApi.FetchSuggestionsCommand(TabRpcClient, {
            suggestiontype: "bookmark",
            query: "",
            widgetid: "pen-sidebar-bookmarks",
            reqnum: 1,
        })
            .then(({ suggestions }) => {
                if (current) setBookmarks(suggestions ?? []);
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, []);
    const toggleSidebar = () => view?.dispatchEvent(new Event("kronos:toggle-sidebar"));
    return (
        <>
            {visible &&
                slots.title &&
                createPortal(
                    <button
                        type="button"
                        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                        aria-expanded={sidebarOpen}
                        onClick={toggleSidebar}
                    >
                        <img
                            src={sidebarOpen ? ExpandedLogo : CompactLogo}
                            alt=""
                            width={sidebarOpen ? 58 : 20}
                            height={20}
                            draggable={false}
                        />
                    </button>,
                    slots.title
                )}
            {slots.browser &&
                createPortal(
                    <>
                        {browser ? (
                            <div ref={onBrowserToolbarTarget} className="pen-sidebar-browser-toolbar" />
                        ) : (
                            <BrowserWorkspaceSearch onOpen={onOpenBrowser} />
                        )}
                        {bookmarks.length > 0 && (
                            <nav className="pen-sidebar-pinned" aria-label="Pinned websites">
                                {bookmarks.slice(0, 6).map((item) => (
                                    <button
                                        type="button"
                                        key={item.suggestionid}
                                        title={item.display}
                                        aria-label={"Open " + item.display}
                                        onClick={() => onOpenBrowser(item["url:url"])}
                                    >
                                        {item.iconsrc ? (
                                            <img src={item.iconsrc} alt="" />
                                        ) : (
                                            item.display.slice(0, 1).toUpperCase()
                                        )}
                                    </button>
                                ))}
                            </nav>
                        )}
                    </>,
                    slots.browser
                )}
            {slots.tabs &&
                createPortal(
                    <nav className="pen-sidebar-tabs" aria-label="Workspace tabs">
                        <BrowserPinnedPages />
                        <div className="pen-sidebar-label">Workspace</div>
                        {tabs.map((tab) => (
                            <div key={tab.id} data-active={showMedia && activeTab === tab.id}>
                                <button
                                    type="button"
                                    aria-pressed={showMedia && activeTab === tab.id}
                                    onClick={() => onSelectTab(tab.id)}
                                >
                                    {tab.app === "terminal" ? <Terminal size={15} /> : <Globe size={15} />}
                                    <span>{tab.title || tab.app}</span>
                                </button>
                                <button
                                    type="button"
                                    aria-label={"Close " + (tab.title || tab.app)}
                                    onClick={() => onCloseTab(tab.id)}
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={onNewTab}>
                            <Plus size={15} /> New tab
                        </button>
                    </nav>,
                    slots.tabs
                )}
            {slots.footer &&
                createPortal(
                    <div className="pen-sidebar-footer">
                        <button
                            type="button"
                            aria-label="Settings"
                            onClick={() =>
                                window.dispatchEvent(
                                    new CustomEvent(SystemCenterOpenEvent, {
                                        detail: { center: "control", section: "canvas" },
                                    })
                                )
                            }
                        >
                            <Settings size={16} />
                        </button>
                        <button type="button" aria-label="Regular chat" onClick={onRegular}>
                            <MessageCircle size={16} />
                        </button>
                        <button type="button" aria-label="Chat + media panel" onClick={onMedia}>
                            <PanelRight size={16} />
                        </button>
                        <button type="button" aria-label="Floating chat" onClick={onFloating}>
                            <GripHorizontal size={16} />
                        </button>
                        <OSWebDownloads blockId={browser?.id ?? tabs.find(({ app }) => app === "browser")?.id} />
                    </div>,
                    slots.footer
                )}
            {slots.rail &&
                createPortal(
                    <button
                        type="button"
                        className="pen-sidebar-resize"
                        aria-label="Resize sidebar"
                        onPointerDown={(event) => startDrag(event, "sidebar")}
                        {...dragProps}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                event.preventDefault();
                                setSidebarWidth((value) =>
                                    Math.max(220, Math.min(380, value + (event.key === "ArrowRight" ? 12 : -12)))
                                );
                            }
                        }}
                    />,
                    slots.rail
                )}
            {floating &&
                slots.controls &&
                createPortal(
                    <>
                        <button
                            type="button"
                            aria-label="Move chat island"
                            title="Drag to move the island"
                            onPointerDown={(event) => startDrag(event, "move")}
                            {...dragProps}
                            onKeyDown={(event) => {
                                const delta = {
                                    ArrowLeft: [-16, 0],
                                    ArrowRight: [16, 0],
                                    ArrowUp: [0, 16],
                                    ArrowDown: [0, -16],
                                }[event.key];
                                if (!delta) return;
                                event.preventDefault();
                                const box = editorDocument
                                    .querySelector("[data-agent-spotlight]")
                                    ?.getBoundingClientRect();
                                if (box) move(box.left + delta[0], viewport.height - box.bottom + delta[1]);
                            }}
                        >
                            <GripHorizontal size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label={threadVisible ? "Hide message thread" : "Show message thread"}
                            aria-pressed={threadVisible}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => setThreadVisible(!threadVisible)}
                        >
                            {threadVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                            type="button"
                            aria-label="Dock chat island"
                            title="Return island to bottom center"
                            onClick={() => setPosition(undefined)}
                        >
                            <ArrowDownToLine size={15} />
                        </button>
                    </>,
                    slots.controls
                )}
            {floating &&
                slots.resize &&
                createPortal(
                    <button
                        type="button"
                        aria-label="Resize floating chat"
                        title="Drag to resize chat width and thread height"
                        onPointerDown={(event) => startDrag(event, "resize")}
                        {...dragProps}
                        onKeyDown={(event) => {
                            const delta = { ArrowLeft: -16, ArrowRight: 16, ArrowUp: 16, ArrowDown: -16 }[event.key];
                            if (delta == null) return;
                            event.preventDefault();
                            if (event.key === "ArrowUp" || event.key === "ArrowDown")
                                setThreadHeight((value) =>
                                    Math.max(96, Math.min(viewport.height - 230, value + delta))
                                );
                            else setIslandWidth((value) => Math.max(280, Math.min(800, value + delta)));
                        }}
                    />,
                    slots.resize
                )}
        </>
    );
}
