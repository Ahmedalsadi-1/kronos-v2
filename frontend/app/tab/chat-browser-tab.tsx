// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { File, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { captureBrowserTab } from "./browser-tab-preview";
import type { PenChatDockTab } from "./os-pen-chat-dock-model";

export function ChatBrowserTab({
    tab,
    selected,
    rendered,
    onOpen,
}: {
    tab: PenChatDockTab;
    selected: boolean;
    rendered: boolean;
    onOpen: () => void;
}) {
    const [preview, setPreview] = useState<{ title?: string; image: string }>();
    const buttonRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const button = buttonRef.current;
        const view = button?.ownerDocument.defaultView;
        if (!rendered || !button || !view?.IntersectionObserver) return;
        let visible = false;
        let disposed = false;
        let pending = false;
        const capture = async () => {
            if (!visible || document.hidden || pending) return;
            pending = true;
            try {
                const result = await captureBrowserTab(tab.id);
                if (!disposed && visible) {
                    setPreview(result?.image ? { title: tab.title, image: result.image } : undefined);
                }
            } catch {
                // A guest can detach or navigate during capture.
            } finally {
                pending = false;
            }
        };
        const observer = new view.IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible) void capture();
        });
        observer.observe(button);
        const refresh = window.setInterval(capture, 5000);
        return () => {
            disposed = true;
            observer.disconnect();
            window.clearInterval(refresh);
        };
    }, [rendered, tab.id, tab.title]);

    const kind = tab.app === "browser" ? "browser tab" : "file preview";
    const label = tab.title || (tab.app === "browser" ? "Browser" : "File");
    const image = preview?.title === tab.title ? preview?.image : undefined;
    return (
        <button
            ref={buttonRef}
            type="button"
            aria-label={`Open ${kind}: ${label}`}
            aria-pressed={selected}
            title={label}
            onClick={onOpen}
        >
            <span data-kronos-browser-preview-image aria-hidden="true">
                {image ? <img src={image} alt="" /> : tab.app === "browser" ? <Globe size={18} /> : <File size={18} />}
            </span>
            <span data-kronos-browser-preview-label>{label}</span>
        </button>
    );
}
