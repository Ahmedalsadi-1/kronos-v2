// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { injectedAgentCursorScript } from "@/util/agent-cursor-feedback";
import { useEffect, useRef, type RefObject } from "react";

const BrowserCursorScript = injectedAgentCursorScript();

export function useBrowserAgentCursor(
    webviewRef: RefObject<Electron.WebviewTag>,
    point: { x: number; y: number },
    active: boolean,
    label: string,
    clickCount: number,
    reducedMotion: boolean
) {
    const lastClick = useRef<number>(undefined);
    const state = useRef({ point, active, label, clickCount, reducedMotion });
    state.current = { point, active, label, clickCount, reducedMotion };
    const send = useRef<() => void>(() => {});

    useEffect(() => {
        const webview = webviewRef?.current;
        if (!webview) return;
        let disposed = false;
        let pending = false;
        let dirty = false;
        let installed = false;
        let documentVersion = 0;
        const update = async () => {
            dirty = true;
            if (pending) return;
            pending = true;
            try {
                while (dirty && !disposed) {
                    dirty = false;
                    if (!installed) {
                        const version = documentVersion;
                        await webview.executeJavaScript(BrowserCursorScript);
                        if (version !== documentVersion) {
                            dirty = true;
                            continue;
                        }
                        installed = true;
                    }
                    if (disposed) break;
                    const next = state.current;
                    const visible = next.active && next.point != null;
                    const click = next.clickCount != null && next.clickCount !== lastClick.current;
                    await webview.executeJavaScript(`window.__showKronCursor?.(${visible});
                        ${visible ? `window.__updateKronCursor?.(${JSON.stringify(next.point)}, ${JSON.stringify(next.label ?? "Agent")}, ${click}, ${next.reducedMotion});` : ""}`);
                    lastClick.current = visible ? next.clickCount : undefined;
                }
            } catch {
                installed = false;
                // The next dom-ready restores feedback after navigation replaces the document.
            } finally {
                pending = false;
                if (dirty && !disposed) queueMicrotask(() => void update());
            }
        };
        send.current = () => void update();
        const ready = () => {
            documentVersion++;
            installed = false;
            lastClick.current = undefined;
            send.current();
        };
        webview.addEventListener("dom-ready", ready);
        send.current();
        return () => {
            disposed = true;
            send.current = () => {};
            webview.removeEventListener("dom-ready", ready);
            try {
                void webview.executeJavaScript("window.__showKronCursor?.(false)").catch(() => {});
            } catch {
                // Electron can detach the guest before React disposes the cursor.
            }
        };
    }, [webviewRef]);

    useEffect(() => send.current(), [point, active, label, clickCount, reducedMotion]);
}
