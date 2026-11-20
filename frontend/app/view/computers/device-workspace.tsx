// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import { WaveEnvContext } from "@/app/waveenv/waveenv";
import { getApi } from "@/store/global";
import type { ComputerTarget, ComputerTargetAction } from "@/types/computer-targets";
import {
    Camera,
    Home,
    Maximize2,
    LoaderCircle,
    Minus,
    Power,
    RefreshCw,
    RotateCw,
    Settings2,
    SlidersHorizontal,
    Smartphone,
    Volume2,
    X,
} from "lucide-react";
import { useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ComputersPanel } from "./computers";
import { ComputersController, type ComputersApi, type ComputersState } from "./computers-state";
import {
    CompactDeviceBlocksAtom,
    DeviceWorkspaceSelectionContext,
    SingleDeviceWorkspaceWidth,
} from "./device-workspace-layout";
import "./device-workspace.css";
import { PhoneFrame } from "./phone-frame";

export function DeviceWorkspace({
    state,
    controller,
    preferredPlatform = "ios",
    initialTargetId,
    blockId,
    onCloseWidget,
    sidePanel = false,
    api = getApi(),
}: {
    state: ComputersState;
    controller: ComputersController;
    preferredPlatform?: "ios" | "android";
    initialTargetId?: string;
    blockId?: string;
    onCloseWidget?: () => void;
    sidePanel?: boolean;
    api?: ComputersApi;
}) {
    const env = useContext(WaveEnvContext);
    const [windowState, setWindowState] = useState<"normal" | "minimized" | "maximized">("normal");
    const [mode, setMode] = useState<"single" | "farm">("single");
    useEffect(() => {
        if (!blockId || sidePanel || mode !== "single") return;
        globalStore.set(CompactDeviceBlocksAtom, (ids) => new Set(ids).add(blockId));
        return () => {
            globalStore.set(CompactDeviceBlocksAtom, (ids) => {
                const next = new Set(ids);
                next.delete(blockId);
                return next;
            });
        };
    }, [blockId, mode, sidePanel]);
    const [selected, setSelected] = useState(initialTargetId ?? "");
    const [settings, setSettings] = useState(false);
    const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
    const [query, setQuery] = useState("");
    const [farmSize, setFarmSize] = useState<number>(() => {
        try {
            const saved = Number(window.localStorage.getItem("kronterm:device-farm-size"));
            return Number.isSafeInteger(saved) && saved > 0 ? saved : null;
        } catch {
            return null;
        }
    });
    const [closedTargets, setClosedTargets] = useState<string[]>([]);
    const choose = (id: string) => {
        setClosedTargets((ids) => ids.filter((item) => item !== id));
        setSelected(id);
    };
    const targets = sidePanel
        ? state.targets.filter((target) =>
              preferredPlatform === "android"
                  ? target.kind === "android-emulator"
                  : target.kind === "ios-simulator" && /^iPhone\b/i.test(target.name)
          )
        : state.targets;
    const openTargets = targets.filter((target) => !closedTargets.includes(target.id));
    const preferred = openTargets.filter((target) => target.kind.startsWith(preferredPlatform));
    const iphones = preferred.filter((target) => /^iPhone\b/i.test(target.name));
    const candidates = preferredPlatform === "ios" && iphones.length ? iphones : preferred;
    const defaultTarget = candidates.find((target) => ["booted", "connected"].includes(target.status)) ?? candidates[0];
    const selectedId = openTargets.some((target) => target.id === selected)
        ? selected
        : (defaultTarget?.id ?? openTargets[0]?.id);
    const reportSelection = useContext(DeviceWorkspaceSelectionContext);
    const selectedTarget = targets.find(({ id }) => id === selectedId);
    useEffect(() => {
        reportSelection?.(selectedTarget ?? null);
        return () => reportSelection?.(null);
    }, [reportSelection, selectedTarget]);
    useEffect(() => {
        const refresh = () => {
            if (!document.hidden) void controller.refresh();
        };
        const timer = setInterval(refresh, 5000);
        window.addEventListener("focus", refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", refresh);
        };
    }, [controller]);
    const rank = (target: ComputerTarget) =>
        (target.id === selectedId ? -100 : 0) +
        (/^iPad\b/i.test(target.name) ? 10 : 0) +
        (["booted", "connected"].includes(target.status) ? -1 : 0);
    const orderedTargets = [...targets].sort((a, b) => rank(a) - rank(b));
    const farmTargets = orderedTargets
        .filter(
            (target) =>
                !closedTargets.includes(target.id) &&
                `${target.name} ${target.runtime}`.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, farmSize ?? targets.length);
    const showWindowMenu = (event: MouseEvent) => {
        const menu: ContextMenuItem[] = [
            {
                label: windowState === "minimized" ? "Restore Window" : "Minimize Window",
                click: () => setWindowState(windowState === "minimized" ? "normal" : "minimized"),
            },
            {
                label: windowState === "maximized" ? "Restore Window Size" : "Maximize Window",
                click: () => setWindowState(windowState === "maximized" ? "normal" : "maximized"),
            },
        ];
        if (env) env.showContextMenu(menu, event);
        else ContextMenuModel.getInstance().showContextMenu(menu, event);
    };
    return (
        <div
            className={sidePanel ? "kt-device-workspace-host is-side-panel" : "kt-device-workspace-host"}
            style={{ "--device-single-width": SingleDeviceWorkspaceWidth } as CSSProperties}
        >
            <section
                className={`kt-device-workspace is-${mode} window-${windowState}${settings ? " has-settings" : ""}`}
                aria-label="Device workspace"
            >
                {!sidePanel && (
                    <header className="kt-device-workspace-titlebar" data-os-window-drag="">
                        <SystemButton
                            size="small"
                            data-device-window-menu=""
                            aria-label="Devices window menu"
                            aria-haspopup="menu"
                            onClick={showWindowMenu}
                        >
                            Devices
                        </SystemButton>
                        <SystemButton
                            size="small"
                            data-device-window-close=""
                            aria-label="Close device workspace"
                            onClick={() => {
                                if (onCloseWidget) onCloseWidget();
                                else setWindowState("minimized");
                            }}
                        >
                            <X size={16} />
                        </SystemButton>
                    </header>
                )}
                <div className="kt-device-workspace-bar">
                    <label>
                        <span className="sr-only">Device list</span>
                        <select
                            aria-label="Device list"
                            value={selectedId ?? ""}
                            onChange={(event) => choose(event.target.value)}
                        >
                            {!selectedId && (
                                <option value="" disabled>
                                    {targets.length ? "Choose a device" : "No devices"}
                                </option>
                            )}
                            {targets.map((target) => (
                                <option key={target.id} value={target.id}>
                                    {target.name} · {target.kind.startsWith("android") ? "Android" : "iPhone"} ·{" "}
                                    {target.status}
                                </option>
                            ))}
                        </select>
                    </label>
                    {mode === "farm" && (
                        <label className="kt-device-farm-size">
                            Phones
                            <input
                                aria-label="Farm size"
                                type="number"
                                min={1}
                                max={Math.max(1, targets.length)}
                                value={Math.min(farmSize ?? targets.length, targets.length) || 1}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (!Number.isSafeInteger(value) || value < 1) return;
                                    const next = Math.min(value, targets.length || 1);
                                    setFarmSize(next);
                                    try {
                                        window.localStorage.setItem("kronterm:device-farm-size", String(next));
                                    } catch {
                                        /* Storage can be disabled in embedded views. */
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    setFarmSize(null);
                                    try {
                                        window.localStorage.removeItem("kronterm:device-farm-size");
                                    } catch {}
                                }}
                            >
                                All
                            </button>
                        </label>
                    )}
                    {mode === "farm" && (
                        <input
                            aria-label="Search devices"
                            placeholder="Search devices…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    )}
                    {!sidePanel && (
                        <div role="group" aria-label="Device presentation">
                            {(["single", "farm"] as const).map((value) => (
                                <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
                                    {value === "single" ? "Single" : "Farm"}
                                </button>
                            ))}
                        </div>
                    )}
                    {sidePanel ? (
                        <div
                            ref={setToolbar}
                            className="kt-device-panel-tools"
                            role="group"
                            aria-label="Device controls"
                        />
                    ) : (
                        <button
                            aria-label="Refresh devices"
                            disabled={state.loading}
                            onClick={() => void controller.refresh()}
                        >
                            <RefreshCw size={15} />
                        </button>
                    )}
                </div>
                {sidePanel && (state.error || !targets.length) && (
                    <div className="kt-device-panel-empty" role={state.error ? "alert" : "status"}>
                        <span>
                            <Smartphone size={15} />
                        </span>
                        {state.error ||
                            (state.loading
                                ? "Finding devices…"
                                : preferredPlatform === "android"
                                  ? "No Android emulators found."
                                  : "No iPhone simulators found.")}
                        {!state.loading && <button onClick={() => void controller.refresh()}>Refresh devices</button>}
                    </div>
                )}
                {!sidePanel && state.error && (
                    <p role="alert" className="kt-device-discovery-error">
                        {state.error}
                    </p>
                )}
                {!sidePanel && !targets.length && (
                    <p role="status" className="kt-device-workspace-message">
                        {state.loading
                            ? "Finding devices…"
                            : "No devices found. Install a simulator runtime or connect a phone with debugging enabled."}
                    </p>
                )}
                <div className="kt-device-content">
                    <div className="kt-device-grid">
                        {orderedTargets.map((target) => (
                            <DeviceTile
                                key={target.id}
                                target={target}
                                api={api}
                                visible={
                                    windowState !== "minimized" &&
                                    !closedTargets.includes(target.id) &&
                                    (mode === "single"
                                        ? target.id === selectedId
                                        : farmTargets.some((item) => item.id === target.id))
                                }
                                selected={target.id === selectedId}
                                sidePanel={sidePanel}
                                toolbar={target.id === selectedId ? toolbar : null}
                                settings={settings && target.id === selectedId}
                                onSelect={() => setSelected(target.id)}
                                onSettings={() => {
                                    setSelected(target.id);
                                    setSettings(true);
                                }}
                                onCloseSettings={() => setSettings(false)}
                                onRefresh={() => void controller.refresh()}
                                targets={targets}
                                onChoose={choose}
                                onClose={() => {
                                    if (mode === "single" && onCloseWidget) onCloseWidget();
                                    else setClosedTargets((ids) => [...ids, target.id]);
                                }}
                            />
                        ))}
                    </div>
                </div>
                {sidePanel && (
                    <footer className="kt-device-panel-footer">
                        {preferredPlatform === "android" ? "Android" : "iOS"}
                    </footer>
                )}
            </section>
        </div>
    );
}

function DeviceTile({
    target,
    api,
    visible,
    selected,
    sidePanel,
    toolbar,
    settings,
    onSelect,
    onSettings,
    onCloseSettings,
    onRefresh,
    targets,
    onChoose,
    onClose,
}: {
    target: ComputerTarget;
    api: ComputersApi;
    visible: boolean;
    selected: boolean;
    sidePanel: boolean;
    toolbar: HTMLDivElement | null;
    settings: boolean;
    onSelect: () => void;
    onSettings: () => void;
    onCloseSettings: () => void;
    onRefresh: () => void;
    targets: ComputerTarget[];
    onChoose: (id: string) => void;
    onClose: () => void;
}) {
    const targetRef = useRef(target);
    targetRef.current = target;
    const [state, setState] = useState<ComputersState>({
        targets: [target],
        selectedId: target.id,
        loading: true,
        busy: false,
        error: "",
    });
    const [controller] = useState(
        () =>
            new ComputersController(
                { ...api, listComputerTargets: async () => ({ success: true, data: [targetRef.current] }) },
                setState
            )
    );
    const [landscape, setLandscape] = useState(false);
    const [minimized, setMinimized] = useState(false);

    const [expanded, setExpanded] = useState(false);
    const streaming = visible && !minimized;
    const running = target.status === "booted" || target.status === "connected";
    const can = (action: ComputerTargetAction["action"]) => target.capabilities.includes(action);
    useEffect(() => {
        void controller.refresh();
        return () => controller.dispose();
    }, [controller]);
    useEffect(() => {
        let active = true;
        void controller.refresh().then(() => {
            if (active && streaming && running) void controller.connect();
        });
        if (!streaming || !running) controller.disconnect();
        return () => {
            active = false;
        };
    }, [controller, streaming, running, target]);
    const autoStarted = useRef(new Set<string>());
    const [starting, setStarting] = useState(false);
    useEffect(() => {
        if (!streaming || !selected || target.status !== "shutdown" || !can("boot") ||
            !["android-emulator", "ios-simulator"].includes(target.kind) || autoStarted.current.has(target.id)) return;
        autoStarted.current.add(target.id);
        setStarting(true);
        void controller.refresh().then(() => controller.act("boot")).then(() => {
            onRefresh();
            if (!controller.state.error) void controller.connect();
        }).finally(() => setStarting(false));
    }, [controller, streaming, selected, target.id, target.status, target.kind]);
    const perform = async (action: ComputerTargetAction["action"], input = {}) => {
        await controller.act(action, input);
        onRefresh();
        if (action === "rotate" && !controller.state.error) setLandscape(!landscape);
        if (action === "boot" && ["booted", "connected"].includes(controller.state.targets[0]?.status))
            void controller.connect();
    };
    return (
        <article
            className={`kt-device-tile${expanded ? " is-expanded" : ""}`}
            hidden={!visible}
            data-selected={selected}
            aria-label={target.name}
        >
            {!sidePanel && (
                <header className="kt-device-titlebar">
                    <button
                        className="kt-device-identity"
                        onClick={() => {
                            setMinimized(false);
                            onSelect();
                        }}
                        aria-pressed={selected}
                    >
                        <span
                            className="kt-device-power-dot"
                            data-on={running}
                            role="img"
                            aria-label={
                                running ? "Powered on" : target.status === "unavailable" ? "Unavailable" : "Powered off"
                            }
                        />
                        <span>
                            <strong>{target.name}</strong>
                            <small>{target.runtime}</small>
                        </span>
                    </button>
                    <button aria-label={`Settings for ${target.name}`} aria-expanded={settings} onClick={onSettings}>
                        <Settings2 size={15} />
                    </button>
                </header>
            )}
            <div className="kt-device-live" hidden={minimized}>
                {state.snapshot?.imageDataUrl ? (
                    <ComputersPanel state={state} controller={controller} compact toolbarHost={toolbar} />
                ) : (
                    <PhoneFrame platform={target.kind.startsWith("android") ? "android" : "ios"}>
                        <div className="kt-device-offscreen">
                            {(starting || state.connecting || (running && !state.error)) ?
                                <LoaderCircle size={24} className="kt-device-starting-spinner" aria-hidden="true" /> :
                                <Smartphone size={28} aria-hidden="true" />}
                            <strong>{starting ? "Starting your phone" : state.connecting ? "Connecting to screen" :
                                running ? "Waiting for live screen" : target.status === "unavailable" ? "Device unavailable" : "Ready to start"}</strong>
                            <small>{target.name} · {target.runtime}</small>
                            {starting && <span role="status">The live screen will appear automatically.</span>}
                            {can("boot") && !running && !starting && (
                                <button disabled={state.busy} onClick={() => void perform("boot")}>
                                    Start device
                                </button>
                            )}
                            {running && !starting && (
                                <button disabled={state.connecting} onClick={() => void controller.connect()}>
                                    Open screen
                                </button>
                            )}
                        </div>
                    </PhoneFrame>
                )}
            </div>
            {sidePanel && (
                <button
                    className="kt-device-panel-settings"
                    aria-label={`Settings for ${target.name}`}
                    aria-expanded={settings}
                    onClick={settings ? onCloseSettings : onSettings}
                >
                    <SlidersHorizontal size={15} />
                </button>
            )}
            {target.availabilityReason && (
                <p role="status" className="kt-device-workspace-message">
                    {target.availabilityReason}
                </p>
            )}
            {state.error && (
                <p role="alert" className="kt-device-workspace-message">
                    {state.error}
                </p>
            )}
            {settings && (
                <aside
                    className="kt-device-settings"
                    aria-label={`Device settings for ${target.name}`}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onCloseSettings();
                    }}
                >
                    <header>
                        <strong>Device settings</strong>
                        <button aria-label="Close device settings" onClick={onCloseSettings}>
                            <X size={16} />
                        </button>
                    </header>
                    <label>
                        Device
                        <select value={target.id} onChange={(event) => onChoose(event.target.value)}>
                            {targets.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="kt-device-runtime">
                        <span>Runtime</span>
                        <span>{target.runtime || "Unknown"}</span>
                    </div>
                    <div className="kt-device-settings-actions" role="group" aria-label="Device tile controls">
                        <button
                            aria-label={`Close ${target.name}`}
                            onClick={() => {
                                onClose();
                                onCloseSettings();
                            }}
                        >
                            <X size={16} />
                            Close
                        </button>
                        <button
                            aria-label={`Minimize ${target.name}`}
                            aria-pressed={minimized}
                            onClick={() => setMinimized(!minimized)}
                        >
                            <Minus size={16} />
                            Minimize
                        </button>
                        <button
                            aria-label={`Expand ${target.name}`}
                            aria-pressed={expanded}
                            onClick={() => {
                                setMinimized(false);
                                setExpanded(!expanded);
                            }}
                        >
                            <Maximize2 size={16} />
                            Expand
                        </button>
                    </div>
                    <div className="kt-device-settings-actions">
                        {(
                            [
                                ["home", "Home", Home],
                                ["rotate", "Rotate", RotateCw],
                                ["screenshot", "Screenshot", Camera],
                            ] as const
                        ).map(
                            ([action, label, Icon]) =>
                                can(action) && (
                                    <button
                                        key={action}
                                        disabled={state.busy || !running}
                                        onClick={() =>
                                            void perform(
                                                action,
                                                action === "rotate"
                                                    ? { orientation: landscape ? "portrait" : "landscape-left" }
                                                    : {}
                                            )
                                        }
                                    >
                                        <Icon size={16} />
                                        {label}
                                    </button>
                                )
                        )}
                        {can("button") && (
                            <>
                                <button
                                    disabled={state.busy || !running}
                                    onClick={() => void perform("button", { button: "power" })}
                                >
                                    <Power size={16} />
                                    Lock
                                </button>
                                <button
                                    disabled={state.busy || !running}
                                    onClick={() => void perform("button", { button: "volume-up" })}
                                >
                                    <Volume2 size={16} />
                                    Volume +
                                </button>
                                <button
                                    disabled={state.busy || !running}
                                    onClick={() => void perform("button", { button: "volume-down" })}
                                >
                                    <Volume2 size={16} />
                                    Volume −
                                </button>
                            </>
                        )}
                    </div>
                    {can(running ? "shutdown" : "boot") && (
                        <button
                            className="kt-device-power-action"
                            disabled={state.busy}
                            onClick={() => void perform(running ? "shutdown" : "boot")}
                        >
                            <Power size={16} />
                            {running ? "Power off" : "Start device"}
                        </button>
                    )}
                    {(target.automationPaused || target.controlOwner === "agent") && (
                        <button
                            onClick={() =>
                                void controller.act(target.automationPaused ? "resume" : "takeover").then(onRefresh)
                            }
                            disabled={state.busy}
                        >
                            {target.automationPaused ? "Resume Kronos" : "Take control"}
                        </button>
                    )}
                    <p>Labs · {target.kind.includes("device") ? "Connected phone" : "Simulator"}</p>
                </aside>
            )}
        </article>
    );
}
