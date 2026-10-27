// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import Wallpaper from "@/app/asset/kronterm-os-wallpaper.png";
import "@/app/components/system-ui/system-ui.css";
import { arrangeOSLaunchedWindows, makeInitialOSModeState, reconcileOSModeState } from "@/app/tab/os-workspace-model";
import { OSSpaceIdentities, OSWorkspaceSetup } from "@/app/tab/os-workspace-setup";
import "@/app/tab/os-workspace.scss";
import { useState } from "react";

export function OSLaunchPreview() {
    const [state, setState] = useState(() => makeInitialOSModeState({ oid: "preview", meta: {} } as Tab, []));
    const [setup, setSetup] = useState(false);
    const [identity, setIdentity] = useState<(typeof OSSpaceIdentities)[number]>();
    const [dark, setDark] = useState(false);
    return (
        <div
            className="kt-system-ui"
            data-color-scheme={dark ? "dark" : "light"}
            style={{ position: "absolute", inset: "40px 0 0" }}
        >
            <div className="os-mode-root">
                <img className="os-wallpaper-fallback" src={Wallpaper} alt="" />
                {identity && <div className="os-space-background" style={{ background: identity.background }} />}
                <div
                    className="os-shell"
                    style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        justifyContent: "space-between",
                        pointerEvents: "auto",
                    }}
                >
                    <button onClick={() => setSetup(true)}>New space</button>
                    <input
                        aria-label="Chat"
                        placeholder="Ask Kronos anything"
                        style={{ width: "36%", borderRadius: 12, padding: 8, background: "#efefed", color: "#222" }}
                    />
                    <div style={{ display: "flex", gap: 12 }}>
                        <button onClick={() => setDark(!dark)}>Appearance</button>
                        <button
                            onClick={() =>
                                setState((current) => {
                                    const ids = Object.keys(current.windows);
                                    return ids.length >= 2
                                        ? makeInitialOSModeState({ oid: "preview", meta: {} } as Tab, [])
                                        : arrangeOSLaunchedWindows(
                                              current,
                                              reconcileOSModeState(current, [...ids, `app-${ids.length + 1}`]),
                                              { width: innerWidth, height: innerHeight - 40 }
                                          );
                                })
                            }
                        >
                            Open app
                        </button>
                    </div>
                </div>
                <div className="os-mode-viewport">
                    {Object.values(state.windows).map((window, index) => (
                        <section
                            key={window.blockId}
                            className="os-window is-selected"
                            style={{
                                left: window.bounds.x,
                                top: window.bounds.y,
                                width: window.bounds.width,
                                height: window.bounds.height,
                                transition:
                                    "left 240ms cubic-bezier(0.2,0.82,0.2,1), width 240ms cubic-bezier(0.2,0.82,0.2,1)",
                                background: "var(--kt-content)",
                                color: "var(--kt-label)",
                            }}
                        >
                            <header
                                className="os-window-titlebar"
                                style={{ padding: 12, background: "var(--kt-content)", color: "var(--kt-label)" }}
                            >
                                {index === 0 ? "Research" : "Document"}
                            </header>
                            <div style={{ padding: 32 }}>
                                <h2 style={{ fontSize: 24, marginBottom: 20 }}>
                                    {index === 0 ? "Your research starts here." : "Turn your research into a document."}
                                </h2>
                                <p>This preview exercises window placement without mounting live sessions.</p>
                            </div>
                        </section>
                    ))}
                </div>
                {setup && (
                    <OSWorkspaceSetup
                        onClose={() => setSetup(false)}
                        onCreate={async (_name, selected) => {
                            setIdentity(selected);
                            setSetup(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
}
