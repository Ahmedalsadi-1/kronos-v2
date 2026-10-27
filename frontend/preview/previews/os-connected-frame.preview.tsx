import Wallpaper from "@/app/asset/kronterm-os-wallpaper.png";
import "@/app/components/system-ui/system-ui.css";
import "@/app/tab/os-workspace.scss";
import { AgentPlan } from "@/app/workspace/agent-plan";
import { publishAgentActivity } from "@/types/agent-activity";
import "@hermes/app/contrib/kronterm-inspector.css";
import { useState } from "react";

export function OSConnectedFramePreview() {
    const [dark, setDark] = useState(true);
    const [compact, setCompact] = useState(true);
    const [step, setStep] = useState(0);
    const advance = () => {
        publishAgentActivity({
            id: "project",
            runid: "preview",
            blockid: "preview",
            source: "hermes",
            surface: "file",
            action: "inspect",
            detail: "Improve the workspace",
            phase: step > 2 ? "succeeded" : "running",
        });
        ["Read existing widgets", "Connect Hermes file explorer", "Verify device controls", "Run checks"].forEach(
            (detail, index) =>
                publishAgentActivity({
                    id: `task-${index}`,
                    parentid: "project",
                    runid: "preview",
                    blockid: "preview",
                    source: "hermes",
                    surface: "file",
                    action: "inspect",
                    detail,
                    phase: index < step ? "succeeded" : index === step ? "running" : "queued",
                })
        );
        setStep((step + 1) % 5);
    };
    return (
        <div className="kt-system-ui" data-color-scheme={dark ? "dark" : "light"} style={{ inset: "40px 0 0" }}>
            <div
                className={`os-mode-root has-agent-sidebar has-files-inspector ${compact ? "has-compact-inspector" : ""}`}
            >
                <img className="os-wallpaper-fallback" src={Wallpaper} alt="Mountain landscape" />
                <div
                    className="os-shell"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 24px",
                        color: "white",
                    }}
                >
                    <span>KronTerm　 1　 2　 3　 +</span>
                    <div className="kt-system-segmented">
                        <button className="kt-system-button is-small" onClick={advance}>
                            Advance agent
                        </button>
                        <button className="kt-system-button is-small" onClick={() => setDark(!dark)}>
                            Appearance
                        </button>
                        <button className="kt-system-button is-small" onClick={() => setCompact(!compact)}>
                            Files panel
                        </button>
                    </div>
                </div>
                <aside className="os-agent-sidebar">
                    <div className="h-full p-4 text-xs" style={{ color: "white" }}>
                        <strong>Hermes</strong>
                        <p className="py-4">New session</p>
                        <p className="py-2">Capabilities</p>
                        <p className="py-2">Bots</p>
                        <p className="py-2">Workflows</p>
                        <p className="py-6 opacity-60">Sessions</p>
                        <p>Improve the workspace</p>
                    </div>
                </aside>
                <aside className="os-files-inspector">
                    <div className="h-full min-h-0 text-xs" style={{ color: "white" }}>
                        {compact ? (
                            <div className="kronterm-inspector is-compact">
                                <div className="kronterm-inspector-tabbar">
                                    <div className="kronterm-inspector-tabs">
                                        <button
                                            className="kronterm-inspector-tool"
                                            aria-label="Open files"
                                            onClick={() => setCompact(false)}
                                        >
                                            ▤
                                        </button>
                                        <button
                                            className="kronterm-inspector-tool"
                                            aria-label="Switch appearance"
                                            onClick={() => setDark(!dark)}
                                        >
                                            ◐
                                        </button>
                                        <button
                                            className="kronterm-inspector-tool"
                                            aria-label="Advance agent plan"
                                            onClick={advance}
                                        >
                                            ≡
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <strong>Files</strong>
                                <p className="py-4">frontend / app</p>
                                <p className="py-2">workspace</p>
                                <p className="py-2">agent-plan.tsx</p>
                            </>
                        )}
                    </div>
                </aside>
                <AgentPlan blockIds={["preview"]} />
                <div
                    style={{
                        position: "absolute",
                        top: "42%",
                        left: "35%",
                        width: "36%",
                        padding: 24,
                        background: "var(--kt-content)",
                        borderRadius: 14,
                        color: "var(--kt-label)",
                    }}
                >
                    <h2 className="text-sm font-medium">Connected workspace preview</h2>
                    <p className="py-3 text-xs">
                        Drag files from Hermes onto the desktop. Images open in preview windows.
                    </p>
                    <div className="kt-system-segmented">
                        <button className="kt-system-button is-small is-selected">Editor</button>
                        <button className="kt-system-button is-small">Preview</button>
                        <button className="kt-system-button is-small">Changes</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
