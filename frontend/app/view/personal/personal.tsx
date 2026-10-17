// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalProductivity } from "@/app/workspace/personal-productivity";
import { getApi } from "@/store/global";
import { atom } from "jotai";

export class PersonalViewModel implements ViewModel {
    viewType = "personal";
    viewComponent = PersonalView;
    viewName = atom("Personal");
    viewIcon = atom("list-check");
    noPadding = atom(true);
    blockId: string;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
    }
}

export function PersonalView() {
    return <PersonalProductivity api={getApi()} />;
}
