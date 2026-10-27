// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { TapflowView } from "@/app/plugins/tapflow/routes";
import { atom } from "jotai";
import { createElement, lazy, Suspense } from "react";

const Widget = lazy(async () => ({ default: (await import("./tapflow")).TapflowWidget }));
function Host(props: ViewComponentProps<TapflowModel>) {
    return createElement(Suspense, { fallback: "Loading Tapflow..." }, createElement(Widget, props));
}
export class TapflowModel implements ViewModel {
    viewType = TapflowView;
    viewName = atom("Tapflow · Mobile Labs");
    viewIcon = atom("mobile-screen");
    noPadding = atom(true);
    viewComponent = Host;
    blockId: string;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
    }
}
