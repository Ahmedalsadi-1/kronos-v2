// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import "@/app/components/system-ui/system-ui.css";
import { OSNativeTaskGroups } from "@/app/tab/os-native-task-groups";
import { OSSpaceOverview } from "@/app/tab/os-space-overview";
import {
    computeOSWindowLayout,
    makeInitialOSModeState,
    reduceOSModeState,
    type OSModeState,
} from "@/app/tab/os-workspace-model";
import "@/app/tab/os-workspace.scss";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const Titles = { browser: "Browser", terminal: "Terminal", files: "Files" };

function initialState(id: string): OSModeState {
    let state = makeInitialOSModeState(
        { oid: id, blockids: Object.keys(Titles), meta: {} } as Tab,
        Object.keys(Titles)
    );
    state = reduceOSModeState(state, { type: "spatial.freeform" });
    state = reduceOSModeState(state, { type: "spatial.collapse", blockId: "files" });
    return reduceOSModeState(state, { type: "os.window.overview" });
}

export function OSOverviewPreview() {
    const [theme, setTheme] = useState(() => new URLSearchParams(location.search).get("theme") || "light");
    const [spaces, setSpaces] = useState(
        [
            "Research",
            "Development",
            "Organize",
            "Scraping",
            "Koda",
            "Website",
            "Notes",
            "Design",
            "Build",
            "Testing",
            "Docs",
            "Personal",
            "Archive",
        ].map((name, index) => ({ id: `space-${index + 1}`, name }))
    );
    const [active, setActive] = useState("space-2");
    const [states, setStates] = useState<Record<string, OSModeState>>(() =>
        Object.fromEntries(spaces.map((space) => [space.id, initialState(space.id)]))
    );
    const [viewport, setViewport] = useState({ width: 1440, height: 852 });
    const root = useRef<HTMLDivElement>(null);
    const state = states[active];
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => {
            setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(root.current);
        return () => observer.disconnect();
    }, []);
    const update = (next: OSModeState) => setStates((current) => ({ ...current, [active]: next }));
    return (
        <div
            ref={root}
            className="kt-system-ui os-mode-root"
            data-color-scheme={theme}
            data-reduced-transparency="true"
            data-reduced-motion="true"
            style={
                {
                    position: "fixed",
                    top: 48,
                    background: "var(--kt-content)",
                    color: "var(--kt-label)",
                    "--accent-color": "#8b5cf6",
                } as CSSProperties
            }
        >
            <header
                style={{
                    position: "absolute",
                    inset: "0 0 auto",
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "0 24px",
                    background: "var(--kt-bar)",
                }}
            >
                <strong>KronOS</strong>
                <OSNativeTaskGroups />
                <span>OS overview component preview · sample windows</span>
                <label style={{ marginLeft: "auto" }}>
                    Appearance{" "}
                    <select aria-label="Appearance" value={theme} onChange={(event) => setTheme(event.target.value)}>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </label>
                <button
                    type="button"
                    style={{ cursor: "pointer", minHeight: 32 }}
                    onClick={() => update(reduceOSModeState(state, { type: "os.window.overview" }))}
                >
                    Show overview
                </button>
                <button
                    type="button"
                    style={{ cursor: "pointer", minHeight: 32 }}
                    onClick={() => update(reduceOSModeState(state, { type: "spatial.restoreScene" }))}
                >
                    Exit overview
                </button>
            </header>
            {state.scene.kind === "overview" && (
                <OSSpaceOverview
                    workspaces={spaces}
                    currentWorkspaceId={active}
                    state={state}
                    blocks={[
                        { blockId: "browser", title: "Browser", icon: "view:web" },
                        { blockId: "terminal", title: "Terminal", icon: "view:term" },
                        { blockId: "files", title: "Files", icon: "view:preview" },
                    ]}
                    onSwitch={setActive}
                    onDelete={(id) => {
                        if (spaces.length < 2) return;
                        const remaining = spaces.filter((space) => space.id !== id);
                        setSpaces(remaining);
                        if (active === id) setActive(remaining[0].id);
                    }}
                    onCreate={() => {
                        const id = `space-${spaces.length + 1}`;
                        setSpaces((current) => [...current, { id, name: `Workspace ${current.length + 1}` }]);
                        setStates((current) => ({ ...current, [id]: initialState(id) }));
                        setActive(id);
                    }}
                />
            )}
            {state.zOrder.map((id) => {
                const layout = computeOSWindowLayout(state, id, id === "browser" ? "web" : id, viewport);
                if (!layout.opacity) return null;
                return (
                    <section
                        key={id}
                        aria-label={`${Titles[id]} preview window`}
                        style={{
                            position: "absolute",
                            left: layout.bounds.x,
                            top: layout.bounds.y,
                            width: layout.bounds.width,
                            height: layout.bounds.height,
                            zIndex: layout.zIndex,
                            overflow: "hidden",
                            border: "1px solid var(--kt-separator)",
                            borderRadius: 14,
                            background: "var(--kt-content)",
                            boxShadow: "var(--kt-shadow-window)",
                        }}
                    >
                        <header style={{ padding: 12, borderBottom: "1px solid var(--kt-separator)" }}>
                            <strong>{Titles[id]}</strong> · sample content
                        </header>
                        <div style={{ padding: 24 }}>
                            <p>
                                {id === "files"
                                    ? "Minimized window included in overview"
                                    : "Persistent window layout preview"}
                            </p>
                            <p>Space: {spaces.find((space) => space.id === active)?.name}</p>
                            {id === "files" && (
                                <button
                                    type="button"
                                    style={{ cursor: "pointer", minHeight: 32 }}
                                    onClick={() =>
                                        update(reduceOSModeState(state, { type: "os.window.focus", blockId: id }))
                                    }
                                >
                                    Restore Files
                                </button>
                            )}
                        </div>
                    </section>
                );
            })}
            <p role="status" style={{ position: "absolute", bottom: 12, left: 24, fontSize: 12 }}>
                {state.scene.kind === "overview" ? "Flat overview" : "Desktop"} · Files{" "}
                {state.windows.files.collapsed ? "minimized" : "restored"} · {spaces.length} spaces
            </p>
        </div>
    );
}
