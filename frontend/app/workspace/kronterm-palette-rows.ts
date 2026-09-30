// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// KronTerm workspace commands surfaced as Hermes palette rows. Registered only
// when the Hermes app runs embedded in a KronTerm window; standalone Hermes
// never sees them.

import { publishWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { registry } from "@hermes/contrib/registry";
import { isKronTermWidgetHost } from "@hermes/lib/kronterm-host";

let registered = false;

function registerKronTermPaletteRows(): void {
    if (registered || !isKronTermWidgetHost()) {
        return;
    }
    registered = true;
    registry.registerMany(
        (["tabs", "widgets", "canvas", "os"] as const).map((presentation) => ({
            id: `kronterm.presentation.${presentation}`,
            area: "palette" as const,
            data: {
                id: `kronterm.presentation.${presentation}`,
                label:
                    presentation === "os"
                        ? "Open OS Mode"
                        : `Switch to ${presentation[0].toUpperCase()}${presentation.slice(1)} Mode`,
                detail: () => "Switch the workspace presentation",
                keywords: ["presentation", "layout", "mode", "switch", presentation],
                run: () => publishWorkspacePresentation(presentation),
            },
        }))
    );
}

export { registerKronTermPaletteRows };
