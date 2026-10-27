// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import type { ComputerTarget, ComputerTargetAction } from "@/types/computer-targets";
import { Camera, Home, Power, RefreshCw, RotateCw, Settings2, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ComputersPanel } from "./computers";
import { ComputersController, type ComputersApi, type ComputersState } from "./computers-state";
import "./device-workspace.css";
import { PhoneFrame } from "./phone-frame";

export function DeviceWorkspace({
    state,
    controller,
    preferredPlatform = "ios",
    api = getApi(),
}: {
    state: ComputersState;
    controller: ComputersController;
    preferredPlatform?: "ios" | "android";
    api?: ComputersApi;
}) {
    const [mode, setMode] = useState<"single" | "farm">("single");
    const [selected, setSelected] = useState("");
    const [settings, setSettings] = useState(false);
    const [query, setQuery] = useState("");
    const selectedId = state.targets.some((target) => target.id === selected)
        ? selected
        : (state.targets.find((target) => target.kind.startsWith(preferredPlatform))?.id ?? state.targets[0]?.id);
    return (
        <section
            className={`kt-device-workspace is-${mode}${settings ? " has-settings" : ""}`}
            aria-label="Device workspace"
        >
            <header className="kt-device-workspace-bar">
                <strong>{mode === "farm" ? "Device farm" : "Devices"}</strong>
                {mode === "farm" && (
                    <input
                        aria-label="Search devices"
                        placeholder="Search devices…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                )}
                <div role="group" aria-label="Device presentation">
                    {(["single", "farm"] as const).map((value) => (
                        <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
                            {value === "single" ? "Single" : "Farm"}
                        </button>
                    ))}
                </div>
                <button aria-label="Refresh devices" disabled={state.loading} onClick={() => void controller.refresh()}>
                    <RefreshCw size={15} />
                </button>
            </header>
            {state.error && (
                <p role="alert" className="kt-device-discovery-error">
                    {state.error}
                </p>
            )}
            {!state.targets.length && (
                <p role="status">
                    {state.loading
                        ? "Finding devices…"
                        : "No devices found. Install a simulator runtime or connect a phone with debugging enabled."}
                </p>
            )}
            <div className="kt-device-grid">
                {state.targets.map((target) => (
                    <DeviceTile
                        key={target.id}
                        target={target}
                        api={api}
                        visible={
                            mode === "single"
                                ? target.id === selectedId
                                : `${target.name} ${target.runtime}`.toLowerCase().includes(query.toLowerCase())
                        }
                        selected={target.id === selectedId}
                        settings={settings && target.id === selectedId}
                        onSelect={() => setSelected(target.id)}
                        onSettings={() => {
                            setSelected(target.id);
                            setSettings(true);
                        }}
                        onCloseSettings={() => setSettings(false)}
                        onRefresh={() => void controller.refresh()}
                        targets={state.targets}
                        onChoose={setSelected}
                    />
                ))}
            </div>
        </section>
    );
}

function DeviceTile({
    target,
    api,
    visible,
    selected,
    settings,
    onSelect,
    onSettings,
    onCloseSettings,
    onRefresh,
    targets,
    onChoose,
}: {
    target: ComputerTarget;
    api: ComputersApi;
    visible: boolean;
    selected: boolean;
    settings: boolean;
    onSelect: () => void;
    onSettings: () => void;
    onCloseSettings: () => void;
    onRefresh: () => void;
    targets: ComputerTarget[];
    onChoose: (id: string) => void;
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
    const running = target.status === "booted" || target.status === "connected";
    const can = (action: ComputerTargetAction["action"]) => target.capabilities.includes(action);
    useEffect(() => {
        void controller.refresh();
        return () => controller.dispose();
    }, [controller]);
    useEffect(() => {
        let active = true;
        void controller.refresh().then(() => {
            if (active && visible && running) void controller.connect();
        });
        if (!visible || !running) controller.disconnect();
        return () => {
            active = false;
        };
    }, [controller, visible, running, target.controlGeneration]);
    const perform = async (action: ComputerTargetAction["action"], input = {}) => {
        await controller.act(action, input);
        onRefresh();
        if (action === "boot" && ["booted", "connected"].includes(controller.state.targets[0]?.status))
            void controller.connect();
    };
    return (
        <article className="kt-device-tile" hidden={!visible} data-selected={selected} aria-label={target.name}>
            <header className="kt-device-titlebar">
                <button className="kt-device-identity" onClick={onSelect} aria-pressed={selected}>
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
            <div className="kt-device-live">
                {state.snapshot?.imageDataUrl ? (
                    <ComputersPanel state={state} controller={controller} compact />
                ) : (
                    <PhoneFrame platform={target.kind.startsWith("android") ? "android" : "ios"}>
                        <div className="kt-device-offscreen">
                            <span>
                                {state.connecting
                                    ? "Connecting…"
                                    : running
                                      ? "Screen ready"
                                      : target.status === "unavailable"
                                        ? "Unavailable"
                                        : "Powered off"}
                            </span>
                            {can("boot") && !running && (
                                <button disabled={state.busy} onClick={() => void perform("boot")}>
                                    Start device
                                </button>
                            )}
                            {running && (
                                <button disabled={state.connecting} onClick={() => void controller.connect()}>
                                    Open screen
                                </button>
                            )}
                        </div>
                    </PhoneFrame>
                )}
            </div>
            {state.error && <p role="alert">{state.error}</p>}
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
                                                action === "rotate" ? { orientation: "landscape-left" } : {}
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
                    <p>Labs · {target.kind.includes("device") ? "Connected phone" : "Simulator"}</p>
                </aside>
            )}
        </article>
    );
}
