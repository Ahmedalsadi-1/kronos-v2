import type { OrbState } from "orb-ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import "../../integrations/pen/shell-host.js";
import workspaceStyles from "../app/tab/os-pen-workspace-chrome.css?inline";
import { PenVoiceOrb } from "../hermes/app/contrib/pen-voice-orb";
function CanvasVoicePreview() {
    const [state, setState] = useState<OrbState>("listening");
    const [mount, setMount] = useState<HTMLElement>();
    const shell = useRef<any>(undefined);
    useEffect(() => {
        const slot = document.querySelector("[data-kronos-pen-composer-controls]") as any;
        slot.kronosControls = {};
        const runtime = (window as any).createKronosPenShell({ ipc: {} }, () => {}, document, {
            workspaceId: "voice-preview",
        });
        shell.current = runtime;
        slot.querySelector('[aria-label="Start voice conversation"]').click();
        runtime.updateComposerVoice({ conversationId: "voice-preview", active: true, phase: "listening" });
        setMount(document.querySelector<HTMLElement>("[data-kronos-pen-voice-orb]"));
        return () => runtime.dispose();
    }, []);
    useEffect(() => {
        shell.current?.updateComposerVoice({ conversationId: "voice-preview", active: true, phase: state });
    }, [state]);
    return (
        <main
            style={{
                height: "100svh",
                background: "#1e1e20",
                color: "#eee",
                fontFamily: "system-ui",
                overflow: "hidden",
            }}
        >
            <style>{workspaceStyles}</style>
            <header style={{ padding: 20, borderBottom: "1px solid #ffffff16" }}>KronOS · canvas voice layout</header>
            <div style={{ display: "flex", gap: 12, padding: 24 }}>
                {["listening", "thinking", "speaking", "connecting"].map((value) => (
                    <button key={value} onClick={() => setState(value as OrbState)}>
                        {value}
                    </button>
                ))}
            </div>
            <div style={{ padding: 24, color: "#aaa" }}>Layout preview only. Microphone stays off.</div>
            <div
                style={{
                    position: "absolute",
                    left: "25%",
                    top: "30%",
                    width: 240,
                    height: 160,
                    border: "1px solid #ffffff24",
                    borderRadius: 14,
                    padding: 24,
                }}
            >
                Browser surface
            </div>
            <div
                style={{
                    position: "absolute",
                    right: "15%",
                    top: "38%",
                    width: 220,
                    height: 160,
                    border: "1px solid #ffffff24",
                    borderRadius: 14,
                    padding: 24,
                }}
            >
                Canvas content
            </div>
            <div className="absolute">
                <div className="group">
                    <div className="relative" style={{ position: "absolute", bottom: 12, left: "50%" }}>
                        <div data-kronos-pen-composer-controls="voice-preview" />
                    </div>
                </div>
            </div>
            {mount &&
                createPortal(
                    <PenVoiceOrb
                        state={state}
                        inputVolume={state === "listening" ? 0.35 : 0}
                        outputVolume={state === "speaking" ? 0.6 : 0}
                    />,
                    mount
                )}
        </main>
    );
}
createRoot(document.getElementById("root")!).render(<CanvasVoicePreview />);
