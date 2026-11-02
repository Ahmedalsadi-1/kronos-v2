// Copyright 2026, KronTerm. SPDX-License-Identifier: Apache-2.0

import { registerSubagentSurfaceSource } from "@hermes/lib/subagent-surface";
import {
    agentActivityTimeline,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "../../../types/agent-activity";

export function installSubagentSurfaceSource(capture: (blockId: string) => Promise<string>): void {
    registerSubagentSurfaceSource((target, onSnapshot) => {
        let disposed = false;
        let latest: LiveAgentSurfaceActivity;
        let imageUrl: string;
        let capturePending = false;
        let generation = 0;
        const matches = (activity: LiveAgentSurfaceActivity) =>
            [target.id, target.sessionId]
                .filter(Boolean)
                .some((id) => activity.sessionid === id || activity.runid === id || activity.runid === `hermes:${id}`);
        const publish = () =>
            onSnapshot({ imageUrl, title: latest?.appname ?? latest?.surface, detail: latest?.detail });
        const accept = (activity: LiveAgentSurfaceActivity) => {
            if (!matches(activity)) return;
            if (latest?.blockid !== activity.blockid) {
                imageUrl = undefined;
                generation += 1;
            }
            latest = activity;
            if (activity.previewimageurl) imageUrl = activity.previewimageurl;
            publish();
        };
        const refresh = async () => {
            if (!latest?.blockid || capturePending || disposed) return;
            const blockId = latest.blockid;
            const currentGeneration = generation;
            capturePending = true;
            try {
                const result = await capture(blockId);
                if (disposed || generation !== currentGeneration) return;
                imageUrl = result;
                publish();
            } catch {
                // A closed or uncapturable widget must not fall back to another agent's surface.
            } finally {
                capturePending = false;
            }
        };
        for (const activity of agentActivityTimeline.getAll()) accept(activity);
        const unsubscribe = target.live === false ? () => {} : subscribeAgentActivityStream(accept);
        if (target.live !== false) void refresh();
        const timer = target.live === false ? undefined : window.setInterval(() => void refresh(), 2000);
        return () => {
            disposed = true;
            unsubscribe();
            window.clearInterval(timer);
        };
    });
}
