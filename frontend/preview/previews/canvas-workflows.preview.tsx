// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { CanvasWorkflows } from "@/app/tab/workspace-canvas-workflows";
import "@/app/tab/workspace-canvas.scss";
import { useState } from "react";

const graph = {
    version: 1,
    nodes: [
        {
            id: "inspect",
            kind: "agent",
            title: "Inspect project",
            instruction: "Check the project prerequisites and collect evidence.",
            position: { x: 100, y: 100 },
        },
        {
            id: "verify",
            kind: "agent",
            title: "Validate outputs",
            instruction: "Validate the task outputs and report the result.",
            position: { x: 470, y: 100 },
        },
        {
            id: "review",
            kind: "review",
            title: "Review evidence",
            instruction: "Review the outputs before continuing.",
            position: { x: 470, y: 320 },
        },
    ],
    edges: [
        { id: "first", source: "inspect", target: "verify" },
        { id: "second", source: "verify", target: "review" },
    ],
};

export function CanvasWorkflowsPreview() {
    const [zoom, setZoom] = useState(1);
    return (
        <div className="workspace-canvas relative h-full w-full">
            <div className="absolute bottom-3 left-3 z-[6000] flex items-center gap-2 rounded border border-border bg-panel p-2 text-xs">
                <span>Component preview · no execution runtime</span>
                <button type="button" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}>
                    Zoom out
                </button>
                <button type="button" onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}>
                    Zoom in
                </button>
            </div>
            <CanvasWorkflows
                tabId="preview-tab"
                tabData={
                    {
                        blockids: [],
                        meta: { "layout:workflow": { title: "Project verification", graph } },
                    } as unknown as Tab
                }
                camera={{ x: 0, y: 0, zoom }}
                rects={{}}
                selectedBlockId={undefined}
                onFocusBlock={() => {}}
            />
        </div>
    );
}
