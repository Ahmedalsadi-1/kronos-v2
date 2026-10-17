// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { useEffect, useState } from "react";
import { configureHermesDesktopShim } from "./hermes-desktop-shim";

export function useHermesConnection(tabId: string, enabled = true, hostMode?: "kronterm") {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        setReady(false);
        setError("");
        if (!enabled) return;
        let active = true;
        let connected = false;
        const apply = (connection: HermesConnectionDescriptor) => {
            if (!active) return;
            connected = true;
            configureHermesDesktopShim({ baseUrl: connection.baseUrl, token: connection.token });
            setError("");
            setReady(true);
        };
        const off = getApi().onHermesConnection(apply);
        void getApi()
            .hermesGetConnection({ tabId, ...(hostMode ? { hostMode } : {}) })
            .then(apply)
            .catch((reason) => {
                if (active && !connected) setError(reason instanceof Error ? reason.message : String(reason));
            });
        return () => {
            active = false;
            off();
        };
    }, [tabId, enabled, hostMode, attempt]);
    return { ready, error, retry: () => setAttempt((value) => value + 1) };
}

export function HermesConnectionState({ error, retry }: { error: string; retry: () => void }) {
    return (
        <div
            role={error ? "alert" : "status"}
            className="pointer-events-auto flex h-full min-h-0 min-w-0 w-full flex-col items-center justify-center gap-2 overflow-auto p-3 text-xs"
        >
            <p className="max-w-full break-words">{error || "Starting Kronos…"}</p>
            {error && (
                <button
                    type="button"
                    className="cursor-pointer rounded bg-accent/80 px-3 py-2 text-primary"
                    onClick={retry}
                >
                    Retry agent connection
                </button>
            )}
        </div>
    );
}
