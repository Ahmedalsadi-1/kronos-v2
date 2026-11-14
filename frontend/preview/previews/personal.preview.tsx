// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalProductivity, type PersonalProductivityBridge } from "@/app/workspace/personal-productivity";
import { emptyProductivityState } from "../../types/productivity";

const PreviewBridge: PersonalProductivityBridge = {
    getProductivityState: async () => emptyProductivityState(),
    updateProductivity: async () => {
        throw new Error("This appearance preview cannot save personal data. Open the Personal widget in KronOS.");
    },
    onProductivityState: () => () => {},
};

export function PersonalPreview() {
    return (
        <div className="flex h-full flex-col">
            <p className="px-4 py-2 text-sm">Appearance preview · personal storage is unavailable here</p>
            <div className="min-h-0 flex-1">
                <PersonalProductivity api={PreviewBridge} />
            </div>
        </div>
    );
}
