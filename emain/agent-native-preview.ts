// Copyright 2026, KronTerm. SPDX-License-Identifier: Apache-2.0

import type { AgentActivityEvent } from "../frontend/types/agent-activity";

export function createAgentPreviewPublisher(
    publish: (activity: AgentActivityEvent) => void,
    capture: (appName: string) => Promise<string>
) {
    const pending = new Map<string, { latest?: AgentActivityEvent }>();
    const refresh = async (key: string, slot: { latest?: AgentActivityEvent }) => {
        const activity = slot.latest;
        if (!activity) {
            pending.delete(key);
            return;
        }
        const startedAt = Date.now();
        try {
            const imageUrl = await capture(activity.appname);
            if (slot.latest === activity && imageUrl) publish({ ...activity, previewimageurl: imageUrl });
        } catch (error) {
            if (slot.latest === activity)
                publish({
                    ...activity,
                    previewerror: error instanceof Error ? error.message : "App preview unavailable",
                });
        } finally {
            if (slot.latest && slot.latest !== activity) {
                setTimeout(() => void refresh(key, slot), Math.max(0, 1000 - (Date.now() - startedAt)));
            } else {
                // Keep the slot through the cooldown so a burst shares one follow-up capture.
                slot.latest = undefined;
                setTimeout(
                    () => {
                        if (slot.latest) void refresh(key, slot);
                        else pending.delete(key);
                    },
                    Math.max(0, 1000 - (Date.now() - startedAt))
                );
            }
        }
    };
    return (activity: AgentActivityEvent) => {
        publish(activity);
        const key = activity.sessionid ?? activity.runid;
        if (!key) return;
        const eligible =
            !activity.previewimageurl &&
            activity.surface === "desktop" &&
            activity.surfaceid?.startsWith("desktop:") &&
            activity.appname &&
            (activity.phase === "finish" || activity.phase === "succeeded");
        const slot = pending.get(key);
        if (slot) {
            slot.latest = eligible ? activity : undefined;
            return;
        }
        if (!eligible) return;
        const next = { latest: activity };
        pending.set(key, next);
        void refresh(key, next);
    };
}
