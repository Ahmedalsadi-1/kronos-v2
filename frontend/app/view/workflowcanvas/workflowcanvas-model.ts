// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { atom } from "jotai";
import { createElement, lazy, Suspense } from "react";

const LazyCanvas = lazy(async () => ({ default: (await import("./workflowcanvas")).WorkflowCanvasWidget }));
function WorkflowCanvasHost(props: ViewComponentProps<WorkflowCanvasModel>) {
    return createElement(Suspense, { fallback: "Loading Workflow Canvas…" }, createElement(LazyCanvas, props));
}
export class WorkflowCanvasModel implements ViewModel {
    viewType = "plugin:kronterm.openhuman-workflow/canvas";
    viewIcon = atom("diagram-project");
    viewName = atom("Workflow Canvas");
    noPadding = atom(true);
    viewComponent = WorkflowCanvasHost;
    blockId: string;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
    }
}
