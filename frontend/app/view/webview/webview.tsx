import { browserNavigationSnapshot } from "../../../types/browser-navigation";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { reportDesktopPetActivity, type AgentWidgetActivity } from "@/app/aipanel/desktop-pet-activity";
import { BlockNodeModel } from "@/app/block/blocktypes";
import { Search, useSearch } from "@/app/element/search";
import { globalStore } from "@/app/store/jotaiStore";
import { getSimpleControlShiftAtom } from "@/app/store/keymodel";
import type { TabModel } from "@/app/store/tab-model";
import { makeORef } from "@/app/store/wos";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import {
    BlockHeaderSuggestionControl,
    SuggestionControlNoData,
    SuggestionControlNoResults,
} from "@/app/suggestion/suggestion";
import { useAgentPresenceForBlock } from "@/app/view/agent-control-indicator";
import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import { reportCursorToPet } from "@/app/view/cursor-overlay";
import { requestAgentTakeover } from "@/app/view/hermes/hermes-tool-activity";
import { useAgentOverlays } from "@/app/view/use-agent-overlays";
import { BrowserAddressBar, clearBrowserAddressHistory } from "@/app/view/webview/browser-address-bar";
import { BrowserAnnotationTray } from "@/app/view/webview/browser-annotation-tray";
import { BrowserMarkupEvent } from "@/app/view/webview/browser-markup-overlay";
import {
    BrowserChromeToolbar,
    BrowserNavigationControlRow,
    type BrowserNavigationControls,
} from "@/app/view/webview/browser-nav-controls";
import { BrowserToolbarMenu, type BrowserDeviceProfile } from "@/app/view/webview/browser-toolbar-menu";
import { MockBoundary } from "@/app/waveenv/mockboundary";
import { useWaveEnv } from "@/app/waveenv/waveenv";
import { getApi } from "@/store/global";
import { adaptFromReactOrNativeKeyEvent, checkKeyPressed } from "@/util/keyutil";
import { fireAndForget, useAtomValueSafe } from "@/util/util";
import clsx from "clsx";
import type { WebviewTag } from "electron";
import { Atom, PrimitiveAtom, atom, useAtomValue, useSetAtom } from "jotai";
import { Code2, Cookie, ExternalLink, Pause } from "lucide-react";
import { Fragment, createRef, memo, useCallback, useEffect, useRef, useState } from "react";
import { makeBrowserPayload, publishCrossViewEvent } from "../../../types/cross-view-bus";
import { getBrowserAnnotationsAtom } from "./browser-annotations";
import { BrowserGrabController, type BrowserGrabIntent } from "./browser-grab-controller";
import { BrowserGrabSheet } from "./browser-grab-sheet";
import { BrowserMarkupOverlay } from "./browser-markup-overlay";
import { BrowserResearchPanel } from "./browser-research-panel";
import "./webview.scss";
import type { WebViewEnv } from "./webviewenv";

export const BrowserPageToolbar = memo(
    ({ model, islandControls }: { model: WebViewModel; islandControls?: React.ReactNode }) => {
        const block = useAtomValue(model.blockAtom);
        const agentPresence = useAgentPresenceForBlock(model.blockId, "web");
        const currentUrl = useAtomValue(model.url);
        const homepageUrl = useAtomValue(model.homepageUrl);
        const canGoBack = useAtomValue(model.canGoBack);
        const canGoForward = useAtomValue(model.canGoForward);
        const isLoading = useAtomValue(model.isLoading);
        const refreshIcon = useAtomValue(model.refreshIcon);
        const faviconUrl = useAtomValue(model.faviconUrl);
        const urlInputFocused = useAtomValue(model.urlInputFocused);
        const userAgentType = (useAtomValue(model.userAgentType) || "default") as BrowserDeviceProfile;
        const zoomValue = Number(block?.meta?.["web:zoom"] ?? 1);
        const zoom = Number.isFinite(zoomValue) ? zoomValue : 1;
        const grabIntent = useAtomValue(model.grabIntentAtom);
        const toolError = useAtomValue(model.browserToolErrorAtom);
        const inspectMode = grabIntent === "grab";
        const [cookieDialog, setCookieDialog] = useState(false);
        const [cookiesJson, setCookiesJson] = useState("");
        const [cookieStatus, setCookieStatus] = useState("");
        const markupSequence = useRef(0);
        const url = currentUrl ?? block?.meta?.url ?? homepageUrl ?? "";
        useEffect(() => {
            markupSequence.current++;
            window.dispatchEvent(
                new CustomEvent(BrowserMarkupEvent, { detail: { blockId: model.blockId, dataUrl: null } })
            );
            return () => {
                markupSequence.current++;
            };
        }, [model, currentUrl]);

        const openExternal = () => {
            if (url) {
                void model.env.electron.openExternal(model.modifyExternalUrl?.(url) ?? url);
            }
        };
        const toggleInspect = () => model.setGrabIntent(inspectMode ? null : "grab");
        const toggleAnnotate = () => model.setGrabIntent(grabIntent === "annotate" ? null : "annotate");
        const markup = async () => {
            const sequence = ++markupSequence.current;
            try {
                model.setGrabIntent(null);
                const webview = model.webviewRef.current;
                const screenshot = await getApi().captureBrowserPage({ guestId: webview.getWebContentsId() });
                if (sequence !== markupSequence.current || webview !== model.webviewRef.current || !webview.isConnected)
                    return;
                if (!screenshot) throw new Error("The browser page could not be captured");
                window.dispatchEvent(
                    new CustomEvent(BrowserMarkupEvent, {
                        detail: { blockId: model.blockId, dataUrl: screenshot.dataUrl },
                    })
                );
            } catch (error) {
                if (sequence === markupSequence.current)
                    globalStore.set(
                        model.browserToolErrorAtom,
                        error instanceof Error ? error.message : "Screenshot capture failed"
                    );
            }
        };
        const partition = String(block?.meta?.["web:partition"] ?? "");
        const sessionProfile = partition.includes("kronterm-work")
            ? "work"
            : partition.includes("kronterm-personal")
              ? "personal"
              : partition.startsWith("kronterm-private-")
                ? "private"
                : "default";
        const changeSession = (profile: string) => {
            model.setGrabIntent(null);
            const nextPartition =
                profile === "default"
                    ? null
                    : profile === "private"
                      ? `kronterm-private-${model.blockId}`
                      : `persist:kronterm-${profile}`;
            void model.env.rpc.SetMetaCommand(TabRpcClient, {
                oref: makeORef("block", model.blockId),
                meta: { "web:partition": nextPartition },
            });
        };
        const importCookies = async () => {
            setCookieStatus("Importing…");
            try {
                const result = await getApi().importBrowserCookies({
                    guestId: model.webviewRef.current.getWebContentsId(),
                    cookiesJson,
                });
                setCookieStatus(`${result.count} cookies imported`);
                setCookiesJson("");
                model.hardReload();
            } catch (error) {
                setCookieStatus(error instanceof Error ? error.message : "Cookie import failed");
            }
        };
        const openCookieDialog = () => {
            model.setGrabIntent(null);
            setCookieStatus("");
            setCookieDialog(true);
        };
        const openSettings = () =>
            void model.env.createBlock(
                { meta: { view: "preview", file: `${model.env.electron.getConfigDir()}/settings.json` } },
                false,
                true
            );
        const navControls: BrowserNavigationControls = {
            canGoBack,
            canGoForward,
            loading: isLoading,
            goBack: () => model.handleBack(),
            goForward: () => model.handleForward(),
            reload: () => model.handleRefresh(null),
            navigate: (nextUrl: string) => model.loadUrl(nextUrl, "navigation-row"),
        };

        return (
            <BrowserChromeToolbar>
                <BrowserNavigationControlRow
                    addressSlot={
                        <BrowserAddressBar model={model} url={url} focused={urlInputFocused} faviconUrl={faviconUrl} />
                    }
                    controls={navControls}
                    reloadIcon={refreshIcon}
                    reloadLabel={isLoading ? "Stop" : "Reload"}
                >
                    <button
                        type="button"
                        className="webview-toolbar-secondary"
                        onClick={openCookieDialog}
                        aria-label="Import session cookies"
                        title="Import session cookies"
                    >
                        <Cookie size={16} />
                    </button>
                    <button
                        type="button"
                        className="webview-toolbar-secondary"
                        onClick={() => model.openFind()}
                        aria-label="Find in page"
                        title="Find in page"
                    >
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="webview-toolbar-secondary"
                        onClick={() => model.toggleDevTools()}
                        aria-label="Open browser DevTools"
                        title="Open browser DevTools"
                    >
                        <Code2 size={16} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="webview-toolbar-secondary"
                        onClick={openExternal}
                        aria-label="Open in external browser"
                        title="Open in external browser"
                    >
                        <ExternalLink size={16} aria-hidden="true" />
                    </button>
                    <BrowserToolbarMenu
                        deviceProfile={userAgentType}
                        inspectMode={inspectMode}
                        onInspect={toggleInspect}
                        onFind={() => model.openFind()}
                        onDevTools={() => model.toggleDevTools()}
                        onOpenExternal={openExternal}
                        zoom={zoom}
                        onHome={() => model.handleHome()}
                        onHardReload={() => model.hardReload()}
                        onCopyUrl={() => model.copyUrlToClipboard()}
                        onZoomChange={(nextZoom) => model.setZoomFactor(nextZoom)}
                        onDeviceProfileChange={(profile) => model.setUserAgentType(profile)}
                        onClearHistory={() => {
                            model.clearHistory();
                            clearBrowserAddressHistory(model.blockId);
                        }}
                        onClearSiteData={() => void model.clearCookiesAndStorage()}
                        onAnnotate={toggleAnnotate}
                        onMarkup={() => void markup()}
                        onImportCookies={openCookieDialog}
                        onSessionChange={changeSession}
                        sessionProfile={sessionProfile}
                        onSettings={openSettings}
                        onResearch={() => globalStore.set(model.grabController.researchOpen, true)}
                    />
                    {agentPresence && (
                        <button
                            type="button"
                            className="webview-toolbar-secondary"
                            aria-label="Take over agent control"
                            title="Take over agent control"
                            onClick={() => requestAgentTakeover()}
                        >
                            <Pause size={16} aria-hidden="true" />
                        </button>
                    )}
                    {islandControls}
                </BrowserNavigationControlRow>
                {toolError && (
                    <div className="flex items-center gap-2 bg-red-950 px-3 py-1 text-xs text-red-200" role="status">
                        {toolError}
                        <button
                            type="button"
                            className="ml-auto cursor-pointer"
                            onClick={() => globalStore.set(model.browserToolErrorAtom, "")}
                        >
                            Dismiss
                        </button>
                    </div>
                )}
                {cookieDialog && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                setCookiesJson("");
                                setCookieDialog(false);
                            }
                        }}
                    >
                        <section
                            role="dialog"
                            aria-modal="true"
                            aria-label="Import session cookies"
                            className="flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-white/15 bg-[#171719] p-4 text-white"
                        >
                            <h2 className="text-sm font-semibold">Import session cookies</h2>
                            <p className="text-xs text-white/60">
                                Paste a JSON cookie array exported from your browser. Cookies stay in the selected
                                browser session.
                            </p>
                            <textarea
                                autoFocus
                                value={cookiesJson}
                                maxLength={1000000}
                                aria-label="Cookies JSON"
                                className="h-40 resize-none rounded-lg bg-black p-2 font-mono text-xs"
                                onChange={(event) => setCookiesJson(event.target.value)}
                            />
                            {cookieStatus && (
                                <p className="text-xs" role="status">
                                    {cookieStatus}
                                </p>
                            )}
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="cursor-pointer rounded-lg px-3 py-2 text-xs hover:bg-white/10"
                                    onClick={() => {
                                        setCookiesJson("");
                                        setCookieDialog(false);
                                    }}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    disabled={!cookiesJson.trim()}
                                    className="cursor-pointer rounded-lg bg-violet-400/25 px-3 py-2 text-xs disabled:opacity-30"
                                    onClick={() => void importCookies()}
                                >
                                    Import
                                </button>
                            </div>
                        </section>
                    </div>
                )}
            </BrowserChromeToolbar>
        );
    }
);
BrowserPageToolbar.displayName = "BrowserPageToolbar";

// User agent strings for mobile emulation
const USER_AGENT_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const USER_AGENT_ANDROID =
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36";

let webviewPreloadUrl = null;

function getWebviewPreloadUrl(env: WebViewEnv) {
    if (webviewPreloadUrl == null) {
        webviewPreloadUrl = env.electron.getWebviewPreload();
        console.log("webviewPreloadUrl", webviewPreloadUrl);
    }
    if (webviewPreloadUrl == null) {
        return null;
    }
    return "file://" + webviewPreloadUrl;
}

export class WebViewModel implements ViewModel {
    viewType: string;
    blockId: string;
    tabModel: TabModel;
    noPadding?: Atom<boolean>;
    blockAtom: Atom<Block>;
    viewIcon: Atom<string | IconButtonDecl>;
    viewName: Atom<string>;
    viewText: Atom<HeaderElem[]>;
    headerTop: Atom<React.ReactNode>;
    hideViewName: Atom<boolean>;
    url: PrimitiveAtom<string>;
    homepageUrl: Atom<string>;
    faviconUrl: PrimitiveAtom<string | null>;
    urlInputFocused: PrimitiveAtom<boolean>;
    isLoading: PrimitiveAtom<boolean>;
    urlWrapperClassName: PrimitiveAtom<string>;
    refreshIcon: PrimitiveAtom<string>;
    webviewRef: React.RefObject<WebviewTag>;
    urlInputRef: React.RefObject<HTMLInputElement>;
    nodeModel: BlockNodeModel;
    endIconButtons?: Atom<IconButtonDecl[]>;
    mediaPlaying: PrimitiveAtom<boolean>;
    mediaMuted: PrimitiveAtom<boolean>;
    canGoBack: PrimitiveAtom<boolean>;
    canGoForward: PrimitiveAtom<boolean>;
    modifyExternalUrl?: (url: string) => string;
    domReady: PrimitiveAtom<boolean>;
    hideNav: Atom<boolean>;
    searchAtoms?: SearchAtoms;
    typeaheadOpen: PrimitiveAtom<boolean>;
    partitionOverride: PrimitiveAtom<string> | null;
    userAgentType: Atom<string>;
    env: WebViewEnv;
    grabController: BrowserGrabController;
    grabIntentAtom: PrimitiveAtom<BrowserGrabIntent>;
    annotationCountAtom: Atom<number>;
    browserToolErrorAtom: PrimitiveAtom<string>;

    constructor({ blockId, nodeModel, tabModel, waveEnv }: ViewModelInitType) {
        this.nodeModel = nodeModel;
        this.tabModel = tabModel;
        this.viewType = "web";
        this.blockId = blockId;
        this.grabController = new BrowserGrabController(blockId, () => this.webviewRef.current);
        this.grabIntentAtom = this.grabController.intent;
        this.browserToolErrorAtom = this.grabController.error;
        this.annotationCountAtom = atom((get) => {
            const url = get(this.url) ?? "";
            const pageKey = (value: string) => {
                try {
                    const parsed = new URL(value);
                    parsed.search = "";
                    parsed.hash = "";
                    return parsed.toString();
                } catch {
                    return value;
                }
            };
            return get(getBrowserAnnotationsAtom(blockId)).filter((row) => pageKey(row.url) === pageKey(url)).length;
        });
        this.env = waveEnv;
        this.noPadding = atom(true);
        this.blockAtom = this.env.wos.getWaveObjectAtom<Block>(`block:${blockId}`);
        this.url = atom();
        this.faviconUrl = atom(null) as PrimitiveAtom<string | null>;
        const defaultUrlAtom = this.env.getSettingsKeyAtom("web:defaulturl");
        this.homepageUrl = atom((get) => {
            const defaultUrl = get(defaultUrlAtom);
            const pinnedUrl = get(this.blockAtom)?.meta?.pinnedurl;
            return pinnedUrl ?? defaultUrl;
        });
        this.urlWrapperClassName = atom("");
        this.urlInputFocused = atom(false);
        this.isLoading = atom(false);
        this.refreshIcon = atom("rotate-right");
        this.viewIcon = atom("globe");
        this.viewName = atom("Web");
        this.hideViewName = atom(true);
        this.urlInputRef = createRef<HTMLInputElement>();
        this.webviewRef = createRef<WebviewTag>();
        this.domReady = atom(false);
        this.hideNav = this.env.getBlockMetaKeyAtom(blockId, "web:hidenav");
        this.typeaheadOpen = atom(false);
        this.partitionOverride = null;
        this.userAgentType = this.env.getBlockMetaKeyAtom(blockId, "web:useragenttype");

        this.mediaPlaying = atom(false);
        this.mediaMuted = atom(false);
        this.canGoBack = atom(false);
        this.canGoForward = atom(false);

        this.viewText = atom((get) => {
            const homepageUrl = get(this.homepageUrl);
            const metaUrl = get(this.blockAtom)?.meta?.url;
            const currUrl = get(this.url);
            const urlWrapperClassName = get(this.urlWrapperClassName);
            const refreshIcon = get(this.refreshIcon);
            const mediaPlaying = get(this.mediaPlaying);
            const mediaMuted = get(this.mediaMuted);
            const canGoBack = get(this.canGoBack);
            const canGoForward = get(this.canGoForward);
            const url = currUrl ?? metaUrl ?? homepageUrl ?? "";
            const rtn: HeaderElem[] = [];
            if (get(this.hideNav)) {
                return rtn;
            }

            rtn.push({
                elemtype: "iconbutton",
                icon: "chevron-left",
                click: this.handleBack.bind(this),
                disabled: !canGoBack,
            });
            rtn.push({
                elemtype: "iconbutton",
                icon: "chevron-right",
                click: this.handleForward.bind(this),
                disabled: !canGoForward,
            });
            rtn.push({
                elemtype: "iconbutton",
                icon: "house",
                click: this.handleHome.bind(this),
                disabled: this.shouldDisableHomeButton(),
            });
            rtn.push({
                elemtype: "iconbutton",
                icon: refreshIcon,
                click: this.handleRefresh.bind(this),
            });
            const divChildren: HeaderElem[] = [];
            divChildren.push({
                elemtype: "iconbutton",
                icon: "shield-halved",
                title: "Site information",
                noAction: true,
            });
            divChildren.push({
                elemtype: "input",
                value: url,
                ref: this.urlInputRef,
                className: "url-input",
                onChange: this.handleUrlChange.bind(this),
                onKeyDown: this.handleKeyDown.bind(this),
                onFocus: this.handleFocus.bind(this),
                onBlur: this.handleBlur.bind(this),
            });
            if (mediaPlaying) {
                divChildren.push({
                    elemtype: "iconbutton",
                    icon: mediaMuted ? "volume-slash" : "volume",
                    click: this.handleMuteChange.bind(this),
                });
            }
            rtn.push({
                elemtype: "div",
                className: clsx("block-frame-div-url", urlWrapperClassName),
                onMouseOver: this.handleUrlWrapperMouseOver.bind(this),
                onMouseOut: this.handleUrlWrapperMouseOut.bind(this),
                children: divChildren,
            });
            return rtn;
        });

        this.headerTop = atom((get) => {
            if (get(this.hideNav)) {
                return null;
            }
            return <BrowserPageToolbar model={this} />;
        });

        this.endIconButtons = atom((get) => {
            if (get(this.hideNav)) {
                return null;
            }
            const url = get(this.url);
            const userAgentType = get(this.userAgentType);
            const buttons: IconButtonDecl[] = [];

            // Add mobile indicator icon if using mobile user agent
            if (userAgentType === "mobile:iphone" || userAgentType === "mobile:android") {
                const mobileIcon = userAgentType === "mobile:iphone" ? "mobile-screen" : "mobile-screen-button";
                const mobileTitle =
                    userAgentType === "mobile:iphone" ? "Mobile User Agent: iPhone" : "Mobile User Agent: Android";
                buttons.push({
                    elemtype: "iconbutton",
                    icon: mobileIcon,
                    title: mobileTitle,
                    noAction: true,
                });
            }

            buttons.push({
                elemtype: "iconbutton",
                icon: "arrow-up-right-from-square",
                title: "Open in External Browser",
                click: () => {
                    console.log("open external", url);
                    if (url != null && url != "") {
                        const externalUrl = this.modifyExternalUrl?.(url) ?? url;
                        return this.env.electron.openExternal(externalUrl);
                    }
                },
            });

            return buttons;
        });
    }

    get viewComponent(): ViewComponent {
        return WebView;
    }

    /**
     * Whether the back button in the header should be disabled.
     * @returns True if the WebView cannot go back or if the WebView call fails. False otherwise.
     */
    shouldDisableBackButton() {
        try {
            return !this.webviewRef.current?.canGoBack();
        } catch (_) {}
        return true;
    }

    /**
     * Whether the forward button in the header should be disabled.
     * @returns True if the WebView cannot go forward or if the WebView call fails. False otherwise.
     */
    shouldDisableForwardButton() {
        try {
            return !this.webviewRef.current?.canGoForward();
        } catch (_) {}
        return true;
    }

    /**
     * Whether the home button in the header should be disabled.
     * @returns True if the current url is the pinned url or the pinned url is not set. False otherwise.
     */
    shouldDisableHomeButton() {
        try {
            const homepageUrl = globalStore.get(this.homepageUrl);
            return !homepageUrl || this.getUrl() === homepageUrl;
        } catch (_) {}
        return true;
    }

    handleHome(e?: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.loadUrl(globalStore.get(this.homepageUrl), "home");
    }

    setMediaPlaying(isPlaying: boolean) {
        globalStore.set(this.mediaPlaying, isPlaying);
    }

    handleMuteChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        try {
            const newMutedVal = !this.webviewRef.current?.isAudioMuted();
            globalStore.set(this.mediaMuted, newMutedVal);
            this.webviewRef.current?.setAudioMuted(newMutedVal);
        } catch (e) {
            console.error("Failed to change mute value", e);
        }
    }

    setTypeaheadOpen(open: boolean) {
        globalStore.set(this.typeaheadOpen, open);
    }

    async fetchBookmarkSuggestions(
        query: string,
        reqContext: SuggestionRequestContext
    ): Promise<FetchSuggestionsResponse> {
        const result = await this.env.rpc.FetchSuggestionsCommand(TabRpcClient, {
            suggestiontype: "bookmark",
            query,
            widgetid: reqContext.widgetid,
            reqnum: reqContext.reqnum,
        });
        return result;
    }

    handleUrlWrapperMouseOver(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        const urlInputFocused = globalStore.get(this.urlInputFocused);
        if (e.type === "mouseover" && !urlInputFocused) {
            globalStore.set(this.urlWrapperClassName, "hovered");
        }
    }

    handleUrlWrapperMouseOut(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        const urlInputFocused = globalStore.get(this.urlInputFocused);
        if (e.type === "mouseout" && !urlInputFocused) {
            globalStore.set(this.urlWrapperClassName, "");
        }
    }

    handleBack(e?: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.webviewRef.current?.goBack();
    }

    setGrabIntent(intent: BrowserGrabIntent): void {
        void this.grabController.setIntent(intent);
    }

    handleForward(e?: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.webviewRef.current?.goForward();
    }

    updateNavState() {
        try {
            globalStore.set(this.canGoBack, this.webviewRef.current?.canGoBack() ?? false);
            globalStore.set(this.canGoForward, this.webviewRef.current?.canGoForward() ?? false);
        } catch (_) {}
    }

    handleRefresh(e?: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        e?.preventDefault();
        e?.stopPropagation();
        try {
            if (this.webviewRef.current) {
                if (globalStore.get(this.isLoading)) {
                    this.webviewRef.current.stop();
                } else {
                    this.webviewRef.current.reload();
                }
            }
        } catch (e) {
            console.warn("handleRefresh catch", e);
        }
    }

    hardReload() {
        try {
            this.webviewRef.current?.reloadIgnoringCache();
        } catch (error) {
            console.warn("Failed to hard reload browser", error);
        }
    }

    openFind() {
        if (this.searchAtoms == null) return;
        globalStore.set(this.searchAtoms.isOpen, true);
        const focusCount = Number(globalStore.get(this.searchAtoms.focusInput) ?? 0);
        globalStore.set(this.searchAtoms.focusInput, focusCount + 1);
    }

    toggleDevTools() {
        const webview = this.webviewRef.current;
        if (!webview) return;
        if (webview.isDevToolsOpened()) webview.closeDevTools();
        else webview.openDevTools();
    }

    setUserAgentType(profile: BrowserDeviceProfile) {
        fireAndForget(() =>
            this.env.rpc.SetMetaCommand(TabRpcClient, {
                oref: makeORef("block", this.blockId),
                meta: { "web:useragenttype": profile } as unknown as MetaType,
            })
        );
    }

    handleUrlChange(event: React.ChangeEvent<HTMLInputElement>) {
        globalStore.set(this.url, event.target.value);
    }

    handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        const waveEvent = adaptFromReactOrNativeKeyEvent(event);
        if (checkKeyPressed(waveEvent, "Enter")) {
            const url = globalStore.get(this.url);
            this.loadUrl(url, "enter");
            this.urlInputRef.current?.blur();
            return;
        }
        if (checkKeyPressed(waveEvent, "Escape")) {
            // Discard an uncommitted edit so the omnibox shows the page URL again, like every mainstream browser.
            globalStore.set(this.url, this.webviewRef.current?.getURL() ?? "");
            this.webviewRef.current?.focus();
        }
    }

    handleFocus(event: React.FocusEvent<HTMLInputElement>) {
        this.urlInputRef.current = event.currentTarget;
        globalStore.set(this.urlWrapperClassName, "focused");
        globalStore.set(this.urlInputFocused, true);
        event.currentTarget.select();
    }

    handleBlur(_event: React.FocusEvent<HTMLInputElement>) {
        globalStore.set(this.urlWrapperClassName, "");
        globalStore.set(this.urlInputFocused, false);
    }

    /**
     * Update the URL in the state when a navigation event has occurred.
     * @param url The URL that has been navigated to.
     */
    handleNavigate(url: string) {
        fireAndForget(() =>
            this.env.rpc.SetMetaCommand(TabRpcClient, {
                oref: makeORef("block", this.blockId),
                meta: { url } as unknown as MetaType,
            })
        );
        if (!globalStore.get(this.urlInputFocused)) globalStore.set(this.url, url);
        if (this.searchAtoms) {
            globalStore.set(this.searchAtoms.isOpen, false);
        }
    }

    setBrowserTitle(title: string) {
        fireAndForget(() =>
            this.env.rpc.SetMetaCommand(TabRpcClient, {
                oref: makeORef("block", this.blockId),
                meta: { "web:title": title } as unknown as MetaType,
            })
        );
    }

    ensureUrlScheme(url: string, searchTemplate: string) {
        if (url == null) {
            url = "";
        }

        if (/^(http|https|file):/.test(url)) {
            // If the URL starts with http: or https:, return it as is
            return url;
        }

        // Check if the URL looks like a local URL
        const isLocal = /^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/.test(url.split("/")[0]);

        if (isLocal) {
            // If it is a local URL, ensure it has http:// scheme
            return `http://${url}`;
        }

        // Check if the URL looks like a domain
        const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
        const isDomain = domainRegex.test(url.split("/")[0]);

        if (isDomain) {
            // If it looks like a domain, ensure it has https:// scheme
            return `https://${url}`;
        }

        // Otherwise, treat it as a search query
        if (searchTemplate == null) {
            return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        return searchTemplate.replace("{query}", encodeURIComponent(url));
    }

    /**
     * Load a new URL in the webview.
     * @param newUrl The new URL to load in the webview.
     */
    loadUrl(newUrl: string, reason: string) {
        const defaultSearchAtom = this.env.getSettingsKeyAtom("web:defaultsearch");
        const searchTemplate = globalStore.get(defaultSearchAtom);
        const nextUrl = this.ensureUrlScheme(newUrl, searchTemplate);
        console.log("webview loadUrl", reason, nextUrl, "cur=", this.webviewRef.current?.getURL());
        if (!this.webviewRef.current) {
            return;
        }
        if (this.webviewRef.current.getURL() != nextUrl) {
            fireAndForget(() => this.webviewRef.current.loadURL(nextUrl));
        }
        if (newUrl != nextUrl) {
            globalStore.set(this.url, nextUrl);
        }
    }

    /**
     * Load a new URL in the webview and return a promise.
     * @param newUrl The new URL to load in the webview.
     * @param reason The reason for loading the URL.
     * @returns Promise that resolves when the URL is loaded.
     */
    loadUrlPromise(newUrl: string, reason: string): Promise<void> {
        const defaultSearchAtom = this.env.getSettingsKeyAtom("web:defaultsearch");
        const searchTemplate = globalStore.get(defaultSearchAtom);
        const nextUrl = this.ensureUrlScheme(newUrl, searchTemplate);
        console.log("webview loadUrlPromise", reason, nextUrl, "cur=", this.webviewRef.current?.getURL());

        if (!this.webviewRef.current) {
            return Promise.reject(new Error("WebView ref not available"));
        }

        if (newUrl != nextUrl) {
            globalStore.set(this.url, nextUrl);
        }

        if (this.webviewRef.current.getURL() != nextUrl) {
            return this.webviewRef.current.loadURL(nextUrl);
        }

        return Promise.resolve();
    }

    /**
     * Get the current URL from the state.
     * @returns The URL from the state.
     */
    getUrl() {
        return globalStore.get(this.url);
    }

    setRefreshIcon(refreshIcon: string) {
        globalStore.set(this.refreshIcon, refreshIcon);
    }

    setIsLoading(isLoading: boolean) {
        globalStore.set(this.isLoading, isLoading);
    }

    async setHomepageUrl(url: string, scope: "global" | "block") {
        if (url != null && url != "") {
            switch (scope) {
                case "block":
                    await this.env.rpc.SetMetaCommand(TabRpcClient, {
                        oref: makeORef("block", this.blockId),
                        meta: { pinnedurl: url },
                    });
                    break;
                case "global":
                    await this.env.rpc.SetMetaCommand(TabRpcClient, {
                        oref: makeORef("block", this.blockId),
                        meta: { pinnedurl: null },
                    });
                    await this.env.rpc.SetConfigCommand(TabRpcClient, { "web:defaulturl": url });
                    break;
            }
        }
    }

    giveFocus(): boolean {
        console.log("webview giveFocus");
        if (globalStore.get(this.urlInputFocused)) return true;
        if (this.searchAtoms && globalStore.get(this.searchAtoms.isOpen)) {
            console.log("search is open, not giving focus");
            return true;
        }
        const ctrlShiftState = globalStore.get(getSimpleControlShiftAtom());
        if (ctrlShiftState) {
            // this is really weird, we don't get keyup events from webview
            const unsubFn = globalStore.sub(getSimpleControlShiftAtom(), () => {
                const state = globalStore.get(getSimpleControlShiftAtom());
                if (!state) {
                    unsubFn();
                    const isStillFocused = globalStore.get(this.nodeModel.isFocused);
                    if (isStillFocused) {
                        if (!globalStore.get(this.urlInputFocused)) this.webviewRef.current?.focus();
                    }
                }
            });
            return false;
        }
        this.webviewRef.current?.focus();
        return true;
    }

    copyUrlToClipboard() {
        const url = this.getUrl();
        if (url != null && url != "") {
            fireAndForget(() => navigator.clipboard.writeText(url));
        }
    }

    clearHistory() {
        try {
            window.localStorage.removeItem(`kronterm:browser-history:v1:${this.blockId}`);
            this.webviewRef.current?.clearHistory();
        } catch (e) {
            console.error("Failed to clear history", e);
        }
    }

    async clearCookiesAndStorage() {
        try {
            const webContentsId = this.webviewRef.current?.getWebContentsId();
            if (webContentsId) {
                await this.env.electron.clearWebviewStorage(webContentsId);
            }
        } catch (e) {
            console.error("Failed to clear cookies and storage", e);
        }
    }

    keyDownHandler(e: WaveKeyboardEvent): boolean {
        if (checkKeyPressed(e, "Cmd:f")) {
            const searchAtoms = this.searchAtoms;
            if (searchAtoms != null) {
                const nextOpen = !globalStore.get(searchAtoms.isOpen);
                globalStore.set(searchAtoms.isOpen, nextOpen);
                if (!nextOpen) {
                    this.webviewRef.current?.stopFindInPage("clearSelection");
                } else {
                    const focusCount = Number(globalStore.get(searchAtoms.focusInput) ?? 0);
                    globalStore.set(searchAtoms.focusInput, focusCount + 1);
                }
                return true;
            }
        }
        if (checkKeyPressed(e, "Cmd:l")) {
            this.urlInputRef?.current?.focus();
            this.urlInputRef?.current?.select();
            return true;
        }
        if (checkKeyPressed(e, "Cmd:r")) {
            this.webviewRef.current?.reload();
            return true;
        }
        if (checkKeyPressed(e, "Cmd:ArrowLeft")) {
            this.handleBack(null);
            return true;
        }
        if (checkKeyPressed(e, "Cmd:ArrowRight")) {
            this.handleForward(null);
            return true;
        }
        if (checkKeyPressed(e, "Cmd:o")) {
            const curVal = globalStore.get(this.typeaheadOpen);
            globalStore.set(this.typeaheadOpen, !curVal);
            return true;
        }
        return false;
    }

    setZoomFactor(factor: number | null) {
        // null is ok (will reset to default)
        if (factor != null && factor < 0.1) {
            factor = 0.1;
        }
        if (factor != null && factor > 5) {
            factor = 5;
        }
        const domReady = globalStore.get(this.domReady);
        if (!domReady) {
            return;
        }
        this.webviewRef.current?.setZoomFactor(factor || 1);
        this.env.rpc.SetMetaCommand(TabRpcClient, {
            oref: makeORef("block", this.blockId),
            meta: { "web:zoom": factor }, // allow null so we can remove the zoom factor here
        });
    }

    getSettingsMenuItems(): ContextMenuItem[] {
        const zoomSubMenu: ContextMenuItem[] = [];
        let curZoom = 1;
        if (globalStore.get(this.domReady)) {
            curZoom = this.webviewRef.current?.getZoomFactor() || 1;
        }
        const makeZoomFactorMenuItem = (label: string, factor: number): ContextMenuItem => {
            return {
                label: label,
                type: "checkbox",
                click: () => {
                    this.setZoomFactor(factor);
                },
                checked: curZoom == factor,
            };
        };
        zoomSubMenu.push({
            label: "Reset",
            click: () => {
                this.setZoomFactor(null);
            },
        });
        zoomSubMenu.push(makeZoomFactorMenuItem("25%", 0.25));
        zoomSubMenu.push(makeZoomFactorMenuItem("50%", 0.5));
        zoomSubMenu.push(makeZoomFactorMenuItem("70%", 0.7));
        zoomSubMenu.push(makeZoomFactorMenuItem("80%", 0.8));
        zoomSubMenu.push(makeZoomFactorMenuItem("90%", 0.9));
        zoomSubMenu.push(makeZoomFactorMenuItem("100%", 1));
        zoomSubMenu.push(makeZoomFactorMenuItem("110%", 1.1));
        zoomSubMenu.push(makeZoomFactorMenuItem("120%", 1.2));
        zoomSubMenu.push(makeZoomFactorMenuItem("130%", 1.3));
        zoomSubMenu.push(makeZoomFactorMenuItem("150%", 1.5));
        zoomSubMenu.push(makeZoomFactorMenuItem("175%", 1.75));
        zoomSubMenu.push(makeZoomFactorMenuItem("200%", 2));

        // User Agent Type submenu
        const curUserAgentType = globalStore.get(this.userAgentType) || "default";
        const userAgentSubMenu: ContextMenuItem[] = [
            {
                label: "Default",
                type: "checkbox",
                click: () => {
                    fireAndForget(() => {
                        return this.env.rpc.SetMetaCommand(TabRpcClient, {
                            oref: makeORef("block", this.blockId),
                            meta: { "web:useragenttype": null },
                        });
                    });
                },
                checked: curUserAgentType === "default" || curUserAgentType === "",
            },
            {
                label: "Mobile: iPhone",
                type: "checkbox",
                click: () => {
                    fireAndForget(() => {
                        return this.env.rpc.SetMetaCommand(TabRpcClient, {
                            oref: makeORef("block", this.blockId),
                            meta: { "web:useragenttype": "mobile:iphone" },
                        });
                    });
                },
                checked: curUserAgentType === "mobile:iphone",
            },
            {
                label: "Mobile: Android",
                type: "checkbox",
                click: () => {
                    fireAndForget(() => {
                        return this.env.rpc.SetMetaCommand(TabRpcClient, {
                            oref: makeORef("block", this.blockId),
                            meta: { "web:useragenttype": "mobile:android" },
                        });
                    });
                },
                checked: curUserAgentType === "mobile:android",
            },
        ];

        const isNavHidden = globalStore.get(this.hideNav);
        return [
            {
                label: "Copy URL to Clipboard",
                click: () => this.copyUrlToClipboard(),
            },
            {
                label: "Set Block Homepage",
                click: () => fireAndForget(() => this.setHomepageUrl(this.getUrl(), "block")),
            },
            {
                label: "Set Default Homepage",
                click: () => fireAndForget(() => this.setHomepageUrl(this.getUrl(), "global")),
            },
            {
                type: "separator",
            },
            {
                label: "User Agent Type",
                submenu: userAgentSubMenu,
            },
            {
                type: "separator",
            },
            {
                label: isNavHidden ? "Un-Hide Navigation" : "Hide Navigation",
                click: () =>
                    fireAndForget(() => {
                        return this.env.rpc.SetMetaCommand(TabRpcClient, {
                            oref: makeORef("block", this.blockId),
                            meta: { "web:hidenav": !isNavHidden },
                        });
                    }),
            },
            {
                label: "Set Zoom Factor",
                submenu: zoomSubMenu,
            },
            {
                label: this.webviewRef.current?.isDevToolsOpened() ? "Close DevTools" : "Open DevTools",
                click: () => {
                    if (this.webviewRef.current) {
                        if (this.webviewRef.current.isDevToolsOpened()) {
                            this.webviewRef.current.closeDevTools();
                        } else {
                            this.webviewRef.current.openDevTools();
                        }
                    }
                },
            },
            {
                type: "separator",
            },
            {
                label: "Clear History",
                click: () => this.clearHistory(),
            },
            {
                label: "Clear Cookies and Storage (All Web Widgets)",
                click: () => fireAndForget(() => this.clearCookiesAndStorage()),
            },
        ];
    }
}

const BookmarkTypeahead = memo(
    ({ model, blockRef }: { model: WebViewModel; blockRef: React.RefObject<HTMLDivElement> }) => {
        const env = useWaveEnv<WebViewEnv>();
        const openBookmarksJson = () => {
            fireAndForget(async () => {
                const path = `${env.electron.getConfigDir()}/presets/bookmarks.json`;
                const blockDef: BlockDef = {
                    meta: {
                        view: "preview",
                        file: path,
                    },
                };
                await env.createBlock(blockDef, false, true);
                model.setTypeaheadOpen(false);
            });
        };
        return (
            <BlockHeaderSuggestionControl
                blockRef={blockRef}
                openAtom={model.typeaheadOpen}
                onClose={() => model.setTypeaheadOpen(false)}
                onSelect={(suggestion) => {
                    if (suggestion == null || suggestion.type != "url") {
                        return true;
                    }
                    model.loadUrl(suggestion["url:url"], "bookmark-typeahead");
                    return true;
                }}
                fetchSuggestions={model.fetchBookmarkSuggestions}
                placeholderText="Open Bookmark..."
            >
                <SuggestionControlNoData>
                    <div className="text-center">
                        <p className="text-lg font-bold text-gray-100">No Bookmarks Configured</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Edit your <code className="font-mono">bookmarks.json</code> file to configure bookmarks.
                        </p>
                        <button
                            onClick={openBookmarksJson}
                            className="mt-3 px-4 py-2 text-sm font-medium text-black bg-accent hover:bg-accenthover rounded-lg cursor-pointer"
                        >
                            Open bookmarks.json
                        </button>
                    </div>
                </SuggestionControlNoData>

                <SuggestionControlNoResults>
                    <div className="text-center">
                        <p className="text-sm text-gray-400">No matching bookmarks</p>
                        <button
                            onClick={openBookmarksJson}
                            className="mt-3 px-4 py-2 text-sm font-medium text-black bg-accent hover:bg-accenthover rounded-lg cursor-pointer"
                        >
                            Edit bookmarks.json
                        </button>
                    </div>
                </SuggestionControlNoResults>
            </BlockHeaderSuggestionControl>
        );
    }
);

interface WebViewProps {
    blockId: string;
    model: WebViewModel;
    onFailLoad?: (url: string) => void;
    blockRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
    initialSrc?: string;
}

function getWebPreviewDisplayUrl(url?: string | null): string {
    return url?.trim() || "about:blank";
}

function isWebviewReadyForElectronCall(
    webview: Pick<WebviewTag, "isConnected"> | null | undefined,
    currentWebview: Pick<WebviewTag, "isConnected"> | null | undefined,
    domReady: boolean
): boolean {
    return webview != null && webview === currentWebview && webview.isConnected && domReady;
}

function WebViewPreviewFallback({ url }: { url?: string | null }) {
    const displayUrl = getWebPreviewDisplayUrl(url);

    return (
        <div className="flex h-full w-full items-center justify-center bg-panel">
            <div className="mx-6 flex max-w-[720px] flex-col gap-3 rounded-lg border border-dashed border-border bg-background px-6 py-5 shadow-sm">
                <div className="text-xs font-mono text-muted">preview mock · electron webview unavailable</div>
                <div className="text-sm text-foreground">web widget placeholder</div>
                <div className="rounded-md border border-border bg-panel px-3 py-2 font-mono text-xs text-foreground break-all">
                    {displayUrl}
                </div>
            </div>
        </div>
    );
}

function WebViewFailureOverlay({ model, errorText }: { model: WebViewModel; errorText: string }) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) {
        return null;
    }
    const url = model.webviewRef.current?.getURL();
    return (
        <div className="webview-error-inline" role="alert">
            <p className="webview-error-inline-text">{errorText}</p>
            <div className="webview-error-inline-actions">
                <button
                    type="button"
                    className="webview-error-reload"
                    onClick={() => {
                        setDismissed(true);
                        model.handleRefresh(null);
                    }}
                >
                    <i className="fa-solid fa-rotate-right" aria-hidden="true" /> Reload
                </button>
                <button
                    type="button"
                    className="webview-error-clear"
                    onClick={() =>
                        fireAndForget(() => {
                            const webContentsId = model.webviewRef.current?.getWebContentsId();
                            if (webContentsId != null) {
                                return model.env.electron.clearWebviewStorage(webContentsId).then(() => {
                                    model.webviewRef.current?.reload();
                                });
                            }
                        })
                    }
                    title="Clear cookies and storage for this page, then reload"
                >
                    <i className="fa-solid fa-broom" aria-hidden="true" /> Clear page data
                </button>
                {url ? (
                    <button
                        type="button"
                        className="webview-error-external"
                        onClick={() => void model.env.electron.openExternal(url)}
                    >
                        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Open externally
                    </button>
                ) : null}
                <button
                    type="button"
                    className="webview-error-dismiss"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss error"
                >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

const BrowserAnnotationTrayLazy = BrowserAnnotationTray;

const WebView = memo(({ model, onFailLoad, blockRef, initialSrc }: WebViewProps) => {
    const env = useWaveEnv<WebViewEnv>();
    const blockData = useAtomValue(model.blockAtom);
    const defaultUrl = useAtomValue(model.homepageUrl);
    const defaultSearchAtom = env.getSettingsKeyAtom("web:defaultsearch");
    const defaultSearch = useAtomValue(defaultSearchAtom);
    let metaUrl = blockData?.meta?.url || defaultUrl || "";
    if (metaUrl) {
        metaUrl = model.ensureUrlScheme(metaUrl, defaultSearch);
    }
    const metaUrlRef = useRef(metaUrl);
    const zoomFactor = useAtomValue(env.getBlockMetaKeyAtom(model.blockId, "web:zoom")) || 1;
    const partitionOverride = useAtomValueSafe(model.partitionOverride);
    const metaPartition = useAtomValue(env.getBlockMetaKeyAtom(model.blockId, "web:partition"));
    const webPartition = partitionOverride || metaPartition || undefined;
    const userAgentType = useAtomValue(model.userAgentType) || "default";

    // Determine user agent string based on type
    let userAgent: string | undefined = undefined;
    if (userAgentType === "mobile:iphone") {
        userAgent = USER_AGENT_IPHONE;
    } else if (userAgentType === "mobile:android") {
        userAgent = USER_AGENT_ANDROID;
    }

    // Search
    const searchProps = useSearch({ anchorRef: model.webviewRef, viewModel: model });
    const searchVal = useAtomValue<string>(searchProps.searchValue);
    const setSearchIndex = useSetAtom(searchProps.resultsIndex);
    const setNumSearchResults = useSetAtom(searchProps.resultsCount);
    searchProps.onSearch = useCallback((search: string) => {
        if (!globalStore.get(model.domReady)) {
            return;
        }
        try {
            if (search) {
                model.webviewRef.current?.findInPage(search, { findNext: true });
            } else {
                model.webviewRef.current?.stopFindInPage("clearSelection");
            }
        } catch (e) {
            console.error("Failed to search", e);
        }
    }, []);
    searchProps.onNext = useCallback(() => {
        if (!globalStore.get(model.domReady)) {
            return;
        }
        try {
            console.log("search next", searchVal);
            model.webviewRef.current?.findInPage(searchVal, { findNext: false, forward: true });
        } catch (e) {
            console.error("Failed to search next", e);
        }
    }, [searchVal]);
    searchProps.onPrev = useCallback(() => {
        if (!globalStore.get(model.domReady)) {
            return;
        }
        try {
            console.log("search prev", searchVal);
            model.webviewRef.current?.findInPage(searchVal, { findNext: false, forward: false });
        } catch (e) {
            console.error("Failed to search prev", e);
        }
    }, [searchVal]);
    const onFoundInPage = useCallback((event: any) => {
        const result = event.result;
        console.log("found in page", result);
        if (!result) {
            return;
        }
        setNumSearchResults(result.matches);
        setSearchIndex(result.activeMatchOrdinal - 1);
    }, []);
    // End Search

    // The initial value of the block metadata URL when the component first renders. Used to set the starting src value for the webview.
    const [metaUrlInitial] = useState(initialSrc || metaUrl);
    const prevUserAgentTypeRef = useRef(userAgentType);

    const [webContentsId, setWebContentsId] = useState(null);
    const domReady = useAtomValue(model.domReady);

    const [errorText, setErrorText] = useState("");

    function setBgColor() {
        const webview = model.webviewRef.current;
        if (!webview) {
            return;
        }
        setTimeout(() => {
            webview
                .executeJavaScript(
                    `!!document.querySelector('meta[name="color-scheme"]') && document.querySelector('meta[name="color-scheme"]').content?.includes('dark') || false`
                )
                .then((hasDarkMode) => {
                    if (hasDarkMode) {
                        webview.style.backgroundColor = "black"; // Dark mode background
                    } else {
                        webview.style.backgroundColor = "white"; // Light mode background
                    }
                })
                .catch((e) => {
                    webview.style.backgroundColor = "black"; // Dark mode background
                    console.log("Error getting color scheme, defaulting to dark", e);
                });
        }, 100);
    }

    useEffect(() => {
        return () => {
            globalStore.set(model.domReady, false);
        };
    }, []);

    useEffect(() => {
        if (model.webviewRef.current == null || !model.webviewRef.current.isConnected || !domReady) {
            return;
        }
        try {
            const wcId = model.webviewRef.current.getWebContentsId?.();
            if (wcId) {
                setWebContentsId(wcId);
                if (model.webviewRef.current.getZoomFactor() != zoomFactor) {
                    model.webviewRef.current.setZoomFactor(zoomFactor);
                }
            }
        } catch (e) {
            console.error("Failed to get webcontentsid / setzoomlevel (webview)", e);
        }
    }, [model.webviewRef.current, domReady, zoomFactor]);

    // Load a new URL if the block metadata is updated.
    useEffect(() => {
        if (initialSrc) {
            // Skip URL loading if initialSrc is provided (it's already loaded via src attribute)
            return;
        }
        if (metaUrlRef.current != metaUrl) {
            metaUrlRef.current = metaUrl;
            model.loadUrl(metaUrl, "meta");
        }
    }, [metaUrl, initialSrc]);

    // Reload webview when user agent type changes
    useEffect(() => {
        if (prevUserAgentTypeRef.current !== userAgentType && domReady && model.webviewRef.current) {
            let newUserAgent: string | undefined = undefined;
            if (userAgentType === "mobile:iphone") {
                newUserAgent = USER_AGENT_IPHONE;
            } else if (userAgentType === "mobile:android") {
                newUserAgent = USER_AGENT_ANDROID;
            }

            if (newUserAgent) {
                model.webviewRef.current.setUserAgent(newUserAgent);
            } else {
                model.webviewRef.current.setUserAgent("");
            }
            model.webviewRef.current.reload();
        }
        prevUserAgentTypeRef.current = userAgentType;
    }, [userAgentType, domReady]);

    useEffect(() => {
        const webview = model.webviewRef.current;
        if (!webview) {
            return;
        }
        const historyKey = `kronterm:browser-history:v1:${model.blockId}`;
        let historyReady = false;
        let restored = false;
        let disposed = false;
        let historyRevision = 0;
        const rememberHistory = async () => {
            if (!historyReady || disposed || !getApi().browserNavigationHistory) return;
            const revision = ++historyRevision;
            try {
                const snapshot = await getApi().browserNavigationHistory(webview.getWebContentsId());
                if (snapshot && !disposed && revision === historyRevision) {
                    window.localStorage.setItem(historyKey, JSON.stringify(snapshot));
                }
            } catch (error) {
                console.warn("Browser history could not be saved", error);
            }
        };
        const restoreHistory = async () => {
            if (restored || !getApi().browserNavigationHistory) return;
            restored = true;
            try {
                const snapshot = browserNavigationSnapshot(
                    JSON.parse(window.localStorage.getItem(historyKey) ?? "null")
                );
                if (snapshot && snapshot.entries[snapshot.index].url === webview.getURL()) {
                    await getApi().browserNavigationHistory(webview.getWebContentsId(), snapshot);
                }
            } catch (error) {
                console.warn("Browser history could not be restored", error);
            } finally {
                historyReady = true;
            }
            await rememberHistory();
        };
        const navigateListener = (e: any) => {
            setErrorText("");
            globalStore.set(model.faviconUrl, null);
            if (e.isMainFrame) {
                model.setGrabIntent(null);
                model.handleNavigate(e.url);
                publishCrossViewEvent("browser:navigate", model.blockId, makeBrowserPayload(model.blockId, e.url));
            }
            model.updateNavState();
            void rememberHistory();
        };
        const newWindowHandler = (e: any) => {
            e.preventDefault();
            const newUrl = e?.detail?.url || e?.url;
            if (!newUrl) {
                return;
            }
            model.loadUrl(newUrl, "new-window");
        };
        const titleUpdatedHandler = (e: any) => {
            if (typeof e?.title !== "string" || e.title.length === 0) {
                return;
            }
            model.setBrowserTitle(e.title);
            publishCrossViewEvent(
                "browser:title-change",
                model.blockId,
                makeBrowserPayload(model.blockId, undefined, e.title)
            );
        };
        const faviconUpdatedHandler = (e: any) => {
            const icons = e?.favicons;
            globalStore.set(model.faviconUrl, icons?.[0] ?? null);
        };
        const startLoadingHandler = () => {
            model.setRefreshIcon("xmark-large");
            model.setIsLoading(true);
            webview.style.backgroundColor = "transparent";
        };
        const stopLoadingHandler = () => {
            model.setRefreshIcon("rotate-right");
            model.setIsLoading(false);
            setErrorText("");
            setBgColor();
        };
        const failLoadHandler = (e: any) => {
            if (e.errorCode === -3) {
                console.warn("Suppressed ERR_ABORTED error", e);
            } else {
                const errorMessage = `Failed to load ${e.validatedURL}: ${e.errorDescription}`;
                console.error(errorMessage);
                setErrorText(errorMessage);
                if (onFailLoad) {
                    const curUrl = model.webviewRef.current.getURL();
                    onFailLoad(curUrl);
                }
            }
        };
        const webviewFocus = () => {
            env.electron.setWebviewFocus(webview.getWebContentsId());
            model.nodeModel.focusNode();
        };
        const webviewBlur = () => {
            env.electron.setWebviewFocus(null);
        };
        const handleDomReady = () => {
            void restoreHistory().then(() => model.updateNavState());
            globalStore.set(model.domReady, true);
            setBgColor();
        };
        const handleMediaPlaying = () => {
            model.setMediaPlaying(true);
        };
        const handleMediaPaused = () => {
            model.setMediaPlaying(false);
        };

        webview.addEventListener("did-frame-navigate", navigateListener);
        webview.addEventListener("did-navigate-in-page", navigateListener);
        webview.addEventListener("did-navigate", navigateListener);
        webview.addEventListener("did-start-loading", startLoadingHandler);
        webview.addEventListener("did-stop-loading", stopLoadingHandler);
        webview.addEventListener("new-window", newWindowHandler);
        webview.addEventListener("page-title-updated", titleUpdatedHandler);
        webview.addEventListener("page-favicon-updated", faviconUpdatedHandler);
        webview.addEventListener("did-fail-load", failLoadHandler);
        webview.addEventListener("focus", webviewFocus);
        webview.addEventListener("blur", webviewBlur);
        webview.addEventListener("dom-ready", handleDomReady);
        webview.addEventListener("media-started-playing", handleMediaPlaying);
        webview.addEventListener("media-paused", handleMediaPaused);
        webview.addEventListener("found-in-page", onFoundInPage);

        // Clean up event listeners on component unmount
        return () => {
            disposed = true;
            model.setGrabIntent(null);
            webview.removeEventListener("did-frame-navigate", navigateListener);
            webview.removeEventListener("did-navigate", navigateListener);
            webview.removeEventListener("did-navigate-in-page", navigateListener);
            webview.removeEventListener("new-window", newWindowHandler);
            webview.removeEventListener("page-title-updated", titleUpdatedHandler);
            webview.removeEventListener("page-favicon-updated", faviconUpdatedHandler);
            webview.removeEventListener("did-fail-load", failLoadHandler);
            webview.removeEventListener("did-start-loading", startLoadingHandler);
            webview.removeEventListener("did-stop-loading", stopLoadingHandler);
            webview.removeEventListener("focus", webviewFocus);
            webview.removeEventListener("blur", webviewBlur);
            webview.removeEventListener("dom-ready", handleDomReady);
            webview.removeEventListener("media-started-playing", handleMediaPlaying);
            webview.removeEventListener("media-paused", handleMediaPaused);
            webview.removeEventListener("found-in-page", onFoundInPage);
        };
    }, [webPartition]);

    useEffect(() => {
        const webview = model.webviewRef.current;
        if (!webview) {
            return;
        }

        let previewCapturePending = false;
        let lastPreviewCapturedAt = 0;
        let previewDisposed = false;
        let previewCaptureTimer: number | null = null;

        const requestPreviewCapture = (detail: AgentWidgetActivity) => {
            if (
                document.hidden ||
                Date.now() - lastPreviewCapturedAt < 1000 ||
                detail.previewImageUrl ||
                previewCapturePending ||
                typeof webview.capturePage !== "function"
            ) {
                return;
            }
            previewCapturePending = true;
            previewCaptureTimer = window.setTimeout(() => {
                if (document.hidden || previewDisposed) {
                    previewCapturePending = false;
                    return;
                }
                lastPreviewCapturedAt = Date.now();
                void webview
                    .capturePage()
                    .then((image) => {
                        if (previewDisposed || document.hidden) return;
                        const previewImageUrl = image.toDataURL();
                        if (!previewImageUrl || previewImageUrl === "data:image/png;base64,") {
                            return;
                        }
                        const action =
                            detail.action === "typing"
                                ? "type"
                                : detail.action === "scroll"
                                  ? "scroll"
                                  : detail.action === "cursor"
                                    ? "click"
                                    : detail.action === "view"
                                      ? "inspect"
                                      : "open";
                        reportDesktopPetActivity(
                            { kind: "tool", detail: detail.detail, previewImageUrl },
                            model.blockId,
                            detail.point,
                            { surface: "browser", action }
                        );
                    })
                    .catch(() => {})
                    .finally(() => {
                        previewCapturePending = false;
                    });
            }, 90);
        };

        const handleWidgetActivity = (e: Event) => {
            const detail = (e as CustomEvent<AgentWidgetActivity>).detail;
            if (detail.blockId !== model.blockId) {
                return;
            }
            if (detail.point) {
                reportCursorToPet(detail.point, "browser");
            }
            requestPreviewCapture(detail);
        };

        window.addEventListener("agent-widget-activity", handleWidgetActivity);

        return () => {
            previewDisposed = true;
            if (previewCaptureTimer != null) {
                window.clearTimeout(previewCaptureTimer);
            }
            window.removeEventListener("agent-widget-activity", handleWidgetActivity);
        };
    }, [model.blockId, webPartition]);

    const { waterflowActive, markers } = useAgentOverlays("browser", model.blockId);
    const stageRef = useRef<HTMLDivElement>(null);

    return (
        <Fragment>
            <div className="webview-shell">
                <div className="webview-stage" ref={stageRef} data-viewport={userAgentType}>
                    <MockBoundary fallback={<WebViewPreviewFallback url={metaUrl} />}>
                        <webview
                            key={webPartition ?? "default"}
                            id="webview"
                            className="webview"
                            ref={model.webviewRef}
                            src={metaUrlInitial}
                            data-blockid={model.blockId}
                            data-webcontentsid={webContentsId} // needed for emain
                            preload={getWebviewPreloadUrl(env)}
                            // @ts-expect-error This is a discrepancy between the React typing and the Chromium impl for webviewTag. Chrome webviewTag expects a string, while React expects a boolean.
                            allowpopups="true"
                            partition={webPartition}
                            useragent={userAgent}
                        />
                    </MockBoundary>
                    {errorText ? <WebViewFailureOverlay key={errorText} model={model} errorText={errorText} /> : null}
                    <AgentSurfaceCursor surface="browser" blockId={model.blockId} webviewRef={model.webviewRef} />
                    <BrowserAnnotationTrayLazy blockId={model.blockId} url={metaUrl} />
                    <BrowserResearchPanel controller={model.grabController} />
                    <BrowserGrabSheet controller={model.grabController} />
                    <BrowserMarkupOverlay blockId={model.blockId} />
                </div>
            </div>
            <Search {...searchProps} />
            <BookmarkTypeahead model={model} blockRef={blockRef} />
        </Fragment>
    );
});

export { WebView, WebViewPreviewFallback, getWebPreviewDisplayUrl, isWebviewReadyForElectronCall };
