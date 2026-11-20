// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// KronTerm workspace commands surfaced as Hermes palette rows. Registered only
// when the Hermes app runs embedded in a KronTerm window; standalone Hermes
// never sees them.

import { createBlock, getApi } from "@/app/store/global";
import { registry } from "@hermes/contrib/registry";
import { isKronTermWidgetHost } from "@hermes/lib/kronterm-host";

let registered = false;

function registerKronTermPaletteRows(): void {
    if (registered || !isKronTermWidgetHost()) {
        return;
    }
    registered = true;
    registry.registerMany([
        {
            id: "kronterm.browser-preview",
            area: "palette",
            data: {
                id: "kronterm.browser-preview",
                label: "Open Browser Preview",
                keywords: ["web", "widget"],
                run: () => void createBlock({ meta: { view: "web", "web:chrome": "preview" } as MetaType }),
            },
        },
        {
            id: "kronterm.sign-in",
            area: "palette",
            data: {
                id: "kronterm.sign-in",
                label: "Sign in to KronOS",
                keywords: ["account", "login"],
                run: () => getApi().openKronosSignIn(),
            },
        },
    ]);
}

export { registerKronTermPaletteRows };
