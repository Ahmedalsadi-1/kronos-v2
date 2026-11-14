// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AppIcon } from "@/app/components/app-icon";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { Plus, X } from "@/app/components/system-ui/os-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
    addOSDockPin,
    makeUrlDockPin,
    moveOSDockPin,
    normalizeDockUrl,
    removeOSDockPin,
    type OSDockPin,
} from "./os-desktop-model";
import "./os-desktop.scss";

export type OSDesktopWindow = {
    blockId: string;
    title: string;
    subtitle: string;
    icon?: string;
    active: boolean;
    minimized: boolean;
    agentLabel?: string;
};

export type OSDesktopInstalledApp = { id: string; name: string; icon?: string };

function PinIcon({ pin, installedApps }: { pin: OSDockPin; installedApps: OSDesktopInstalledApp[] }) {
    const [faviconFailed, setFaviconFailed] = useState(false);
    if (pin.kind === "app") {
        const icon = installedApps.find((app) => app.id === pin.appId)?.icon ?? pin.icon;
        return <AppIcon icon={icon} />;
    }
    if (!faviconFailed) {
        return (
            <img
                src={`${new URL(pin.url).origin}/favicon.ico`}
                alt=""
                draggable={false}
                onError={() => setFaviconFailed(true)}
            />
        );
    }
    return <span className="os-side-dock-letter">{pin.name.charAt(0)}</span>;
}

const AddPinPopover = memo(
    ({
        installedApps,
        onAdd,
        onClose,
    }: {
        installedApps: OSDesktopInstalledApp[];
        onAdd: (pin: OSDockPin) => void;
        onClose: () => void;
    }) => {
        const [query, setQuery] = useState("");
        const [name, setName] = useState("");
        const inputRef = useRef<HTMLInputElement>(null);
        const url = normalizeDockUrl(query);
        const matches = useMemo(() => {
            const normalized = query.trim().toLowerCase();
            return installedApps
                .filter((app) => !normalized || app.name.toLowerCase().includes(normalized))
                .slice(0, 6);
        }, [installedApps, query]);
        useEffect(() => {
            inputRef.current?.focus();
            const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
            window.addEventListener("keydown", onKey);
            return () => window.removeEventListener("keydown", onKey);
        }, [onClose]);
        return (
            <div className="os-side-dock-popover" role="dialog" aria-label="Add a quick link or app">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (url) onAdd(makeUrlDockPin(url, name.trim()));
                        else if (matches[0]) {
                            onAdd({
                                id: `app:${matches[0].id}`,
                                kind: "app",
                                name: matches[0].name,
                                appId: matches[0].id,
                            });
                        }
                    }}
                >
                    <h2>Add a quick link or app</h2>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Website or app name"
                        aria-label="Website address or application name"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {url && (
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Link name (optional)"
                            aria-label="Quick link name"
                        />
                    )}
                    <button type="submit" className="os-side-dock-save" disabled={!url && matches.length === 0}>
                        {url ? "Add quick link" : "Pin app"}
                    </button>
                </form>
                <ul>
                    {url && (
                        <li>
                            <button type="button" onClick={() => onAdd(makeUrlDockPin(url, name.trim()))}>
                                <span className="os-side-dock-letter">{new URL(url).hostname.charAt(0)}</span>
                                <span>Add {new URL(url).hostname}</span>
                            </button>
                        </li>
                    )}
                    {matches.map((app) => (
                        <li key={app.id}>
                            <button
                                type="button"
                                onClick={() =>
                                    onAdd({ id: `app:${app.id}`, kind: "app", name: app.name, appId: app.id })
                                }
                            >
                                <AppIcon icon={app.icon} />
                                <span>{app.name}</span>
                            </button>
                        </li>
                    ))}
                    {!url && matches.length === 0 && <li className="os-side-dock-empty">Type a website address</li>}
                </ul>
            </div>
        );
    }
);
AddPinPopover.displayName = "AddPinPopover";

const SideDock = memo(
    ({
        pins,
        installedApps,
        onLaunch,
        onPinsChange,
    }: {
        pins: OSDockPin[];
        installedApps: OSDesktopInstalledApp[];
        onLaunch: (pin: OSDockPin) => void;
        onPinsChange: (pins: OSDockPin[]) => void;
    }) => {
        const [adding, setAdding] = useState(false);
        return (
            <nav className="os-desktop-widget os-side-dock" aria-label="Quick links and pinned apps">
                <ul>
                    {pins.map((pin, index) => (
                        <li key={pin.id}>
                            <button
                                type="button"
                                title={pin.name}
                                aria-label={`Open ${pin.name}`}
                                onClick={() => onLaunch(pin)}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    ContextMenuModel.getInstance().showContextMenu(
                                        [
                                            { label: `Open ${pin.name}`, click: () => onLaunch(pin) },
                                            { type: "separator" },
                                            {
                                                label: "Move Up",
                                                enabled: index > 0,
                                                click: () => onPinsChange(moveOSDockPin(pins, pin.id, -1)),
                                            },
                                            {
                                                label: "Move Down",
                                                enabled: index < pins.length - 1,
                                                click: () => onPinsChange(moveOSDockPin(pins, pin.id, 1)),
                                            },
                                            { type: "separator" },
                                            {
                                                label: "Remove from Dock",
                                                click: () => onPinsChange(removeOSDockPin(pins, pin.id)),
                                            },
                                        ],
                                        event
                                    );
                                }}
                            >
                                <span className="os-side-dock-icon" aria-hidden="true">
                                    <PinIcon pin={pin} installedApps={installedApps} />
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    className="os-side-dock-add"
                    onClick={() => setAdding((open) => !open)}
                    aria-label={adding ? "Close" : "Add a quick link or app"}
                    aria-expanded={adding}
                    title="Add a quick link or app"
                >
                    {adding ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
                </button>
                {adding && (
                    <AddPinPopover
                        installedApps={installedApps}
                        onClose={() => setAdding(false)}
                        onAdd={(pin) => {
                            onPinsChange(addOSDockPin(pins, pin));
                            setAdding(false);
                        }}
                    />
                )}
            </nav>
        );
    }
);
SideDock.displayName = "SideDock";

export type OSDesktopLayerProps = {
    windows: OSDesktopWindow[];
    pins: OSDockPin[];
    installedApps: OSDesktopInstalledApp[];
    userName?: string;
    onFocusWindow: (blockId: string) => void;
    onAskKronos: (text: string) => void;
    onOpenKronos: () => void;
    onLaunchPin: (pin: OSDockPin) => void;
    onPinsChange: (pins: OSDockPin[]) => void;
};

/**
 * The desktop itself: glanceable widgets that sit behind every window, like a
 * system desktop. Windows cover them; they never float over app content.
 */
export const OSDesktopLayer = memo((props: OSDesktopLayerProps) => (
    <div className="os-desktop-layer">
        <div className="os-desktop-column is-trailing">
            {props.windows.some((window) => window.minimized) && (
                <div className="os-desktop-widget os-minimized-apps" aria-label="Minimized applications">
                    {props.windows
                        .filter((window) => window.minimized)
                        .map((window) => (
                            <button
                                type="button"
                                key={window.blockId}
                                onClick={() => props.onFocusWindow(window.blockId)}
                                aria-label={`Restore ${window.title}`}
                                title={`Restore ${window.title}`}
                            >
                                <AppIcon icon={window.icon} />
                            </button>
                        ))}
                </div>
            )}
        </div>
    </div>
));
OSDesktopLayer.displayName = "OSDesktopLayer";

/**
 * Screen space the widget columns reserve so arranged windows land beside them.
 * Mirrors the breakpoints in os-desktop.scss.
 */
export function osDesktopInsetsForWidth(width: number, enabled: boolean): { left: number; right: number } {
    if (!enabled || width <= 900) return { left: 0, right: 0 };
    return { left: 0, right: width <= 1180 ? 84 : 96 };
}
