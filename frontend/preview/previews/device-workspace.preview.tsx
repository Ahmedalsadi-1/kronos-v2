// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import Wallpaper from "@/app/asset/kronterm-os-wallpaper.png";
import "@/app/components/system-ui/system-ui.css";
import { ComputersController, type ComputersApi, type ComputersState } from "@/app/view/computers/computers-state";
import { DeviceWorkspace } from "@/app/view/computers/device-workspace";
import type { ComputerTarget } from "@/types/computer-targets";
import { useEffect, useState } from "react";
const AndroidCapture =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="800"><rect width="360" height="800" fill="#173242"/><text x="180" y="380" text-anchor="middle" fill="white" font-size="22">Android preview</text><text x="180" y="420" text-anchor="middle" fill="#ced8de" font-size="16">Screen fixture</text></svg>'
    );

export function DeviceWorkspacePreview() {
    const [dark, setDark] = useState(true);
    const [reduced, setReduced] = useState(false);
    const [state, setState] = useState<ComputersState>({
        targets: [],
        selectedId: "",
        loading: true,
        busy: false,
        error: "",
    });
    const [api] = useState<ComputersApi>(() => {
        const targets: ComputerTarget[] = [
            {
                id: "ios",
                name: "iPhone 17 Pro",
                kind: "ios-simulator",
                status: "shutdown",
                runtime: "iOS 26.2",
                capabilities: ["boot", "shutdown", "home", "rotate", "screenshot", "button"],
                controlOwner: "user",
                controlGeneration: 0,
                labs: true,
            },
            {
                id: "android",
                name: "Pixel 8 · preview",
                kind: "android-emulator",
                status: "booted",
                runtime: "Android 14",
                capabilities: ["shutdown", "home", "rotate", "screenshot", "button"],
                controlOwner: "user",
                controlGeneration: 0,
                labs: true,
            },
        ];
        return {
            listComputerTargets: async () => ({ success: true, data: [...targets] }),
            performComputerTargetAction: async (action) => {
                const target = targets.find((target) => target.id === action.targetId);
                if (action.action === "shutdown") target.status = "shutdown";
                if (action.action === "boot") target.status = "booted";
                return {
                    success: true,
                    data: { target, imageDataUrl: target.id === "android" ? AndroidCapture : undefined },
                };
            },
            takeOverComputerTarget: async () => ({ success: false, error: { code: "preview", message: "Preview" } }),
            resumeComputerTarget: async () => ({ success: false, error: { code: "preview", message: "Preview" } }),
        };
    });
    const [controller] = useState(() => new ComputersController(api, setState));
    useEffect(() => {
        void controller.refresh();
        return () => controller.dispose();
    }, [controller]);
    return (
        <div
            className="kt-system-ui"
            data-color-scheme={dark ? "dark" : "light"}
            data-reduced-transparency={reduced}
            style={{ position: "fixed", inset: "40px 0 0", background: `url(${Wallpaper}) center/cover` }}
        >
            <div style={{ position: "absolute", top: 8, left: 8, zIndex: 9 }}>
                <button onClick={() => setDark(!dark)}>Toggle appearance</button>
                <button onClick={() => setReduced(!reduced)}>Toggle transparency</button>
                <span>Preview · Screen fixture · simulated lifecycle</span>
            </div>
            <div style={{ position: "absolute", inset: "48px 36px 24px" }}>
                <DeviceWorkspace state={state} controller={controller} api={api} />
            </div>
        </div>
    );
}
