// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, SystemUIProvider } from "@/app/components/system-ui";
import { ComputersPanel } from "@/app/view/computers/computers";
import { ComputersController, type ComputersState } from "@/app/view/computers/computers-state";
import { getApi } from "@/store/global";
import { useEffect, useState } from "react";
import type { ComputerTarget } from "../../types/computer-targets";

export function ComputersPreview() {
    const live = (window as Window & { __krontermLiveDevices?: boolean }).__krontermLiveDevices;
    return live ? <ComputersLivePreview /> : <ComputersMockPreview />;
}

function ComputersLivePreview() {
    const [scheme, setScheme] = useState("light");
    const [state, setState] = useState<ComputersState>({
        targets: [],
        selectedId: "",
        busy: false,
        loading: true,
        error: "",
    });
    const [controller, setController] = useState<ComputersController>();
    useEffect(() => {
        const runtime = new ComputersController(getApi(), setState);
        setController(runtime);
        void runtime.refresh();
        return () => runtime.dispose();
    }, []);
    return (
        <SystemUIProvider>
            <div
                className="kt-system-ui"
                data-color-scheme={scheme}
                style={{
                    top: 48,
                    height: "calc(100% - 48px)",
                    background: "var(--kt-content)",
                    color: "var(--kt-label)",
                }}
            >
                <div
                    style={{
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 12px",
                        gap: 12,
                        fontSize: 11,
                    }}
                >
                    <span>Dev · Live devices</span>
                    <SystemButton size="small" onClick={() => setScheme(scheme == "light" ? "dark" : "light")}>
                        Appearance
                    </SystemButton>
                </div>
                <div className="kt-computers-host" style={{ height: "calc(100% - 40px)" }}>
                    {controller && <ComputersPanel state={state} controller={controller} />}
                </div>
            </div>
        </SystemUIProvider>
    );
}

function ComputersMockPreview() {
    const [scheme, setScheme] = useState("light");
    const [state, setState] = useState<ComputersState>({
        targets: [],
        selectedId: "",
        busy: false,
        loading: false,
        error: "",
    });
    const [controller] = useState(() => {
        const targets: ComputerTarget[] = [
            {
                id: "preview-one",
                name: "iPhone 17 Pro",
                runtime: "iOS 26.0",
                kind: "ios-simulator",
                status: "booted",
                capabilities: ["boot", "shutdown", "open", "screenshot", "tap", "type", "swipe", "home", "rotate"],
                controlOwner: "user",
                controlGeneration: 0,
                labs: true,
            },
            {
                id: "preview-two",
                name: "iPad Air",
                runtime: "iOS 26.0",
                kind: "ios-simulator",
                status: "shutdown",
                capabilities: ["boot", "shutdown", "open", "screenshot"],
                controlOwner: "user",
                controlGeneration: 0,
                labs: true,
            },
        ];
        let sequence = 0;
        const sessions = new Map<string, ComputerTarget>();
        const mockScreen = () =>
            `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="480"><defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#91b5d4"/><stop offset="1" stop-color="#b5c7bb"/></linearGradient></defs><rect width="240" height="480" rx="28" fill="url(#wall)"/><rect x="83" y="10" width="74" height="20" rx="10" fill="#202329"/><text x="120" y="114" text-anchor="middle" font-family="sans-serif" font-size="43" fill="#fff">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text><text x="120" y="145" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#fff">Interactive preview</text><rect x="24" y="206" width="192" height="112" rx="18" fill="#ffffff" fill-opacity=".35"/><text x="120" y="260" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#263849">Mock simulator screen</text><text x="120" y="283" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#263849">Frame ${sequence}</text><rect x="77" y="464" width="86" height="4" rx="2" fill="#fff"/></svg>`)}`;
        const runtime = new ComputersController(
            {
                startComputerTargetSession: async (targetId, controlGeneration) => {
                    const target = targets.find((item) => item.id == targetId);
                    const id = `mock-${targetId}`;
                    sessions.set(id, target);
                    return { success: true, data: { id, targetId, controlGeneration, live: true } };
                },
                readComputerTargetFrame: async (sessionId) => {
                    ++sequence;
                    return {
                        success: true,
                        data: { sessionId, sequence, imageDataUrl: mockScreen(), capturedAt: Date.now() },
                    };
                },
                stopComputerTargetSession: async (sessionId) => {
                    sessions.delete(sessionId);
                    return { success: true, data: undefined };
                },
                listComputerTargets: async () => ({ success: true, data: targets.map((target) => ({ ...target })) }),
                performComputerTargetAction: async ({ targetId, action }) => {
                    const target = targets.find((item) => item.id == targetId);
                    if (action == "boot") target.status = "booted";
                    if (action == "shutdown") target.status = "shutdown";
                    const imageDataUrl =
                        action == "screenshot"
                            ? `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="420"><rect width="220" height="420" rx="24" fill="#e8edf4"/><text x="110" y="160" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#222">Preview capture</text><text x="110" y="190" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#444">Mock device screen</text></svg>')}`
                            : undefined;
                    return { success: true, data: { target: { ...target }, imageDataUrl, capturedAt: Date.now() } };
                },
                takeOverComputerTarget: async (id) => {
                    const target = targets.find((item) => item.id == id);
                    target.controlOwner = "user";
                    target.automationPaused = true;
                    ++target.controlGeneration;
                    return { success: true, data: { target: { ...target } } };
                },
                resumeComputerTarget: async (id) => {
                    const target = targets.find((item) => item.id == id);
                    target.automationPaused = false;
                    ++target.controlGeneration;
                    return { success: true, data: { target: { ...target } } };
                },
            },
            setState
        );
        return runtime;
    });
    useEffect(() => {
        void controller.refresh();
    }, [controller]);
    return (
        <SystemUIProvider>
            <div
                className="kt-system-ui"
                data-color-scheme={scheme}
                style={{
                    top: 48,
                    height: "calc(100% - 48px)",
                    background: "var(--kt-content)",
                    color: "var(--kt-label)",
                }}
            >
                <div style={{ height: 48, display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
                    <span>Simulator UI · mock preview</span>
                    <SystemButton onClick={() => setScheme(scheme == "light" ? "dark" : "light")}>
                        Toggle appearance
                    </SystemButton>
                    <SystemButton
                        onClick={() =>
                            setState({
                                ...controller.state,
                                error: "Preview: Xcode is unavailable. Install Xcode, then refresh.",
                            })
                        }
                    >
                        Show error
                    </SystemButton>
                </div>
                <div className="kt-computers-host" style={{ height: "calc(100% - 48px)" }}>
                    <ComputersPanel state={state} controller={controller} />
                </div>
            </div>
        </SystemUIProvider>
    );
}
