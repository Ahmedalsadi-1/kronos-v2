// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import type { LinuxDesktop } from "@/types/linux-desktops";
import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { useComputerActivity } from "./computer-activity";
import "./computer-frame.css";

export function ManagedVncScreen({
    desktop,
    onTakeControl,
    busy = false,
    error,
    onLifecycle,
    onUpdate,
}: {
    desktop: LinuxDesktop;
    onTakeControl?: () => Promise<void>;
    busy?: boolean;
    error?: string;
    onLifecycle?: () => void;
    onUpdate?: () => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    const display = useRef<HTMLDivElement>(null);
    const client = useRef<RFB>(null);
    const [phase, setPhase] = useState("Connecting…");
    const [viewOnly, setViewOnly] = useState(false);
    const [fit, setFit] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const [takingOver, setTakingOver] = useState(false);
    const [localError, setLocalError] = useState("");
    const activity = useComputerActivity(desktop?.id);
    const agentOwns = desktop?.controlOwner === "agent";
    const approval = agentOwns && activity?.phase === "awaiting-approval";
    const active = agentOwns && ["queued", "running", "verifying"].includes(activity?.phase);
    const endpoint = desktop?.status === "running" ? desktop.viewerUrl : "";
    const iframe = /^https?:/.test(endpoint);
    let iframeUrl = endpoint;
    if (iframe && agentOwns) {
        const url = new URL(endpoint);
        const fragment = new URLSearchParams(url.hash.slice(1));
        fragment.set("view_only", "true");
        url.hash = fragment.toString();
        iframeUrl = url.href;
    }
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
    const lifecycleLabel =
        desktop?.status === "running" ? "Stop VM" : desktop?.imagePrepared ? "Start VM" : "Prepare desktop";
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
            <header className="computer-frame-header">
                <strong>KronTerm Computer</strong>
                <span className="computer-frame-connection" role="status">
                    <span
                        className="computer-frame-dot"
                        data-state={endpoint && (iframe || phase === "Connected") ? "connected" : "disconnected"}
                    />
                    {endpoint
                        ? iframe
                            ? "Live desktop"
                            : phase
                        : desktop?.status === "running"
                          ? "Starting…"
                          : "Offline"}
                </span>
            </header>
            <div className="computer-frame-screen" data-active={active} data-approval={approval}>
                {iframe ? (
                    <iframe
                        title={`${desktop.name} desktop`}
                        src={iframeUrl}
                        allow="clipboard-read; clipboard-write; fullscreen"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
                        className="h-full w-full border-0"
                    />
                ) : (
                    <div ref={display} className="computer-frame-display" />
                )}
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
                <div className="computer-frame-status" data-approval={approval} role="status">
                    <span className="computer-frame-dot" data-state={active ? "connected" : "idle"} />
                    <span>
                        {busy
                            ? "Updating computer…"
                            : endpoint
                              ? status
                              : desktop?.status === "running"
                                ? "Starting computer…"
                                : "Computer is offline"}
                    </span>
                </div>
                <details className="computer-frame-tools">
                    <summary aria-label="Computer controls">Controls</summary>
                    <div className="computer-frame-tools-panel">
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
            </footer>
        </div>
    );
}
