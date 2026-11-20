// Copyright 2026, KronTerm. SPDX-License-Identifier: Apache-2.0

import { registerSubagentSurfaceSource, type SubagentSurfaceSnapshot } from "@hermes/lib/subagent-surface";
import {
    agentActivityTimeline,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "../../../types/agent-activity";

export function installSubagentSurfaceSource(capture: (activity: LiveAgentSurfaceActivity) => Promise<string>): void {
    // A recorded event is the freshness boundary. Sharing by surface alone could
    // return a frame started before the latest tool action or control transfer.
    const inFlight = new WeakMap<LiveAgentSurfaceActivity, Map<string, Promise<string>>>();
    const captureOnce = (event: LiveAgentSurfaceActivity, scope: string, activity: LiveAgentSurfaceActivity) => {
        let requests = inFlight.get(event);
        if (!requests) {
            requests = new Map();
            inFlight.set(event, requests);
        }
        const existing = requests.get(scope);
        if (existing) return existing;
        const pending = capture(activity).finally(() => requests.delete(scope));
        requests.set(scope, pending);
        return pending;
    };
    registerSubagentSurfaceSource((target, onSnapshot) => {
        const scope = JSON.stringify([target.id, target.sessionId, !!target.swarm]);
        let disposed = false;
        let latest: LiveAgentSurfaceActivity;
        let latestEvent: LiveAgentSurfaceActivity;
        let swarmTarget: LiveAgentSurfaceActivity;
        let swarmFinished = false;
        let imageUrl: string;
        let captureError: string;
        let capturePending = false;
        let generation = 0;
        let ready = false;
        let lastSnapshot: SubagentSurfaceSnapshot;
        let lastCaptureAt = -Infinity;
        let timer: number;
        const matches = (activity: LiveAgentSurfaceActivity) => {
            if (activity.sessionid) return activity.sessionid === (target.sessionId || target.id);
            return [target.id, target.sessionId]
                .filter(Boolean)
                .some((id) => activity.runid === id || activity.runid === `hermes:${id}`);
        };
        const matchesWorker = (activity: LiveAgentSurfaceActivity) =>
            activity.swarm
                ? `${activity.swarm.runId}:${activity.swarm.nodeId}` === target.id
                : !!target.sessionId && activity.sessionid === target.sessionId;
        const key = (activity?: LiveAgentSurfaceActivity) =>
            JSON.stringify([
                activity?.surface,
                activity?.blockid,
                activity?.surfaceid,
                activity?.controlgeneration,
                activity?.filepath,
            ]);
        const clearCapture = () => {
            imageUrl = undefined;
            captureError = undefined;
            generation += 1;
        };
        const publish = () => {
            if (!ready) return;
            const snapshot: SubagentSurfaceSnapshot = {
                imageUrl,
                blockId: latest?.blockid,
                title: latest?.appname ?? latest?.surface,
                detail: latest?.detail,
                filepath: latest?.filepath,
                captureError,
                targetKey: latest ? key(latest) : undefined,
            };
            if (
                lastSnapshot &&
                snapshot.imageUrl === lastSnapshot.imageUrl &&
                snapshot.title === lastSnapshot.title &&
                snapshot.detail === lastSnapshot.detail &&
                snapshot.filepath === lastSnapshot.filepath &&
                snapshot.captureError === lastSnapshot.captureError &&
                snapshot.targetKey === lastSnapshot.targetKey
            )
                return;
            lastSnapshot = snapshot;
            onSnapshot(snapshot);
        };
        const canCapture = () =>
            !disposed &&
            target.live !== false &&
            target.capture !== false &&
            !swarmFinished &&
            !document.hidden &&
            !!(latest?.blockid || /^(vm|device):/.test(latest?.surfaceid ?? ""));
        const schedule = (delay: number) => {
            window.clearTimeout(timer);
            if (canCapture()) timer = window.setTimeout(() => void refresh(), delay);
        };
        const refresh = async () => {
            window.clearTimeout(timer);
            if (capturePending || !canCapture()) return;
            const wait = 1000 - (Date.now() - lastCaptureAt);
            if (wait > 0) {
                schedule(wait);
                return;
            }
            const activity = latest;
            const event = latestEvent;
            const currentGeneration = generation;
            capturePending = true;
            lastCaptureAt = Date.now();
            try {
                const result = await captureOnce(event, scope, activity);
                if (!canCapture() || generation !== currentGeneration) return;
                imageUrl = result;
                captureError = undefined;
                publish();
            } catch (error) {
                if (!canCapture() || generation !== currentGeneration) return;
                imageUrl = undefined;
                captureError = error instanceof Error ? error.message : "Preview is temporarily unavailable.";
                publish();
            } finally {
                capturePending = false;
                if (generation !== currentGeneration && !imageUrl && !captureError) {
                    void refresh();
                } else {
                    schedule(2000);
                }
            }
        };
        const accept = (activity: LiveAgentSurfaceActivity) => {
            if (target.since != null && activity.timestamp < target.since) return;
            const event = activity;
            if (target.swarm) {
                if (swarmFinished || !matchesWorker(activity)) return;
                const swarm = activity.swarm;
                if (swarm) {
                    if (swarm.removed) {
                        swarmTarget = undefined;
                        latest = undefined;
                        clearCapture();
                        publish();
                        window.clearTimeout(timer);
                        return;
                    }
                    swarmTarget = { ...activity, previewimageurl: undefined };
                    swarmFinished = swarm.status !== "pending" && swarm.status !== "running";
                    activity = { ...activity, detail: swarm.summary ?? activity.detail };
                } else {
                    if (!swarmTarget) return;
                    if (activity.action === "thinking" || (!activity.previewimageurl && !activity.previewerror)) return;
                    const isManagedSurface = /^(vm|device):/.test(swarmTarget.surfaceid ?? "");
                    const sameTarget = isManagedSurface
                        ? activity.surfaceid === swarmTarget.surfaceid &&
                          activity.controlgeneration === swarmTarget.controlgeneration
                        : !/^(vm|device):/.test(activity.surfaceid ?? "") &&
                          swarmTarget.blockid &&
                          activity.blockid === swarmTarget.blockid;
                    if (!sameTarget) return;
                    activity = {
                        ...swarmTarget,
                        previewimageurl: activity.previewimageurl,
                        previewerror: activity.previewerror,
                    };
                }
            } else if (!matches(activity) || activity.action === "thinking") {
                return;
            }
            if (key(latest) !== key(activity)) clearCapture();
            else if (
                !["inspect", "verify", "screenshot", "wait"].includes(activity.action) ||
                activity.risk === "write"
            )
                generation += 1;
            latestEvent = event;
            latest = { ...activity, previewimageurl: undefined };
            if (activity.previewimageurl || activity.previewerror) generation += 1;
            if (activity.previewimageurl) {
                imageUrl = activity.previewimageurl;
                captureError = undefined;
            }
            if (activity.previewerror) {
                captureError = activity.previewerror;
                imageUrl = undefined;
            }
            publish();
            if (!ready) return;
            if (activity.previewimageurl || activity.previewerror) {
                schedule(2000);
            } else {
                void refresh();
            }
        };
        for (const activity of agentActivityTimeline.getAll(target.swarm ? matchesWorker : matches)) accept(activity);
        ready = true;
        if (latest) publish();
        const unsubscribe = target.live === false ? () => {} : subscribeAgentActivityStream(accept);
        if (imageUrl || captureError) schedule(2000);
        else void refresh();
        const onVisibilityChange = () => void refresh();
        if (target.live !== false) document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            disposed = true;
            unsubscribe();
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.clearTimeout(timer);
        };
    });
}
