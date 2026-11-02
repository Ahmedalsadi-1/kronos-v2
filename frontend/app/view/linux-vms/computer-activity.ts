// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { subscribeAgentActivityStream, type LiveAgentSurfaceActivity } from "@/types/agent-activity";
import { useEffect, useState } from "react";

export function useComputerActivity(desktopId?: string) {
    const [activity, setActivity] = useState<LiveAgentSurfaceActivity>();
    useEffect(() => {
        setActivity(undefined);
        let expiry: ReturnType<typeof setTimeout>;
        let newest = -Infinity;
        const unsubscribe = subscribeAgentActivityStream((event) => {
            if (!desktopId || event.surfaceid !== `vm:${desktopId}` || !["sandbox", "desktop"].includes(event.surface))
                return;
            if (event.timestamp < newest) return;
            newest = event.timestamp;
            setActivity(event);
            clearTimeout(expiry);
            if (event.phase !== "awaiting-approval") expiry = setTimeout(() => setActivity(undefined), 15_000);
        });
        return () => {
            unsubscribe();
            clearTimeout(expiry);
        };
    }, [desktopId]);
    return activity;
}
