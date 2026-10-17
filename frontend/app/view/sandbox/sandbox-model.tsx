// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";
import { SandboxView } from "./sandbox";

export class SandboxViewModel implements ViewModel {
    viewType = "sandbox";
    blockId: string;
    noPadding = atom(true);
    viewIcon = atom("desktop");
    viewName = atom("Sandbox");

    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
    }

    get viewComponent(): ViewComponent {
        return SandboxView;
    }

    giveFocus(): boolean {
        return true;
    }
}
