// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";

const Channel = "kronterm:screen-selector";
export type ScreenSelectorAction = "select" | "comment" | "region";
export type ScreenSelectorPrompt = { x: number; y: number; label: string };

export function ScreenSelectorToolbar({
    title,
    onSelect,
    prompt,
    onComment,
    onCancel,
}: {
    title: string;
    onSelect?: (action: ScreenSelectorAction) => void;
    prompt?: ScreenSelectorPrompt;
    onComment?: (comment: string) => void;
    onCancel?: () => void;
}) {
    const frame = useRef<HTMLIFrameElement>(null);
    const handlers = useRef({ onSelect, onComment, onCancel });
    handlers.current = { onSelect, onComment, onCancel };
    const syncPrompt = () => frame.current?.contentWindow?.postMessage({ channel: Channel, prompt }, "*");
    useEffect(syncPrompt, [prompt?.x, prompt?.y, prompt?.label]);
    useEffect(() => {
        const receive = (event: MessageEvent) => {
            const iframe = frame.current;
            const message = event.data;
            if (!iframe?.contentWindow || event.source !== iframe.contentWindow || message?.channel !== Channel) return;
            const insets = message.insets;
            if (Array.isArray(insets) && insets.length === 4 && insets.every(Number.isFinite)) {
                iframe.style.clipPath = `inset(${insets.map((value) => `${Math.max(0, value)}px`).join(" ")})`;
            }
            if (message.action === "select" || message.action === "comment" || message.action === "region") {
                handlers.current.onSelect?.(message.action);
            }
            if (typeof message.comment === "string" && message.comment.length <= 2000)
                handlers.current.onComment?.(message.comment);
            if (message.cancelled === true) handlers.current.onCancel?.();
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
    }, []);
    return (
        <iframe
            ref={frame}
            title={title}
            name="kronterm-screen-selector"
            src="./selector-toolbar.html"
            sandbox="allow-scripts allow-same-origin"
            className="absolute inset-0 z-10 h-full w-full border-0"
            style={{ clipPath: "inset(100%)", colorScheme: "normal" }}
            data-react-grab-ignore-events=""
            onLoad={syncPrompt}
        />
    );
}
