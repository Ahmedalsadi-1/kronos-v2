// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import KronTermOSWallpaper from "@/app/asset/kronterm-os-wallpaper.png";
import { SystemUIProvider } from "@/app/components/system-ui";
import { OSDesktopLayer, type OSDesktopWindow } from "@/app/tab/os-desktop";
import { DefaultOSDockPins, type OSDockPin } from "@/app/tab/os-desktop-model";
import "@/app/tab/os-workspace.scss";
import type { NowPlayingState } from "@/types/now-playing";
import { useState } from "react";

const windows: OSDesktopWindow[] = [
    {
        blockId: "term",
        title: "Terminal",
        subtitle: "~/Projects/kronterm-os",
        icon: "view:term",
        active: true,
        minimized: false,
    },
    {
        blockId: "web",
        title: "GitHub",
        subtitle: "github.com/kronterm/kronterm-os",
        icon: "view:web",
        active: false,
        minimized: false,
        agentLabel: "Hermes · click Code",
    },
    {
        blockId: "files",
        title: "Files",
        subtitle: "~/Documents",
        icon: "view:preview",
        active: false,
        minimized: true,
    },
];

export function OSDesktopPreview() {
    const [scheme, setScheme] = useState("light");
    const [pins, setPins] = useState<OSDockPin[]>(DefaultOSDockPins);
    const [log, setLog] = useState<string>("");
    const [media, setMedia] = useState<NowPlayingState>({
        id: "preview",
        source: "Media preview",
        title: "Now Playing preview",
        artist: "Playback controls",
        playing: true,
        canSkip: true,
    });
    return (
        <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
            <SystemUIProvider>
                <div className="kt-system-ui os-mode-root absolute inset-0" data-color-scheme={scheme}>
                    <select
                        aria-label="Preview appearance"
                        value={scheme}
                        onChange={(event) => setScheme(event.target.value)}
                        className="absolute left-1/2 top-3 z-10 rounded bg-panel px-3 py-2 text-foreground"
                    >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                    <img src={KronTermOSWallpaper} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <OSDesktopLayer
                        media={{
                            state: media,
                            pending: false,
                            error: "",
                            control: async (command) => {
                                if (command === "toggle") setMedia((state) => ({ ...state, playing: !state.playing }));
                                setLog(`media ${command}`);
                            },
                        }}
                        windows={windows}
                        pins={pins}
                        installedApps={[{ id: "com.apple.Notes", name: "Notes", icon: "fa-note-sticky" }]}
                        onFocusWindow={(blockId) => setLog(`focus ${blockId}`)}
                        onAskKronos={(text) => setLog(`ask: ${text}`)}
                        onOpenKronos={() => setLog("open kronos")}
                        onLaunchPin={(pin) => setLog(`launch ${pin.name}`)}
                        onPinsChange={setPins}
                    />
                    <output className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                        {log || "interact with the desktop"}
                    </output>
                </div>
            </SystemUIProvider>
        </div>
    );
}
