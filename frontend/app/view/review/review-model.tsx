// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WOS } from "@/store/global";
import { atom, type Atom } from "jotai";
import { createElement, lazy, Suspense } from "react";

const LazyReviewView = lazy(async () => ({ default: (await import("./review")).ReviewView }));

function ReviewLazyView(props: ViewComponentProps<ReviewViewModel>) {
    return createElement(Suspense, { fallback: null }, createElement(LazyReviewView, props));
}

export class ReviewViewModel implements ViewModel {
    viewType = "review";
    viewIcon = atom("code-compare");
    viewName = atom("Review");
    noPadding = atom(true);
    blockId: string;
    tabId: string;
    blockAtom: Atom<Block>;

    constructor({ blockId, tabModel }: ViewModelInitType) {
        this.blockId = blockId;
        this.tabId = tabModel.tabId;
        this.blockAtom = WOS.getWaveObjectAtom<Block>(`block:${blockId}`);
    }

    get viewComponent(): ViewComponent {
        return ReviewLazyView;
    }
}
