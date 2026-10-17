// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import { getApi } from "@/store/global";
import { useEffect, useRef, useState } from "react";
import type { LinuxDesktop, LinuxDesktopAction } from "../../../types/linux-desktops";

export function DesktopScreen({
    settings = false,
    desktopId = "linux-vm:ubuntu",
}: {
    settings?: boolean;
    desktopId?: string;
}) {
    if (desktopId === "linux-desktop:primary") desktopId = "linux-vm:ubuntu";
    const inputBuffer = useRef("");
    const inputTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const scrollBuffer = useRef({ deltaX: 0, deltaY: 0 });
    const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const captureTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [desktop, setDesktop] = useState<LinuxDesktop>();
    const [frame, setFrame] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [agentId, setAgentId] = useState("");
    const current = useRef<LinuxDesktop>(undefined);
    const lastFrame = useRef("");
    const unchangedFrames = useRef(0);
    const alive = useRef(false);
    const pointerStart = useRef<{ x: number; y: number }>(undefined);
    const dragged = useRef(false);
    const image = useRef<HTMLImageElement>(null);
    useEffect(() => {
        alive.current = true;
        setFrame("");
        current.current = undefined;
        lastFrame.current = "";
        unchangedFrames.current = 0;
        let timer: ReturnType<typeof setTimeout>;
        let stopped = false;
        const poll = async () => {
            try {
                if (!document.hidden) {
                    const result = await getApi().listLinuxDesktops();
                    if (result.success === false) throw new Error(result.error.message);
                    if (stopped) return;
                    const next = result.data.find((item) => item.id == desktopId);
                    current.current = next;
                    setDesktop(next);
                    if (next?.ready) {
                        const capture = await getApi().performLinuxDesktopAction({
                            desktopId: next.id,
                            action: "screenshot",
                        });
                        if (capture.success === false) throw new Error(capture.error.message);
                        if (stopped) return;
                        unchangedFrames.current =
                            lastFrame.current == capture.data.imageDataUrl ? unchangedFrames.current + 1 : 0;
                        lastFrame.current = capture.data.imageDataUrl;
                        setFrame(capture.data.imageDataUrl);
                        setError("");
                    } else {
                        setFrame("");
                    }
                }
            } catch (failure) {
                if (!stopped) setError(failure instanceof Error ? failure.message : "Desktop unavailable.");
            } finally {
                if (!stopped)
                    timer = setTimeout(poll, document.hidden ? 5000 : unchangedFrames.current >= 2 ? 3000 : 1500);
            }
        };
        void poll();
        return () => {
            stopped = true;
            alive.current = false;
            clearTimeout(timer);
            clearTimeout(inputTimer.current);
            clearTimeout(scrollTimer.current);
            clearTimeout(captureTimer.current);
            inputBuffer.current = "";
        };
    }, [desktopId]);
    const act = async (action: LinuxDesktopAction["action"], input: Partial<LinuxDesktopAction> = {}) => {
        if (!current.current || (busy && (action == "start" || action == "stop"))) return;
        setBusy(true);
        try {
            const result = await getApi().performLinuxDesktopAction({
                desktopId: current.current.id,
                action,
                expectedGeneration: current.current.controlGeneration,
                ...input,
            });
            if (result.success === false) throw new Error(result.error.message);
            if (!alive.current) return;
            current.current = result.data.desktop;
            setDesktop(result.data.desktop);
            unchangedFrames.current = 0;
            if (result.data.desktop.ready && ["click", "drag", "type", "key", "scroll"].includes(action)) {
                clearTimeout(captureTimer.current);
                captureTimer.current = setTimeout(() => void capture(), 100);
            }
            setError("");
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "Desktop action failed.");
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    const capture = async () => {
        try {
            const result = await getApi().performLinuxDesktopAction({ desktopId, action: "screenshot" });
            if (result.success === false) throw new Error(result.error.message);
            if (!alive.current) return;
            lastFrame.current = result.data.imageDataUrl;
            setFrame(result.data.imageDataUrl);
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : "Capture failed.");
        }
    };
    const flushText = () => {
        clearTimeout(inputTimer.current);
        const text = inputBuffer.current;
        inputBuffer.current = "";
        if (text) void act("type", { text });
    };
    const typeText = (text: string) => {
        inputBuffer.current += text;
        clearTimeout(inputTimer.current);
        inputTimer.current = setTimeout(flushText, 40);
    };
    return (
        <div className="flex h-full min-h-0 flex-col">
            {settings && (
                <div className="flex items-center gap-2 border-b border-[var(--kt-separator)] px-3 py-2 text-xs">
                    <span role="status">
                        {desktop?.ready ? "Running" : desktop?.status == "running" ? "Starting…" : "Desktop is off"}
                    </span>
                    <SystemButton
                        size="small"
                        disabled={!desktop || busy}
                        onClick={() =>
                            void act(
                                desktop?.status == "running"
                                    ? "stop"
                                    : desktop?.status == "missing"
                                      ? "prepare"
                                      : "start"
                            )
                        }
                    >
                        {desktop?.status == "running" ? "Stop" : desktop?.status == "missing" ? "Prepare" : "Start"}
                    </SystemButton>
                    {desktop?.ready && (
                        <SystemButton size="small" disabled={busy} onClick={() => void act("key", { key: "Return" })}>
                            Enter
                        </SystemButton>
                    )}
                </div>
            )}
            {settings && desktop && (
                <form
                    className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        if (!agentId.trim() || busy) return;
                        setBusy(true);
                        try {
                            const result = await getApi().assignLinuxDesktop(
                                desktop.id,
                                agentId.trim(),
                                desktop.controlGeneration
                            );
                            if (result.success === false) throw new Error(result.error.message);
                            current.current = result.data;
                            setDesktop(result.data);
                            setError("");
                        } catch (failure) {
                            setError(failure instanceof Error ? failure.message : "Could not allow agent access.");
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <input
                        aria-label="Agent reservation ID"
                        placeholder="Agent reservation ID"
                        maxLength={128}
                        value={agentId}
                        onChange={(event) => setAgentId(event.target.value)}
                    />
                    <SystemButton type="submit" size="small" disabled={busy || !agentId.trim()}>
                        Allow agent
                    </SystemButton>
                    <SystemButton
                        type="button"
                        size="small"
                        disabled={busy}
                        onClick={async () => {
                            const result = await getApi().takeOverLinuxDesktop(desktop.id);
                            if (result.success === false) {
                                setError(result.error.message);
                                return;
                            }
                            current.current = result.data;
                            setDesktop(result.data);
                        }}
                    >
                        Take control
                    </SystemButton>
                </form>
            )}
            {error && (
                <p role="alert" className="px-3 py-2 text-xs">
                    {error}
                </p>
            )}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
                <AgentSurfaceCursor surface="sandbox" surfaceId={`vm:${desktopId}`} coordinates="capture" />
                {frame ? (
                    <img
                        ref={image}
                        src={frame}
                        alt="Live desktop"
                        className="max-h-full max-w-full cursor-pointer object-contain"
                        draggable={false}
                        tabIndex={0}
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            flushText();
                            const element = image.current;
                            const rect = element.getBoundingClientRect();
                            pointerStart.current = {
                                x: ((event.clientX - rect.left) * element.naturalWidth) / rect.width,
                                y: ((event.clientY - rect.top) * element.naturalHeight) / rect.height,
                            };
                            dragged.current = false;
                            element.setPointerCapture(event.pointerId);
                        }}
                        onPointerCancel={() => {
                            pointerStart.current = undefined;
                        }}
                        onPointerUp={(event) => {
                            const start = pointerStart.current;
                            pointerStart.current = undefined;
                            if (!start) return;
                            const element = image.current;
                            const rect = element.getBoundingClientRect();
                            const endX = Math.max(
                                0,
                                Math.min(
                                    element.naturalWidth - 1,
                                    ((event.clientX - rect.left) * element.naturalWidth) / rect.width
                                )
                            );
                            const endY = Math.max(
                                0,
                                Math.min(
                                    element.naturalHeight - 1,
                                    ((event.clientY - rect.top) * element.naturalHeight) / rect.height
                                )
                            );
                            if (Math.hypot(endX - start.x, endY - start.y) < 5) return;
                            dragged.current = true;
                            void act("drag", { ...start, endX, endY });
                            element.focus();
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            flushText();
                            const element = image.current;
                            const rect = element.getBoundingClientRect();
                            void act("click", {
                                button: "right",
                                x: Math.floor(((event.clientX - rect.left) * element.naturalWidth) / rect.width),
                                y: Math.floor(((event.clientY - rect.top) * element.naturalHeight) / rect.height),
                            });
                            element.focus();
                        }}
                        onDoubleClick={(event) => {
                            const element = image.current;
                            const rect = element.getBoundingClientRect();
                            void act("click", {
                                count: 2,
                                x: Math.floor(((event.clientX - rect.left) * element.naturalWidth) / rect.width),
                                y: Math.floor(((event.clientY - rect.top) * element.naturalHeight) / rect.height),
                            });
                        }}
                        onClick={(event) => {
                            if (dragged.current) {
                                dragged.current = false;
                                return;
                            }
                            const element = image.current;
                            const rect = element.getBoundingClientRect();
                            flushText();
                            void act("click", {
                                x: Math.floor(((event.clientX - rect.left) * element.naturalWidth) / rect.width),
                                y: Math.floor(((event.clientY - rect.top) * element.naturalHeight) / rect.height),
                            });
                            element.focus();
                        }}
                        onPaste={(event) => {
                            event.preventDefault();
                            typeText(event.clipboardData.getData("text"));
                            flushText();
                        }}
                        onWheel={(event) => {
                            event.preventDefault();
                            flushText();
                            const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 640 : 1;
                            scrollBuffer.current.deltaX += event.deltaX * scale;
                            scrollBuffer.current.deltaY += event.deltaY * scale;
                            clearTimeout(scrollTimer.current);
                            scrollTimer.current = setTimeout(() => {
                                const delta = scrollBuffer.current;
                                scrollBuffer.current = { deltaX: 0, deltaY: 0 };
                                void act("scroll", {
                                    deltaX: Math.max(-10000, Math.min(10000, delta.deltaX)),
                                    deltaY: Math.max(-10000, Math.min(10000, delta.deltaY)),
                                });
                            }, 40);
                        }}
                        onKeyDown={(event) => {
                            const keys = {
                                Enter: "Return",
                                Escape: "Escape",
                                Backspace: "BackSpace",
                                Tab: "Tab",
                                ArrowUp: "Up",
                                ArrowDown: "Down",
                                ArrowLeft: "Left",
                                ArrowRight: "Right",
                                Delete: "Delete",
                                Home: "Home",
                                End: "End",
                                PageUp: "Page_Up",
                                PageDown: "Page_Down",
                            };
                            if (event.metaKey || event.ctrlKey || event.altKey) {
                                if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return;
                                event.preventDefault();
                                flushText();
                                const modifiers = [
                                    event.ctrlKey || event.metaKey ? "ctrl" : "",
                                    event.altKey ? "alt" : "",
                                    event.shiftKey ? "shift" : "",
                                ].filter(Boolean);
                                void act("key", { key: [...modifiers, keys[event.key] || event.key].join("+") });
                            } else if (keys[event.key]) {
                                event.preventDefault();
                                flushText();
                                void act("key", { key: keys[event.key] });
                            } else if (event.key.length == 1) {
                                event.preventDefault();
                                typeText(event.key);
                            }
                        }}
                    />
                ) : (
                    <div className="flex flex-col items-center gap-3 px-4 text-sm text-zinc-400">
                        <span>
                            {desktop?.problem ||
                                (desktop?.status == "running" ? "Starting desktop…" : "Desktop is off")}
                        </span>
                        {desktop && desktop.status != "running" && (
                            <SystemButton
                                disabled={busy}
                                onClick={() => void act(desktop.status === "missing" ? "prepare" : "start")}
                            >
                                {desktop.status === "missing" ? "Prepare Ubuntu VM" : "Start desktop"}
                            </SystemButton>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
