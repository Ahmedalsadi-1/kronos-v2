// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BrowserDownloadsButton } from "@/app/view/webview/browser-site-settings";
import { BrowserPageToolbar, type WebViewModel } from "@/app/view/webview/webview";
import { getApi, getBlockComponentModel } from "@/store/global";
import { useAtomValue } from "jotai";
import { memo, useEffect, useState } from "react";

const ModelLookupRetryMs = 120;

function useWebViewModel(blockId: string): WebViewModel | undefined {
    const [model, setModel] = useState<WebViewModel | undefined>(undefined);
    useEffect(() => {
        setModel(undefined);
        if (!blockId) return;
        let attempts = 0;
        let timer: number | undefined;
        const lookup = () => {
            const candidate = getBlockComponentModel(blockId)?.viewModel as WebViewModel | undefined;
            if (candidate?.viewType === "web") {
                setModel(candidate);
                return;
            }
            attempts++;
            timer = window.setTimeout(lookup, Math.min(1000, ModelLookupRetryMs * 2 ** Math.floor(attempts / 10)));
        };
        lookup();
        return () => {
            if (timer != null) window.clearTimeout(timer);
        };
    }, [blockId]);
    return model;
}

function NativeBrowserHeaderBridge({ model }: { model: WebViewModel }) {
    const url = useAtomValue(model.url);
    const block = useAtomValue(model.blockAtom);
    const canGoBack = useAtomValue(model.canGoBack);
    const canGoForward = useAtomValue(model.canGoForward);
    const loading = useAtomValue(model.isLoading);
    useEffect(() => {
        const publish = () =>
            getApi().syncNativeNotch({
                browser: {
                    blockId: model.blockId,
                    url: url ?? block?.meta?.url ?? "",
                    canGoBack,
                    canGoForward,
                    loading,
                },
            });
        publish();
        const timer = window.setInterval(publish, 1000);
        return () => window.clearInterval(timer);
    }, [model, url, block?.meta?.url, canGoBack, canGoForward, loading]);
    useEffect(
        () =>
            getApi().onNativeNotchBrowserAction(({ action, url: nextUrl }) => {
                if (action === "browser-navigate" && typeof nextUrl === "string")
                    model.loadUrl(nextUrl, "notch-header");
                else if (action === "browser-back" && model.webviewRef.current?.canGoBack())
                    model.webviewRef.current.goBack();
                else if (action === "browser-forward" && model.webviewRef.current?.canGoForward())
                    model.webviewRef.current.goForward();
                else if (action === "browser-reload") model.handleRefresh(null);
            }),
        [model]
    );
    return null;
}

export const OSWebNavBar = memo(function OSWebNavBar({
    blockId,
    islandControls,
    nativeHeader = false,
    syncNativeHeader = true,
    companion,
    downloadsTarget,
}: {
    blockId: string;
    islandControls?: React.ReactNode;
    nativeHeader?: boolean;
    syncNativeHeader?: boolean;
    companion?: boolean;
    downloadsTarget?: HTMLElement;
}) {
    const model = useWebViewModel(blockId);
    if (nativeHeader) return model ? <NativeBrowserHeaderBridge model={model} /> : null;
    if (!model)
        return (
            <div
                className="os-web-nav is-pending flex items-center justify-end"
                role="toolbar"
                aria-label="Browser navigation"
            >
                <span role="status" className="px-3 py-2 text-xs text-muted-foreground">
                    Loading browser controls…
                </span>
                {islandControls}
            </div>
        );
    return (
        <>
            {syncNativeHeader && <NativeBrowserHeaderBridge model={model} />}
            <BrowserPageToolbar
                model={model}
                islandControls={islandControls}
                companion={companion}
                downloadsTarget={downloadsTarget}
            />
        </>
    );
});
OSWebNavBar.displayName = "OSWebNavBar";

function WebDownloads({ model }: { model: WebViewModel }) {
    const guestId = useAtomValue(model.webContentsId);
    const url = useAtomValue(model.url);
    return <BrowserDownloadsButton guestId={guestId} url={url} />;
}

export function OSWebDownloads({ blockId }: { blockId: string }) {
    const model = useWebViewModel(blockId);
    return model ? <WebDownloads model={model} /> : <BrowserDownloadsButton url="" />;
}
