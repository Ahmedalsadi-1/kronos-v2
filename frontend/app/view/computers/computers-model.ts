// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { getApi } from "@/store/global";
import { atom } from "jotai";
import { ComputersView } from "./computers";
import { ComputersController, type ComputersApi, type ComputersState } from "./computers-state";

export class ComputersViewModel implements ViewModel {
    viewType = "computers";
    viewIcon = atom("desktop");
    viewName = atom("Computers & Devices");
    noPadding = atom(true);
    stateAtom = atom<ComputersState>({ targets: [], selectedId: "", loading: true, busy: false, error: "" });
    controller: ComputersController;
    blockId: string;

    constructor({ blockId }: ViewModelInitType, api: ComputersApi = getApi()) {
        this.blockId = blockId;
        this.controller = new ComputersController(api, (state) => globalStore.set(this.stateAtom, state));
        void this.controller.refresh();
    }

    get viewComponent(): ViewComponent {
        return ComputersView;
    }

    dispose() {
        this.controller.dispose();
    }
}
