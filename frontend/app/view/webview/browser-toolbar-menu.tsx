// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useId, useRef, useState, type CSSProperties } from "react";

export type BrowserDeviceProfile = "default" | "mobile:iphone" | "mobile:android";

export function BrowserToolbarMenu({
    deviceProfile,
    inspectMode = false,
    onInspect,
    onFind,
    onDevTools,
    onOpenExternal,
    onClearHistory,
    onClearSiteData,
    onCopyUrl,
    onDeviceProfileChange,
    onHardReload,
    onHome,
    onZoomChange,
    zoom,
    onAnnotate,
    onMarkup,
    onImportCookies,
    onSessionChange,
    sessionProfile = "default",
    onSettings,
    onResearch,
    companion = false,
    settingsPanel,
}: {
    deviceProfile: BrowserDeviceProfile;
    inspectMode?: boolean;
    onInspect?: () => void;
    onFind?: () => void;
    onDevTools?: () => void;
    onOpenExternal?: () => void;
    onClearHistory: () => void;
    onClearSiteData: () => void;
    onCopyUrl: () => void;
    onDeviceProfileChange: (profile: BrowserDeviceProfile) => void;
    onHardReload: () => void;
    onHome: () => void;
    onZoomChange: (zoom: number) => void;
    zoom: number;
    onAnnotate?: () => void;
    onMarkup?: () => void;
    onImportCookies?: () => void;
    onSessionChange?: (profile: string) => void;
    sessionProfile?: string;
    onSettings?: () => void;
    onResearch?: () => void;
    companion?: boolean;
    settingsPanel?: React.ReactNode;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [showSettings, setShowSettings] = useState(false);
    const menuId = useId();
    const anchorName = `--browser-menu-${menuId.replace(/[^a-zA-Z0-9-]/g, "")}`;
    const run = (action: () => void) => {
        action();
        menuRef.current?.hidePopover();
    };

    return (
        <div className="webview-toolbar-menu">
            <button
                type="button"
                popoverTarget={menuId}
                style={{ anchorName } as CSSProperties}
                aria-label="Browser menu"
                title="Browser menu"
            >
                <i className="fa-solid fa-ellipsis" aria-hidden="true" />
            </button>
            <div
                id={menuId}
                ref={menuRef}
                popover="auto"
                style={{ positionAnchor: anchorName } as CSSProperties}
                className="webview-toolbar-menu-popover"
                role="menu"
                aria-label="Browser tools"
                onToggle={(event) => {
                    if (event.newState === "closed") setShowSettings(false);
                }}
            >
                {showSettings ? (
                    <>
                        <button type="button" role="menuitem" onClick={() => setShowSettings(false)}>
                            ← Browser tools
                        </button>
                        <div className="webview-toolbar-menu-separator" />
                        {settingsPanel}
                        <div className="webview-toolbar-menu-separator" />
                        <div className="webview-toolbar-menu-label">General</div>
                        <button type="button" role="menuitem" onClick={() => onZoomChange(1)}>
                            Reset page zoom
                        </button>
                        <label className="webview-toolbar-menu-select">
                            <span>Device toolbar</span>
                            <select
                                value={deviceProfile}
                                aria-label="Device toolbar"
                                onChange={(event) => onDeviceProfileChange(event.target.value as BrowserDeviceProfile)}
                            >
                                <option value="default">Desktop</option>
                                <option value="mobile:iphone">iPhone</option>
                                <option value="mobile:android">Android</option>
                            </select>
                        </label>
                        <div className="webview-toolbar-menu-separator" />
                        <div className="webview-toolbar-menu-label">Privacy and browsing data</div>
                        {onSessionChange && (
                            <label className="webview-toolbar-menu-select">
                                <span>Session profile</span>
                                <select
                                    value={sessionProfile}
                                    aria-label="Session profile"
                                    onChange={(event) => run(() => onSessionChange(event.target.value))}
                                >
                                    <option value="default">Default</option>
                                    <option value="work">Work</option>
                                    <option value="personal">Personal</option>
                                    <option value="private">Private</option>
                                </select>
                            </label>
                        )}
                        {onImportCookies && (
                            <button type="button" role="menuitem" onClick={() => run(onImportCookies)}>
                                Import session cookies…
                            </button>
                        )}
                        <button type="button" role="menuitem" onClick={() => run(onClearHistory)}>
                            Clear history
                        </button>
                        <button type="button" role="menuitem" onClick={() => run(onClearSiteData)}>
                            Clear cookies and storage
                        </button>
                    </>
                ) : (
                    <>
                        <div className="webview-toolbar-overflow-actions">
                            {onInspect && (
                                <button type="button" role="menuitem" onClick={() => run(onInspect)}>
                                    <i className="fa-solid fa-crosshairs" aria-hidden="true" />
                                    {inspectMode ? "Stop browser element picker" : "Grab browser element"}
                                </button>
                            )}
                            {onResearch && (
                                <button type="button" role="menuitem" onClick={() => run(onResearch)}>
                                    Research notebook
                                </button>
                            )}
                            {onFind && (
                                <button type="button" role="menuitem" onClick={() => run(onFind)}>
                                    <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                                    Find in page
                                </button>
                            )}
                            {onAnnotate && (
                                <button type="button" role="menuitem" onClick={() => run(onAnnotate)}>
                                    Annotate browser element
                                </button>
                            )}
                            {onMarkup && (
                                <button type="button" role="menuitem" onClick={() => run(onMarkup)}>
                                    {companion ? "Take a screenshot" : "Screenshot markup"}
                                </button>
                            )}
                            {onDevTools && (
                                <button type="button" role="menuitem" onClick={() => run(onDevTools)}>
                                    <i className="fa-solid fa-square-code" aria-hidden="true" />
                                    Open browser DevTools
                                </button>
                            )}
                            {onOpenExternal && (
                                <button type="button" role="menuitem" onClick={() => run(onOpenExternal)}>
                                    <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                                    Open in external browser
                                </button>
                            )}
                            <div className="webview-toolbar-menu-separator" />
                        </div>
                        <button type="button" role="menuitem" onClick={() => run(onHome)}>
                            <i className="fa-solid fa-house" aria-hidden="true" />
                            Home
                        </button>
                        <button type="button" role="menuitem" onClick={() => run(onHardReload)}>
                            <i className="fa-solid fa-rotate" aria-hidden="true" />
                            Hard reload
                        </button>
                        <button type="button" role="menuitem" onClick={() => run(onCopyUrl)}>
                            <i className="fa-solid fa-link" aria-hidden="true" />
                            Copy page URL
                        </button>
                        <div className="webview-toolbar-menu-separator" />
                        <div className="webview-toolbar-menu-label">Zoom</div>
                        <div className="webview-toolbar-menu-row" role="group" aria-label="Page zoom">
                            <button
                                type="button"
                                onClick={() => onZoomChange(Math.max(0.5, zoom - 0.1))}
                                aria-label="Zoom out"
                            >
                                <i className="fa-solid fa-minus" aria-hidden="true" />
                            </button>
                            <output>{Math.round(zoom * 100)}%</output>
                            <button
                                type="button"
                                onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
                                aria-label="Zoom in"
                            >
                                <i className="fa-solid fa-plus" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => onZoomChange(1)} aria-label="Reset zoom">
                                Reset
                            </button>
                        </div>
                        <div className="webview-toolbar-menu-separator" />
                        <label className="webview-toolbar-menu-select">
                            <span>Device toolbar</span>
                            <select
                                value={deviceProfile}
                                onChange={(event) => onDeviceProfileChange(event.target.value as BrowserDeviceProfile)}
                                aria-label="Browser viewport profile"
                            >
                                <option value="default">Desktop</option>
                                <option value="mobile:iphone">iPhone</option>
                                <option value="mobile:android">Android</option>
                            </select>
                        </label>
                        <div className="webview-toolbar-menu-separator" />
                        {onSessionChange && (
                            <label className="webview-toolbar-menu-select">
                                <span>Session profile</span>
                                <select
                                    value={sessionProfile}
                                    aria-label="Browser session profile"
                                    onChange={(event) => {
                                        onSessionChange(event.target.value);
                                        menuRef.current?.hidePopover();
                                    }}
                                >
                                    <option value="default">Default</option>
                                    <option value="work">Work</option>
                                    <option value="personal">Personal</option>
                                    <option value="private">Private</option>
                                </select>
                            </label>
                        )}
                        {onImportCookies && (
                            <button type="button" role="menuitem" onClick={() => run(onImportCookies)}>
                                Import session cookies…
                            </button>
                        )}
                        {onSettings && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => (companion ? setShowSettings(true) : run(onSettings))}
                            >
                                Browser settings
                            </button>
                        )}
                        <div className="webview-toolbar-menu-separator" />
                        <button type="button" role="menuitem" onClick={() => run(onClearHistory)}>
                            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                            Clear history
                        </button>
                        <button type="button" role="menuitem" onClick={() => run(onClearSiteData)}>
                            <i className="fa-solid fa-broom" aria-hidden="true" />
                            Clear cookies and storage
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
