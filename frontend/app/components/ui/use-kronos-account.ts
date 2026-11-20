// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import type { AccountStatus } from "@/types/kronos-account";
import { useEffect, useState } from "react";

export function useKronosAccount() {
    const [status, setStatus] = useState<AccountStatus>();
    const [error, setError] = useState("");
    useEffect(() => {
        let disposed = false;
        const api = getApi();
        const refresh = () => {
            void api
                .getKronosAccountStatus?.()
                .then((next) => {
                    if (!disposed) {
                        setStatus(next);
                        setError("");
                    }
                })
                .catch(() => {
                    if (!disposed) setError("Could not load your KronOS account. Try reopening settings.");
                });
        };
        refresh();
        const unsubscribe = api.onKronosAccountChanged?.(refresh);
        window.addEventListener("focus", refresh);
        return () => {
            disposed = true;
            unsubscribe?.();
            window.removeEventListener("focus", refresh);
        };
    }, []);
    return { status, error };
}
