// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import type { WebViewModel } from "@/app/view/webview/webview";
import { getApi, getBlockComponentModel } from "@/store/global";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export async function captureBrowserTab(blockId: string) {
    const model = getBlockComponentModel(blockId)?.viewModel as WebViewModel;
    const mountedGuest = model?.webviewRef?.current;
    const guest = mountedGuest ?? document.querySelector<Electron.WebviewTag>(
        `[data-blockid="${CSS.escape(blockId)}"] webview`
    );
    if (!guest?.isConnected || (mountedGuest && !globalStore.get(model.domReady))) return;
    if (guest.hasAttribute("data-browser-account-private") ||
        guest.getAttribute("partition")?.startsWith("kronterm-private")) return;
    const url = guest.getURL();
    const result = await getApi().captureBrowserPage({ guestId: guest.getWebContentsId() });
    if (!guest.isConnected || (mountedGuest && guest !== model.webviewRef.current) || url !== guest.getURL()) return;
    return { title: guest.getTitle() || url, host: new URL(url).host, image: result?.dataUrl };
}

export function BrowserTabPreview({ blockId, label, active, children }: { blockId: string; label: string; active: boolean; children: React.ReactNode }) {
    const anchor = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const cachedImage = useRef<string>(undefined);
    useEffect(() => {
        if (!active || open) return;
        let current = true;
        const capture = async () => {
            const model = getBlockComponentModel(blockId)?.viewModel as WebViewModel;
            if (model?.webviewRef) return;
            const surface = Array.from(document.querySelectorAll<HTMLElement>("[data-widget-preview-id]"))
                .find((element) => element.dataset.widgetPreviewId === blockId);
            if (!surface || surface.hidden) return;
            const rect = surface.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            try {
                const image = await getApi().captureScreenshot({
                    x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)),
                    width: Math.round(rect.width), height: Math.round(rect.height)
                }, true);
                if (current) cachedImage.current = image;
            } catch {
                // Keep the last rendered preview when the surface is unavailable.
            }
        };
        const timer = window.setInterval(capture, 5000);
        const initial = window.setTimeout(capture, 800);
        return () => { current = false; clearInterval(timer); clearTimeout(initial); };
    }, [active, blockId, open]);
    const [preview, setPreview] = useState<{ title: string; host: string; image?: string }>();
    useEffect(() => {
        if (!open) return;
        let current = true;
        setPreview(undefined);
        const timer = window.setTimeout(async () => {
            try {
                const result = await captureBrowserTab(blockId);
                if (current) setPreview(result ?? {
                    title: label,
                    host: cachedImage.current ? "Last rendered view" : "Open this tab to see its content",
                    image: cachedImage.current,
                });
            } catch {
                // The guest may navigate or detach while its tab is hovered.
            }
        }, 400);
        return () => { current = false; window.clearTimeout(timer); };
    }, [open, blockId, label]);
    const rect = anchor.current?.firstElementChild?.getBoundingClientRect();
    let left = rect?.left ?? 0;
    let bottom = rect?.bottom ?? 0;
    let portalDocument = anchor.current?.ownerDocument;
    while (portalDocument?.defaultView?.frameElement) {
        const frame = portalDocument.defaultView.frameElement;
        const bounds = frame.getBoundingClientRect();
        left += bounds.left;
        bottom += bounds.top;
        portalDocument = frame.ownerDocument;
    }
    return (
        <div ref={anchor} style={{ display: "contents" }}
            onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
            onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
            {children}
            {open && preview && rect && createPortal(
                <div role="tooltip" style={{
                    position: "fixed", top: bottom + 4,
                    left: Math.max(8, Math.min(left, portalDocument.documentElement.clientWidth - 426)),
                    zIndex: 10000, pointerEvents: "none",
                }}>
                    <BrowserPreviewCard {...preview} fallback={label} />
                </div>, portalDocument.body)}
        </div>
    );
}

function BrowserPreviewCard({ title, host, image, fallback }: {
    title: string;
    host: string;
    image?: string;
    fallback: string;
}) {
    return (
        <div style={{
            boxSizing: "border-box", width: 418, maxWidth: "calc(100vw - 16px)",
            padding: "18px 12px 22px",
            borderRadius: 18, background: "#2c2c2c", border: "1px solid #383838",
            color: "#f3f3f3", boxShadow: "0 14px 30px #0004",
            font: "16px -apple-system, BlinkMacSystemFont, sans-serif",
            textAlign: "left",
            overflow: "hidden",
        }}>
            <div style={{ marginBottom: 8, overflowWrap: "anywhere" }}>{title}</div>
            <div style={{ color: "#999", marginBottom: 16 }}>{host}</div>
            {image ? (
                <img src={image} alt="" style={{ width: "100%", aspectRatio: "1.9", objectFit: "cover", objectPosition: "top", display: "block" }} />
            ) : (
                <div style={{ height: 140, display: "grid", placeItems: "center", background: "#222", color: "#aaa", textAlign: "center", textWrap: "balance", boxSizing: "border-box" }}>
                    {fallback}
                </div>
            )}
        </div>
    );
}
