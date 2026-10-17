// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { markKronTermWidgetHost } from "@hermes/lib/kronterm-host";
import { lazy, Suspense, useEffect } from "react";
import { installHermesDesktopShim } from "./hermes-desktop-shim";

import { HermesConnectionState, useHermesConnection } from "./use-hermes-connection";

const LazyHermesApp = lazy(async () => ({ default: (await import("./hermes-app")).HermesApp }));

export function HermesRuntimeChat({ tabId }: { tabId?: string }) {
    const { ready, error, retry } = useHermesConnection(tabId);
    useEffect(() => {
        markKronTermWidgetHost();
        installHermesDesktopShim();
    }, []);

    if (!ready) return <HermesConnectionState error={error} retry={retry} />;

    return (
        <Suspense fallback={<div role="status">Loading chat…</div>}>
            <LazyHermesApp panelMode />
        </Suspense>
    );
}
