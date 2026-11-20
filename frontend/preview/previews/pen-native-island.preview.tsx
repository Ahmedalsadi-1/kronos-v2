// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type IslandMessage = { role: "user" | "assistant"; text: string };
type NativeControls = { resume: (input: { sessionId: string; title: string; messages: object[] }) => void };
type NativeSlot = HTMLElement & { kronosControls?: NativeControls };
type Submit = (input: { prompt: string }, reply: (event: object) => void) => void;
type IslandWindow = Window & { __kronosSubmitAgent?: Submit };

export function PenNativeIsland({
    active,
    controls,
    onMove,
    messages,
    threadVisible,
    threadHeight,
    onSend,
    onFullChat,
}: {
    active: boolean;
    controls?: ReactNode;
    onMove: (dx: number, dy: number) => void;
    messages: IslandMessage[];
    threadVisible: boolean;
    threadHeight: number;
    onSend: (prompt: string, response: string) => void;
    onFullChat: () => void;
}) {
    const frame = useRef<HTMLIFrameElement>(null);
    const current = useRef({ active, onMove, messages, threadVisible, threadHeight, onSend, onFullChat });
    current.current = { active, onMove, messages, threadVisible, threadHeight, onSend, onFullChat };
    const [document, setDocument] = useState<Document>();
    const [error, setError] = useState("");
    const [controlsMount, setControlsMount] = useState<HTMLElement>();
    useEffect(() => {
        if (!document) return;
        const mount = document.createElement("span");
        mount.dataset.previewIslandControls = "";
        const sync = () => {
            const row = document.querySelector<HTMLElement>(
                "[data-agent-spotlight] [data-kronos-pen-composer-controls]"
            );
            const screen = row?.querySelector("button[aria-label='Choose sandbox computer']");
            if (!row || !screen) {
                setControlsMount(undefined);
                return;
            }
            if (mount.parentElement !== row) screen.after(mount);
            setControlsMount(mount);
        };
        const observer = new MutationObserver(sync);
        observer.observe(document.body, { childList: true, subtree: true });
        sync();
        return () => {
            observer.disconnect();
            mount.remove();
        };
    }, [document]);
    useEffect(() => {
        let cleanup = () => {};
        let attempts = 0;
        const timer = window.setInterval(() => {
            const outer = frame.current?.contentDocument;
            const engine = outer?.querySelector<HTMLIFrameElement>("#pen-editor");
            const doc = engine?.contentDocument;
            const view = engine?.contentWindow as IslandWindow;
            const island = doc?.querySelector<HTMLElement>("[data-agent-spotlight]");
            const slot = island?.querySelector<NativeSlot>("[data-kronos-pen-composer-controls]");
            if (!doc || !view?.__kronosSubmitAgent || !slot?.kronosControls) {
                if (++attempts > 200) {
                    window.clearInterval(timer);
                    setError(
                        "Pen's native island could not load. Start the KronOS development server on port 9124, then reload this preview."
                    );
                }
                return;
            }
            window.clearInterval(timer);
            const style = doc.createElement("style");
            style.textContent = `
                html, body { background: transparent !important; }
                body * { visibility: hidden !important; }
                [data-agent-spotlight], [data-agent-spotlight] *,
                [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *,
                [role="listbox"], [role="listbox"] *, [data-radix-popper-content-wrapper],
                [data-radix-popper-content-wrapper] *, [popover], [popover] * { visibility: visible !important; }
                [data-agent-spotlight] {
                    position: fixed !important; inset: auto 0 8px !important;
                    width: 100% !important; transform: none !important; translate: none !important;
                    transition: none !important;
                }
                [data-agent-spotlight] > .group { box-shadow: none !important; }
                [data-kronos-mini-chat] {
                    height: var(--preview-thread-height, 180px) !important;
                    border-radius: 28px !important;
                }
                :root[data-preview-hide-thread] [data-kronos-mini-chat] { display: none !important; }
                [data-kronos-pen-drag-chat] { display: none !important; }
                [data-agent-notch-header] { cursor: grab; }
                [data-preview-island-controls] { display: inline-flex; align-items: center; }
                [data-preview-island-controls] .pw-island-controls {
                    display: inline-flex; align-items: center; gap: 0;
                    position: static; transform: none; background: transparent; box-shadow: none; padding: 0;
                }
                [data-preview-island-controls] button {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 22px; height: 24px; padding: 3px; border: 0; border-radius: 4px;
                    background: transparent; color: inherit; cursor: pointer;
                }
                [data-preview-island-controls] button:first-child { cursor: grab; touch-action: none; }
                [data-preview-island-controls] button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
                [data-preview-island-controls] button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
                [data-preview-island-controls] svg { width: 14px; height: 14px; }
            `;
            doc.head.append(style);
            outer.documentElement.style.colorScheme = "dark";
            doc.documentElement.style.colorScheme = "dark";
            let animation: number;
            const clip = () => {
                const shapes = [
                    ...doc.querySelectorAll<HTMLElement>(
                        "[data-kronos-mini-chat], [data-agent-spotlight] > button, [data-agent-spotlight] > .group > .relative, [role='menu'], [role='listbox'], [role='dialog'], [data-radix-popper-content-wrapper]"
                    ),
                ].flatMap((element) => {
                    const box = element.getBoundingClientRect();
                    if (!box.width || !box.height || view.getComputedStyle(element).visibility === "hidden") return [];
                    const radius = Math.min(
                        parseFloat(view.getComputedStyle(element).borderTopLeftRadius) || 0,
                        box.width / 2,
                        box.height / 2
                    );
                    const { left, right, top, bottom } = box;
                    const arc = "A" + radius + " " + radius + " 0 0 1 ";
                    return [
                        "M" +
                            (left + radius) +
                            " " +
                            top +
                            "H" +
                            (right - radius) +
                            arc +
                            right +
                            " " +
                            (top + radius) +
                            "V" +
                            (bottom - radius) +
                            arc +
                            (right - radius) +
                            " " +
                            bottom +
                            "H" +
                            (left + radius) +
                            arc +
                            left +
                            " " +
                            (bottom - radius) +
                            "V" +
                            (top + radius) +
                            arc +
                            (left + radius) +
                            " " +
                            top +
                            "Z",
                    ];
                });
                const value = shapes.length ? 'path("' + shapes.join(" ") + '")' : "inset(100%)";
                if (frame.current && frame.current.style.clipPath !== value) frame.current.style.clipPath = value;
                animation = view.requestAnimationFrame(clip);
            };
            clip();
            const original = view.__kronosSubmitAgent;
            const submit: Submit = ({ prompt }, reply) => {
                const response = "Preview response using Pen's native chat UI. Live agent execution is disconnected.";
                reply({ type: "message-start", source: "assistant", text: response });
                reply({ type: "end", content: { reason: "finished", response } });
                current.current.onSend(prompt, response);
            };
            view.__kronosSubmitAgent = submit;
            const openChat = (event: MouseEvent) => {
                const button = (event.target as Element).closest("button[aria-label='Open chat tab']");
                if (!button) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                current.current.onFullChat();
            };
            let drag: { x: number; y: number };
            const start = (event: PointerEvent) => {
                const header = (event.target as Element).closest<HTMLElement>("[data-agent-notch-header]");
                if (!header || (event.target as Element).closest("button") || event.button !== 0) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                drag = { x: event.screenX, y: event.screenY };
                header.setPointerCapture(event.pointerId);
            };
            const move = (event: PointerEvent) => {
                if (!drag) return;
                current.current.onMove(event.screenX - drag.x, event.screenY - drag.y);
                drag = { x: event.screenX, y: event.screenY };
            };
            const stop = () => {
                drag = undefined;
            };
            doc.addEventListener("pointerdown", start, true);
            doc.addEventListener("pointermove", move);
            doc.addEventListener("pointerup", stop);
            doc.addEventListener("pointercancel", stop);
            doc.addEventListener("click", openChat, true);
            setDocument(doc);
            const input = island.querySelector<HTMLElement>("[contenteditable=true],textarea");
            if (current.current.active) input?.focus({ preventScroll: true });
            cleanup = () => {
                view.cancelAnimationFrame(animation);
                style.remove();
                doc.removeEventListener("click", openChat, true);
                doc.removeEventListener("pointerdown", start, true);
                doc.removeEventListener("pointermove", move);
                doc.removeEventListener("pointerup", stop);
                doc.removeEventListener("pointercancel", stop);
                if (view.__kronosSubmitAgent === submit) view.__kronosSubmitAgent = original;
            };
        }, 100);
        return () => {
            window.clearInterval(timer);
            cleanup();
        };
    }, []);
    useEffect(() => {
        if (document && active)
            document
                .querySelector<HTMLElement>(
                    "[data-agent-spotlight] [contenteditable=true], [data-agent-spotlight] textarea"
                )
                ?.focus({ preventScroll: true });
    }, [active, document]);
    useEffect(() => {
        if (!document) return;
        document.documentElement.toggleAttribute("data-preview-hide-thread", !threadVisible);
        document.documentElement.style.setProperty("--preview-thread-height", threadHeight + "px");
    }, [document, threadHeight, threadVisible]);
    useEffect(() => {
        if (!document) return;
        const slot = document.querySelector<NativeSlot>("[data-agent-spotlight] [data-kronos-pen-composer-controls]");
        const transcript = messages.length
            ? messages
            : [
                  { role: "user", text: "Keep the browser open while we work." },
                  { role: "assistant", text: "The browser and the native Pen chat island are both visible." },
              ];
        slot?.kronosControls?.resume({
            sessionId: "workspace-preview",
            title: "Workspace preview",
            messages: transcript.map((message, index) => ({
                id: "preview-" + index,
                ...message,
                status: "final",
                createdAt: Date.now() + index,
            })),
        });
        if (current.current.active)
            document.defaultView?.requestAnimationFrame(() => {
                document
                    .querySelector<HTMLElement>(
                        "[data-agent-spotlight] [contenteditable=true], [data-agent-spotlight] textarea"
                    )
                    ?.focus({ preventScroll: true });
            });
    }, [document, messages]);
    return (
        <div className="pw-native-island" data-ready={!!document}>
            {!document && <p role="status">{error || "Loading Pen’s native chat island…"}</p>}
            {controls && controlsMount && createPortal(controls, controlsMount)}
            <iframe
                ref={frame}
                title="Native Pen chat island"
                src="/pen/editor/index.html?workspace=preview-island-layout&theme=dark"
            />
        </div>
    );
}
