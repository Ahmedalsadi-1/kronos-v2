// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, SystemMaterial, SystemToolbar } from "@/app/components/system-ui";
import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import type { ComputerTargetSnapshot } from "@/types/computer-targets";
import { useAtomValue } from "jotai";
import {
    ArrowLeft,
    Camera,
    ExternalLink,
    Home,
    Keyboard,
    Power,
    RefreshCw,
    RotateCw,
    Scan,
    Smartphone,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { captureStillValid } from "./computer-selection";
import { ComputerSelection } from "./computer-selection-panel";
import type { ComputersViewModel } from "./computers-model";
import { ComputersController, normalizedCapturePoint, type ComputersState } from "./computers-state";
import "./computers.css";

export function ComputersPanel({
    state,
    controller,
    compact = false,
}: {
    state: ComputersState;
    controller: ComputersController;
    compact?: boolean;
}) {
    const textBuffer = useRef("");
    const textTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const wheelDelta = useRef(0);
    const wheelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const flushText = () => {
        clearTimeout(textTimer.current);
        const value = textBuffer.current;
        textBuffer.current = "";
        if (value) void controller.act("type", { text: value });
    };
    const gestureStart = useRef<{ x: number; y: number }>(null);
    const gestureHandled = useRef(false);
    const [landscape, setLandscape] = useState(false);
    const [text, setText] = useState("");
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [selection, setSelection] = useState<ComputerTargetSnapshot>(null);
    const target = state.targets.find((item) => item.id == state.selectedId);
    const running = target?.status == "booted" || target?.status == "connected";
    const snapshot = state.snapshot?.target.id == target?.id ? state.snapshot : undefined;
    const selectionActive = selection && captureStillValid(selection, target);
    useEffect(() => {
        if (selection && !captureStillValid(selection, target)) setSelection(null);
    }, [selection, target?.id, target?.controlGeneration, target?.status]);
    const can = (action: string) => target?.capabilities.some((capability) => capability == action);
    useEffect(() => {
        gestureStart.current = null;
        setLandscape(false);
        setText("");
        setKeyboardOpen(false);
        textBuffer.current = "";
        return () => {
            clearTimeout(textTimer.current);
            clearTimeout(wheelTimer.current);
        };
    }, [state.selectedId]);
    return (
        <SystemMaterial
            className={compact ? "kt-computers kt-computers-compact" : "kt-computers"}
            aria-label="Computers and Devices"
        >
            {!compact && (
                <SystemToolbar className="kt-computers-toolbar" aria-label="Device actions">
                    <div className="kt-computers-picker">
                        <Smartphone size={17} aria-hidden="true" />
                        <select
                            aria-label="Device"
                            value={state.selectedId}
                            disabled={state.busy || state.loading}
                            onChange={(event) => controller.select(event.target.value)}
                        >
                            {state.targets.length == 0 && (
                                <option value="">{state.loading ? "Finding devices…" : "No devices"}</option>
                            )}
                            {state.targets.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} · {item.runtime}
                                </option>
                            ))}
                        </select>
                    </div>
                    <span className="kt-computers-status" role="status">
                        {state.connecting
                            ? "Connecting…"
                            : state.busy
                              ? "Working…"
                              : running
                                ? "Running"
                                : target
                                  ? "Stopped"
                                  : "Labs"}
                    </span>
                    {target && can("boot") && !running && (
                        <SystemButton
                            size="small"
                            variant="tinted"
                            disabled={state.busy}
                            onClick={() => {
                                void controller.act("boot").then(() => {
                                    if (
                                        ["booted", "connected"].includes(
                                            controller.state.targets.find((item) => item.id == target.id)?.status
                                        )
                                    )
                                        void controller.connect();
                                });
                            }}
                        >
                            <Power size={15} /> Start
                        </SystemButton>
                    )}
                    {target && can("shutdown") && running && (
                        <SystemButton
                            size="small"
                            aria-label="Stop device"
                            disabled={state.busy}
                            onClick={() => void controller.act("shutdown")}
                        >
                            <Power size={15} />
                        </SystemButton>
                    )}
                    <SystemButton
                        size="small"
                        aria-label="Refresh devices"
                        disabled={state.loading || state.busy}
                        onClick={() => void controller.refresh()}
                    >
                        <RefreshCw size={15} />
                    </SystemButton>
                </SystemToolbar>
            )}
            {state.error && (
                <div role="alert" className="kt-computers-error">
                    {state.error}
                </div>
            )}
            {!compact && target && running && (
                <div className="kt-computers-owner">
                    <span>
                        {target.automationPaused
                            ? "You have control · Kronos paused"
                            : target.controlOwner == "agent"
                              ? "Kronos has control"
                              : "You have control"}
                    </span>
                    <SystemButton
                        size="small"
                        disabled={state.busy}
                        onClick={() => void controller.act(target.automationPaused ? "resume" : "takeover")}
                    >
                        {target.automationPaused ? "Resume Kronos" : "Take control"}
                    </SystemButton>
                </div>
            )}
            <section className="kt-computers-screen" aria-label="Device screen" aria-busy={state.loading || state.busy}>
                {selectionActive ? (
                    <ComputerSelection snapshot={selection} onClose={() => setSelection(null)} />
                ) : snapshot?.imageDataUrl ? (
                    <div style={{ position: "relative" }}>
                        <AgentSurfaceCursor
                            surface="desktop"
                            surfaceId={`device:${target.id}`}
                            coordinates="normalized"
                        />
                        {can("tap") ? (
                            <button
                                className="kt-computers-tap cursor-pointer"
                                aria-label="Device screen (Enter taps center)"
                                disabled={!running}
                                onPointerDown={(event) => {
                                    flushText();
                                    const image = event.currentTarget.querySelector("img");
                                    gestureStart.current = image
                                        ? normalizedCapturePoint(
                                              image.getBoundingClientRect(),
                                              event.clientX,
                                              event.clientY
                                          )
                                        : null;
                                    gestureHandled.current = false;
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                }}
                                onPointerCancel={() => {
                                    gestureStart.current = null;
                                }}
                                onPointerUp={(event) => {
                                    const image = event.currentTarget.querySelector("img");
                                    const start = gestureStart.current;
                                    gestureStart.current = null;
                                    const end = image
                                        ? normalizedCapturePoint(
                                              image.getBoundingClientRect(),
                                              event.clientX,
                                              event.clientY
                                          )
                                        : null;
                                    if (
                                        !start ||
                                        !end ||
                                        !can("swipe") ||
                                        Math.hypot(end.x - start.x, end.y - start.y) < 0.04
                                    )
                                        return;
                                    gestureHandled.current = true;
                                    void controller.act("swipe", { ...start, endX: end.x, endY: end.y });
                                }}
                                onKeyDown={(event) => {
                                    if (event.ctrlKey || event.metaKey || event.altKey) return;
                                    if (
                                        can("key") &&
                                        [
                                            "Enter",
                                            "Backspace",
                                            "Delete",
                                            "Tab",
                                            "Escape",
                                            "ArrowUp",
                                            "ArrowDown",
                                            "ArrowLeft",
                                            "ArrowRight",
                                            "Home",
                                            "End",
                                        ].includes(event.key)
                                    ) {
                                        event.preventDefault();
                                        flushText();
                                        void controller.act("key", { key: event.key });
                                    } else if (event.key.length === 1 && can("type")) {
                                        event.preventDefault();
                                        textBuffer.current += event.key;
                                        clearTimeout(textTimer.current);
                                        textTimer.current = setTimeout(flushText, 40);
                                    } else if (
                                        event.key === "Enter" &&
                                        target.kind === "ios-simulator" &&
                                        can("type")
                                    ) {
                                        event.preventDefault();
                                        flushText();
                                        void controller.act("type", { text: "\n" });
                                    }
                                }}
                                onPaste={(event) => {
                                    if (!can("type")) return;
                                    event.preventDefault();
                                    textBuffer.current += event.clipboardData.getData("text");
                                    flushText();
                                }}
                                onWheel={(event) => {
                                    if (!can("swipe")) return;
                                    event.preventDefault();
                                    flushText();
                                    wheelDelta.current += event.deltaY;
                                    clearTimeout(wheelTimer.current);
                                    wheelTimer.current = setTimeout(() => {
                                        const delta = wheelDelta.current;
                                        wheelDelta.current = 0;
                                        if (!delta) return;
                                        const distance = Math.min(0.6, Math.max(0.1, Math.abs(delta) / 1000));
                                        void controller.act("swipe", {
                                            x: 0.5,
                                            y: delta > 0 ? 0.8 : 0.2,
                                            endX: 0.5,
                                            endY: delta > 0 ? 0.8 - distance : 0.2 + distance,
                                        });
                                    }, 40);
                                }}
                                onClick={(event) => {
                                    if (gestureHandled.current) {
                                        gestureHandled.current = false;
                                        return;
                                    }
                                    const image = event.currentTarget.querySelector("img");
                                    if (!image) return;
                                    const point =
                                        event.detail == 0
                                            ? { x: 0.5, y: 0.5 }
                                            : normalizedCapturePoint(
                                                  image.getBoundingClientRect(),
                                                  event.clientX,
                                                  event.clientY
                                              );
                                    if (point) void controller.act("tap", point);
                                }}
                            >
                                <img
                                    src={snapshot.imageDataUrl}
                                    alt={`${target.name} ${state.session ? "live" : "captured"} screen`}
                                />
                            </button>
                        ) : (
                            <img
                                src={snapshot.imageDataUrl}
                                alt={`${target.name} ${state.session ? "live" : "captured"} screen`}
                            />
                        )}
                        {!compact && (
                            <span className="kt-computers-capture-label">
                                {state.session ? "Live screen" : "Screen capture"}
                                {snapshot.capturedAt ? ` · ${new Date(snapshot.capturedAt).toLocaleTimeString()}` : ""}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="kt-computers-empty">
                        <Smartphone size={36} strokeWidth={1} aria-hidden="true" />
                        <h1>{!target ? "Connect a device" : running ? "Your simulator" : target.name}</h1>
                        <p>
                            {!target
                                ? "Add an iOS or Android simulator to get started."
                                : running
                                  ? "Open its screen to begin."
                                  : "Start this device to begin."}
                        </p>
                        {compact && target && !running && can("boot") && (
                            <SystemButton
                                variant="tinted"
                                disabled={state.busy}
                                onClick={() => void controller.act("boot").then(() => controller.connect())}
                            >
                                Start
                            </SystemButton>
                        )}
                        {target && running && can("screenshot") && (
                            <SystemButton
                                variant="tinted"
                                disabled={state.busy || state.connecting}
                                onClick={() => void controller.connect()}
                            >
                                {state.connecting ? "Connecting…" : "Open screen"}
                            </SystemButton>
                        )}
                    </div>
                )}
            </section>
            {target && (
                <div className="kt-computers-controls" aria-label="Simulator controls">
                    {snapshot?.imageDataUrl && !selectionActive && (
                        <SystemButton
                            size="small"
                            aria-label="Select screen region (Labs)"
                            disabled={state.busy || !running}
                            onClick={() => {
                                clearTimeout(textTimer.current);
                                clearTimeout(wheelTimer.current);
                                textBuffer.current = "";
                                wheelDelta.current = 0;
                                gestureStart.current = null;
                                setKeyboardOpen(false);
                                setSelection({ ...snapshot, target: { ...snapshot.target } });
                            }}
                        >
                            <Scan size={17} />
                        </SystemButton>
                    )}
                    {can("home") && (
                        <SystemButton
                            size="small"
                            aria-label="Home"
                            disabled={state.busy || !running || !!selectionActive}
                            onClick={() => void controller.act("home")}
                        >
                            <Home size={17} />
                        </SystemButton>
                    )}
                    {can("rotate") && (
                        <SystemButton
                            size="small"
                            aria-label="Rotate device"
                            disabled={state.busy || !running || !!selectionActive}
                            onClick={() => {
                                void controller
                                    .act("rotate", {
                                        orientation: landscape ? "portrait" : "landscape-left",
                                    })
                                    .then(() => {
                                        if (!controller.state.error) setLandscape(!landscape);
                                    });
                            }}
                        >
                            <RotateCw size={17} />
                        </SystemButton>
                    )}
                    {state.session && (
                        <SystemButton size="small" onClick={() => controller.disconnect()}>
                            Disconnect
                        </SystemButton>
                    )}

                    {can("back") && (
                        <SystemButton
                            size="small"
                            aria-label="Back"
                            disabled={state.busy || !running || !!selectionActive}
                            onClick={() => void controller.act("back")}
                        >
                            <ArrowLeft size={17} />
                        </SystemButton>
                    )}
                    {can("type") && (
                        <SystemButton
                            size="small"
                            aria-label="Show keyboard"
                            aria-expanded={keyboardOpen}
                            disabled={state.busy || !running || !!selectionActive}
                            onClick={() => setKeyboardOpen(!keyboardOpen)}
                        >
                            <Keyboard size={17} />
                        </SystemButton>
                    )}
                    {can("screenshot") && (
                        <SystemButton
                            size="small"
                            aria-label="Capture screen"
                            disabled={state.busy || !running || !!selectionActive}
                            onClick={() => void controller.act("screenshot")}
                        >
                            <Camera size={17} />
                        </SystemButton>
                    )}
                    {can("open") && (
                        <SystemButton
                            size="small"
                            aria-label="Open in Simulator"
                            disabled={state.busy}
                            onClick={() => void controller.act("open")}
                        >
                            <ExternalLink size={17} />
                        </SystemButton>
                    )}
                </div>
            )}
            {keyboardOpen && target && !selectionActive && (
                <form
                    className="kt-computers-keyboard"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (text && running && !state.busy) void controller.act("type", { text });
                    }}
                >
                    <input
                        aria-label="Text to type into device"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="Type into device"
                        disabled={state.busy || !running || !!selectionActive}
                        autoFocus
                    />
                    <SystemButton type="submit" size="small" disabled={state.busy || !running || !text}>
                        Send
                    </SystemButton>
                </form>
            )}
            {!compact && (
                <details className="kt-computers-setup">
                    <summary className="cursor-pointer">
                        Device setup <span>Labs</span>
                    </summary>
                    <p>
                        iOS simulators need Xcode and an installed runtime. Android emulators need the Android SDK.
                        Physical iPhone control can connect to a local Appium session using KRONTERM_APPIUM_URL.
                        Physical iPhones require a signed WebDriverAgent.
                    </p>
                </details>
            )}
        </SystemMaterial>
    );
}

export function ComputersView({ model, contentRef }: ViewComponentProps<ComputersViewModel>) {
    const state = useAtomValue(model.stateAtom);
    return (
        <div ref={contentRef} className="kt-computers-host">
            <ComputersPanel state={state} controller={model.controller} />
        </div>
    );
}
