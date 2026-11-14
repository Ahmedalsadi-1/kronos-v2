// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { SystemAppearanceContext } from "@/app/components/system-ui";
import { OSModeShell } from "@/app/tab/os-workspace";
import { KronSettingsDiagnostics } from "@/app/view/kronsettings/kronsettings-diagnostics";
import "@/app/view/kronsettings/kronsettings.scss";
import { systemMaterialVariables } from "@/types/system-materials";
import { useState } from "react";

export function KronOSReleasePreview() {
    const [appearance, setAppearance] = useState<SystemAppearanceSnapshot>({
        colorScheme: "dark",
        contrast: "normal",
        reducedMotion: false,
        reducedTransparency: false,
    });
    const [workspace, setWorkspace] = useState("space-1");
    const [workspaces, setWorkspaces] = useState(
        Array.from({ length: 8 }, (_, index) => ({ id: `space-${index + 1}`, name: `Project ${index + 1}` }))
    );
    const [feedback, setFeedback] = useState("Production shell and diagnostics with simulated workspace actions.");
    const [view, setView] = useState<"file" | "canvas">("canvas");
    const [scene, setScene] = useState<"freeform" | "focused" | "overview">("focused");
    return (
        <SystemAppearanceContext.Provider value={appearance}>
            <div
                className="kt-system-ui"
                data-color-scheme={appearance.colorScheme}
                data-reduced-motion={appearance.reducedMotion || undefined}
                data-reduced-transparency={appearance.reducedTransparency || undefined}
                style={{ ...systemMaterialVariables(appearance), position: "absolute", inset: "40px 0 0" }}
            >
                <div className="os-mode-root">
                    <OSModeShell
                        workspaces={workspaces}
                        currentWorkspaceId={workspace}
                        blocks={[]}
                        collapsedIds={[]}
                        showCollapsedDock={false}
                        sceneKind={scene}
                        activeBlockId={undefined}
                        osView={view}
                        onSetOSView={(next) => {
                            setView(next);
                            setFeedback(`Switched to ${next}`);
                        }}
                        onFocusApp={() => setScene("focused")}
                        onWorkspace={setWorkspace}
                        onCreateWorkspace={() =>
                            setWorkspaces((current) => [
                                ...current,
                                { id: `space-${current.length + 1}`, name: `Project ${current.length + 1}` },
                            ])
                        }
                        onRestore={() => {}}
                        onPinResource={() => setFeedback("Resource pinned")}
                        onOverview={() => {
                            setScene("overview");
                            setFeedback("Overview opened");
                        }}
                        onFreeform={() => {
                            setScene("freeform");
                            setFeedback("Freeform canvas opened");
                        }}
                    />
                    <main
                        className="kron-settings"
                        style={{
                            position: "absolute",
                            inset: "80px 24px 24px",
                            overflow: "auto",
                            display: "block",
                            background: "var(--kt-content)",
                            color: "var(--kt-label)",
                            padding: 24,
                        }}
                    >
                        <div className="flex flex-wrap gap-3 mb-6">
                            <button
                                className="kt-system-button is-regular"
                                onClick={() =>
                                    setAppearance((value) => ({
                                        ...value,
                                        colorScheme: value.colorScheme === "dark" ? "light" : "dark",
                                    }))
                                }
                            >
                                Toggle appearance
                            </button>
                            <button
                                className="kt-system-button is-regular"
                                onClick={() =>
                                    setAppearance((value) => ({
                                        ...value,
                                        contrast: value.contrast === "normal" ? "high" : "normal",
                                        reducedMotion: !value.reducedMotion,
                                        reducedTransparency: !value.reducedTransparency,
                                    }))
                                }
                            >
                                Toggle accessibility
                            </button>
                            <output role="status">{feedback}</output>
                        </div>
                        <div style={{ maxWidth: 820, margin: "0 auto" }}>
                            <h1 className="text-2xl font-semibold mb-6">KronOS support</h1>
                            <KronSettingsDiagnostics />
                        </div>
                    </main>
                </div>
            </div>
        </SystemAppearanceContext.Provider>
    );
}
