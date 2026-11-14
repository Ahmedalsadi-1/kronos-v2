// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";

export function reportClientFailure(error: unknown, source: "renderer" | "react" = "react"): void {
    try {
        const failure = error instanceof Error ? error : null;
        getApi()?.recordRendererFailure?.({ source, name: failure?.name, stack: failure?.stack });
    } catch {
        // The recovery UI must work even when the native bridge is unavailable.
    }
}

export function installClientDiagnostics(): () => void {
    const onError = (event: ErrorEvent) => reportClientFailure(event.error, "renderer");
    const onRejection = (event: PromiseRejectionEvent) => reportClientFailure(event.reason, "renderer");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
    };
}
