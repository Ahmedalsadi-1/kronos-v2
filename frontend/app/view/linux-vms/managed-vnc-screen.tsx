// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { ScreenSelectorToolbar, type ScreenSelectorAction } from "@/app/lib/screen-selector-toolbar";
import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import { ComputerSelection, type VmSelectionSnapshot } from "@/app/view/computers/computer-selection-panel";
import { getApi } from "@/store/global";
import type { LinuxDesktop } from "@/types/linux-desktops";
import RFB from "@novnc/novnc";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useComputerActivity } from "./computer-activity";
import "./computer-frame.css";

export function ManagedVncScreen({
    desktop,
    onTakeControl,
    onReturnControl,
    busy = false,
    error,
    onLifecycle,
    onUpdate,
    onHistory,
    historyPanel,
}: {
    desktop: LinuxDesktop;
    onTakeControl?: () => Promise<void>;
    onReturnControl?: () => Promise<void>;
    busy?: boolean;
    error?: string;
    onLifecycle?: () => void;
    onUpdate?: () => void;
    onHistory?: () => void;
    historyPanel?: ReactNode;
}) {
    const root = useRef<HTMLDivElement>(null);
    const screen = useRef<HTMLDivElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const display = useRef<HTMLDivElement>(null);
    const client = useRef<RFB>(null);
    const [phase, setPhase] = useState("Connecting…");
    const [viewOnly, setViewOnly] = useState(false);
    const [fit, setFit] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const [takingOver, setTakingOver] = useState(false);
    const [localError, setLocalError] = useState("");
    const [selection, setSelection] = useState<
        Extract<VmSelectionSnapshot, { kind: "linux" }> & { action: ScreenSelectorAction }
    >();
    const [capturing, setCapturing] = useState(false);
    const activity = useComputerActivity(desktop?.id);
    const agentOwns = desktop?.controlOwner === "agent";
    const approval = agentOwns && activity?.phase === "awaiting-approval";
    const active = agentOwns && ["queued", "running", "verifying"].includes(activity?.phase);
    const endpoint = desktop?.status === "running" ? desktop.viewerUrl : "";
    const selectionActive =
        endpoint && selection?.desktopId === desktop.id && selection.controlGeneration === desktop.controlGeneration;
    useEffect(() => {
        setSelection(undefined);
    }, [desktop?.id, desktop?.controlGeneration, endpoint]);
    const captureSelection = async (action: ScreenSelectorAction) => {
        if (capturing) return;
        if (!endpoint) {
            setLocalError("Start the VM to select a target.");
            return;
        }
        setCapturing(true);
        setLocalError("");
        try {
            const result = await getApi().performLinuxDesktopAction({
                desktopId: desktop.id,
                expectedGeneration: desktop.controlGeneration,
                action: "screenshot",
            });
            if (result.success === false) throw new Error(result.error.message);
            if (result.data.desktop.controlGeneration !== desktop.controlGeneration)
                throw new Error("VM control changed. Capture the screen again.");
            if (!result.data.imageDataUrl) throw new Error("The VM screen is unavailable.");
            setSelection({
                kind: "linux",
                action,
                name: desktop.name,
                desktopId: desktop.id,
                controlGeneration: desktop.controlGeneration,
                supportsElementPick: desktop.provider === "cua-qemu",
                imageDataUrl: result.data.imageDataUrl,
                capturedAt: Date.now(),
            });
        } catch (error) {
            setLocalError(error instanceof Error ? error.message : "Could not capture the VM screen.");
        } finally {
            setCapturing(false);
        }
    };
    const iframe = /^https?:/.test(endpoint);
    let iframeUrl = endpoint;
    if (iframe) {
        const url = new URL(endpoint);
        const noVncViewer = url.pathname.endsWith("/vnc.html");
        if (noVncViewer || agentOwns) {
            const fragment = new URLSearchParams(url.hash.slice(1));
            if (noVncViewer) fragment.set("resize", "scale");
            if (agentOwns) fragment.set("view_only", "true");
            url.hash = fragment.toString();
            iframeUrl = url.href;
        }
    }

    useLayoutEffect(() => {
        const frame = screen.current;
        const viewer = viewport.current;
        if (!frame || !viewer) return;
        const sync = () => {
            const { width, height } = frame.getBoundingClientRect();
            if (!width || !height || !frame.clientWidth || !frame.clientHeight) return;
            // noVNC uses screen pixels for both fitting and input. Compensate for the canvas transform here.
            viewer.style.width = `${width}px`;
            viewer.style.height = `${height}px`;
            viewer.style.transform = `scale(${frame.clientWidth / width}, ${frame.clientHeight / height})`;
        };
        sync();
        const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(sync);
        resize?.observe(frame);
        const host = frame.closest("[data-live-blockid]");
        const geometry = new MutationObserver(sync);
        if (host) geometry.observe(host, { attributes: true, attributeFilter: ["style"] });
        window.addEventListener("resize", sync);
        return () => {
            resize?.disconnect();
            geometry.disconnect();
            window.removeEventListener("resize", sync);
        };
    }, []);
    useEffect(() => setViewOnly(agentOwns), [agentOwns]);
    useEffect(() => {
        if (!endpoint || iframe || !display.current) return;
        let alive = true;
        let timer: ReturnType<typeof setTimeout>;
        setPhase("Connecting…");
        const rfb = new RFB(display.current, endpoint, { shared: true });
        client.current = rfb;
        // Fence input before the connection opens, including the first agent-owned render.
        rfb.viewOnly = agentOwns || viewOnly;
        rfb.background = "#090b0a";
        rfb.scaleViewport = fit;
        rfb.resizeSession = false;
        // The viewer is loopback-only; avoid spending guest CPU compressing a local stream.
        rfb.compressionLevel = 0;
        rfb.addEventListener("connect", () => {
            if (alive) setPhase("Connected");
        });
        rfb.addEventListener("disconnect", () => {
            if (!alive) return;
            setPhase("Reconnecting…");
            timer = setTimeout(() => setAttempt((value) => value + 1), 3000);
        });
        rfb.addEventListener("securityfailure", () => {
            if (alive) setPhase("Computer authentication failed.");
        });
        return () => {
            alive = false;
            clearTimeout(timer);
            rfb.disconnect();
            if (client.current === rfb) client.current = null;
        };
    }, [endpoint, iframe, attempt]);
    useEffect(() => {
        if (!client.current) return;
        client.current.viewOnly = agentOwns || viewOnly;
        client.current.scaleViewport = fit;
    }, [agentOwns, viewOnly, fit, attempt, endpoint]);
    useEffect(() => {
        const update = () => setFullscreen(document.fullscreenElement === root.current);
        document.addEventListener("fullscreenchange", update);
        return () => document.removeEventListener("fullscreenchange", update);
    }, []);
    const takeOver = async () => {
        if (!onTakeControl || takingOver) return;
        setTakingOver(true);
        setLocalError("");
        try {
            await onTakeControl();
            setViewOnly(false);
        } catch (failure) {
            setLocalError(failure instanceof Error ? failure.message : "Could not take control.");
        } finally {
            setTakingOver(false);
        }
    };
    const returnControl = async () => {
        if (!onReturnControl || takingOver) return;
        setTakingOver(true);
        setLocalError("");
        try {
            await onReturnControl();
            setViewOnly(true);
        } catch (failure) {
            setLocalError(failure instanceof Error ? failure.message : "Could not return control to the agent.");
        } finally {
            setTakingOver(false);
        }
    };
    const lifecycleLabel =
        desktop?.status === "running"
            ? "Stop VM"
            : desktop?.imagePrepared
              ? "Start VM"
              : desktop?.provider === "cua-qemu"
                ? "Set up and launch"
                : "Prepare desktop";
    const status = approval
        ? "Awaiting approval"
        : active
          ? `${activity.action === "verify" ? "Verifying" : activity.action.charAt(0).toUpperCase() + activity.action.slice(1)}…`
          : agentOwns
            ? "Agent has control"
            : viewOnly
              ? "View only"
              : "You have control";
    return (
        <div ref={root} className="computer-frame">
            <div ref={screen} className="computer-frame-screen" data-active={active} data-approval={approval}>
                <div ref={viewport} className="computer-frame-viewport">
                    {iframe ? (
                        <iframe
                            title={`${desktop.name} desktop`}
                            src={iframeUrl}
                            allow="clipboard-read; clipboard-write; fullscreen"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
                            className="h-full w-full border-0"
                            inert={Boolean(selectionActive)}
                        />
                    ) : (
                        <div ref={display} className="computer-frame-display" inert={Boolean(selectionActive)} />
                    )}
                </div>
                {selectionActive && (
                    <ComputerSelection
                        key={selection.action}
                        vm={selection}
                        action={selection.action}
                        onClose={() => setSelection(undefined)}
                    />
                )}
                <ScreenSelectorToolbar
                    title="Linux VM element selector"
                    onSelect={(action) => {
                        if (selectionActive)
                            setSelection(action === selection.action ? undefined : { ...selection, action });
                        else void captureSelection(action);
                    }}
                />
                {!iframe && agentOwns && endpoint && (
                    <AgentSurfaceCursor
                        surface="sandbox"
                        surfaceId={`vm:${desktop?.id}`}
                        coordinates="capture"
                        surfaceEffects={false}
                        visible={!approval}
                    />
                )}
                {!endpoint && (
                    <div className="computer-frame-empty">
                        <p>
                            {desktop?.problem ||
                                (desktop?.status === "running"
                                    ? "Connecting the computer…"
                                    : "Start your computer to continue.")}
                        </p>
                        {onLifecycle && desktop?.status !== "running" && desktop?.status !== "unavailable" && (
                            <button type="button" disabled={busy || !desktop} onClick={onLifecycle}>
                                {busy ? "Updating…" : lifecycleLabel}
                            </button>
                        )}
                    </div>
                )}
            </div>
            {(error || localError) && (
                <p role="alert" className="computer-frame-error">
                    {error || localError}
                </p>
            )}
            <footer className="computer-frame-footer">
                <div
                    className="computer-frame-status"
                    data-approval={approval}
                    role="status"
                    aria-label={
                        busy
                            ? "Updating computer…"
                            : endpoint
                              ? approval || active || iframe || phase === "Connected"
                                  ? status
                                  : phase
                              : desktop?.status === "running"
                                ? "Starting computer…"
                                : "Computer is offline"
                    }
                >
                    <span className="computer-frame-dot" data-state={active ? "connected" : "idle"} />
                </div>
                <details className="computer-frame-tools">
                    <summary aria-label="Computer controls" title="Computer controls">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
                            <circle cx="3" cy="9" r="1.5" />
                            <circle cx="9" cy="9" r="1.5" />
                            <circle cx="15" cy="9" r="1.5" />
                        </svg>
                    </summary>
                    <div className="computer-frame-tools-panel">
                        {onHistory && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.currentTarget.closest("details").open = false;
                                    onHistory();
                                }}
                            >
                                Checkpoint timeline
                            </button>
                        )}
                        {!iframe && (
                            <>
                                <button type="button" aria-pressed={fit} onClick={() => setFit((value) => !value)}>
                                    {fit ? "Actual size" : "Fit display"}
                                </button>
                                <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                                    Reconnect
                                </button>
                                {!agentOwns && (
                                    <button
                                        type="button"
                                        aria-pressed={viewOnly}
                                        onClick={() => setViewOnly((value) => !value)}
                                    >
                                        {viewOnly ? "Enable input" : "View only"}
                                    </button>
                                )}
                            </>
                        )}
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    if (document.fullscreenElement) await document.exitFullscreen();
                                    else await root.current?.requestFullscreen();
                                } catch {
                                    setLocalError("Fullscreen is unavailable in this window.");
                                }
                            }}
                        >
                            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                        </button>
                        {onLifecycle && (
                            <button
                                type="button"
                                disabled={busy || !desktop || desktop.status === "unavailable"}
                                onClick={onLifecycle}
                            >
                                {lifecycleLabel}
                            </button>
                        )}
                        {onUpdate && desktop?.imagePrepared && desktop.status === "stopped" && (
                            <button type="button" disabled={busy} onClick={onUpdate}>
                                Update desktop
                            </button>
                        )}
                    </div>
                </details>
                {agentOwns && onTakeControl && (
                    <button
                        type="button"
                        className="computer-frame-takeover"
                        disabled={takingOver || busy}
                        onClick={() => void takeOver()}
                    >
                        {takingOver ? "Taking over…" : "Take over"}
                    </button>
                )}
                {!agentOwns && endpoint && onReturnControl && (
                    <button
                        type="button"
                        className="computer-frame-takeover"
                        disabled={takingOver || busy}
                        onClick={() => void returnControl()}
                    >
                        {takingOver ? "Returning control…" : "Return to agent"}
                    </button>
                )}
            </footer>
            {historyPanel}
        </div>
    );
}
