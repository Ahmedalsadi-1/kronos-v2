// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { HudSurfaceIslands } from "@hermes/app/hud/surface-islands";
import { $hudSelectedSurfaceId, $hudSurfaceIslandsExpanded } from "@hermes/app/hud/surface-islands-model";
import type { HermesKronTermSurface } from "@hermes/global";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@vscode/codicons/dist/codicon.css";
import { useEffect, useRef, useState } from "react";

const Surfaces: HermesKronTermSurface[] = [
    { id: "browser", view: "web", title: "KronTerm", location: "https://kronterm.dev", focused: true, active: false },
    { id: "terminal", view: "term", title: "Terminal", location: "~/Projects/kronterm", focused: false, active: false },
    {
        id: "diff",
        view: "aifilediff",
        title: "File changes",
        location: "frontend/app.tsx",
        focused: false,
        active: true,
    },
    { id: "sandbox", view: "sandbox", title: "Sandbox VM", location: "Ubuntu desktop", focused: false, active: false },
];

export function HudSurfacesPreview() {
    const [client] = useState(() => new QueryClient());
    const [ready, setReady] = useState(false);
    const [fail, setFail] = useState(false);
    const failRef = useRef(fail);
    failRef.current = fail;
    const [input, setInput] = useState("");
    const [width, setWidth] = useState(620);
    useEffect(() => {
        const previous = window.hermesDesktop;
        window.hermesDesktop = {
            ...previous,
            krontermSurfaces: {
                list: async () => Surfaces,
                preview: async (id) => {
                    if (failRef.current) throw new Error("Preview disconnected");
                    const title = Surfaces.find((surface) => surface.id === id)?.title ?? "Widget";
                    return (
                        "data:image/svg+xml;charset=utf-8," +
                        encodeURIComponent(
                            `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480"><rect width="960" height="480" fill="#181a20"/><text x="50" y="85" fill="#ffffff" font-size="30" font-family="sans-serif">${title}</text><text x="50" y="145" fill="#a0a5b5" font-size="20" font-family="sans-serif">Live widget preview</text></svg>`
                        )
                    );
                },
                control: async (_id, value) => setInput(JSON.stringify(value)),
                focus: async () => ({ ok: true }),
                openSplit: async () => ({ ok: true }),
                promote: async () => ({ ok: true }),
                snapshot: async () => ({
                    blockId: "browser",
                    width: 960,
                    height: 480,
                    timestamp: Date.now(),
                    elements: [],
                }),
                inspect: async () => ({ ok: true }),
                onSelection: () => () => {},
            },
        };
        $hudSelectedSurfaceId.set(undefined);
        $hudSurfaceIslandsExpanded.set(false);
        setReady(true);
        return () => {
            window.hermesDesktop = previous;
            client.clear();
        };
    }, [client]);
    return (
        <div
            className="flex w-full flex-col items-center gap-4 px-4 py-8"
            style={{ "--ui-text-primary": "#f4f4f5", "--ui-text-secondary": "#9898a3" } as React.CSSProperties}
        >
            <div className="flex gap-2">
                <button
                    className="cursor-pointer rounded border px-3 py-1"
                    onClick={() => setWidth(width === 620 ? 340 : 620)}
                >
                    Toggle narrow width
                </button>
                <button className="cursor-pointer rounded border px-3 py-1" onClick={() => setFail(!fail)}>
                    Toggle preview failure
                </button>
            </div>
            <div style={{ width, maxWidth: "100%" }}>
                {ready && (
                    <QueryClientProvider client={client}>
                        <HudSurfaceIslands />
                    </QueryClientProvider>
                )}
            </div>
            <output className="max-w-full break-all text-xs">{input}</output>
        </div>
    );
}
