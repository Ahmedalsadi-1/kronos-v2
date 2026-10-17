// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atom, type PrimitiveAtom } from "jotai";

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { LiveAgentSurfaceActivity } from "../../types/agent-activity";
import { globalStore } from "./jotaiStore";
import type {
    AppInstance,
    ArtifactShelfItem,
    CapabilityGrant,
    OSResourceReference,
    SpaceProfile,
    SystemEvent,
} from "./os-system-types";

const DefaultSpaceProfile: SpaceProfile = {
    version: 1,
    roots: [],
    pinnedAppIds: ["view:term", "view:web", "view:hermes", "view:preview"],
    restorePolicy: "smart",
    artifactShelf: [],
};

const DurableAgentPhases = new Set([
    "queued",
    "awaiting-approval",
    "succeeded",
    "degraded",
    "failed",
    "cancelled",
    "paused",
]);

export type OSSystemLoadState = "idle" | "restoring" | "ready" | "degraded";

export type AppInstanceSeed = {
    blockId: string;
    appId: string;
    collapsed?: boolean;
    nativeWindowId?: string;
    state?: AppInstance["state"];
};

export function reconcileAppInstances(
    current: AppInstance[],
    spaceId: string,
    seeds: AppInstanceSeed[]
): AppInstance[] {
    const currentByBlockId = new Map(
        current.filter((instance) => instance.spaceId === spaceId).map((item) => [item.blockId, item])
    );
    return seeds.map((seed) => {
        const existing = currentByBlockId.get(seed.blockId);
        return {
            id: existing?.id ?? `${spaceId}:${seed.blockId}`,
            spaceId,
            blockId: seed.blockId,
            appId: seed.appId,
            nativeWindowId: seed.nativeWindowId ?? existing?.nativeWindowId,
            state: seed.state ?? (seed.collapsed ? "dormant" : "running"),
        };
    });
}

export function addArtifactToShelf(
    current: ArtifactShelfItem[],
    resource: OSResourceReference,
    addedAt = Date.now(),
    limit = 200
): ArtifactShelfItem[] {
    const item = { ...resource, addedAt };
    return [
        item,
        ...current.filter((candidate) => candidate.kind !== resource.kind || candidate.resource !== resource.resource),
    ].slice(0, limit);
}

export function removeArtifactFromShelf(current: ArtifactShelfItem[], artifactId: string): ArtifactShelfItem[] {
    return current.filter((artifact) => artifact.id !== artifactId);
}

function toSpaceProfile(profile: OSSpaceProfile): SpaceProfile {
    return {
        version: 1,
        roots: profile.roots ?? [],
        pinnedAppIds: profile.pinnedappids ?? [],
        restorePolicy:
            profile.restorepolicy === "manual" || profile.restorepolicy === "auto" ? profile.restorepolicy : "smart",
        artifactShelf: (profile.artifactshelf ?? []).map((item) => ({
            id: item.id,
            kind: item.kind as ArtifactShelfItem["kind"],
            name: item.name,
            resource: item.resource,
            detail: item.detail,
            addedAt: item.addedat,
        })),
    };
}

function toSystemEvent(event: OSSystemEvent): SystemEvent {
    return {
        id: event.oid,
        spaceId: event.spaceid,
        kind: event.kind as SystemEvent["kind"],
        status: event.status,
        title: event.title,
        source: event.source,
        blockId: event.blockid,
        createdAt: event.createdts,
        readAt: event.readts,
        actions: event.actions,
    };
}

function toCapabilityGrant(grant: OSCapabilityGrant): CapabilityGrant {
    return {
        id: grant.oid,
        capability: grant.capability,
        scope: grant.scope as CapabilityGrant["scope"],
        resource: grant.resource,
        agentSessionId: grant.agentsessionid,
        expiresAt: grant.expirests,
        revokedAt: grant.revokedts,
    };
}

function systemEventKey(event: SystemEvent): string {
    return [event.spaceId, event.kind, event.status, event.title, event.source ?? "", event.blockId ?? ""].join(
        "\u0000"
    );
}

export function dedupeSystemEvents(events: SystemEvent[], windowMs = 5000, limit = 200): SystemEvent[] {
    const result: SystemEvent[] = [];
    const latestByKey = new Map<string, number>();
    for (const event of [...events].sort((a, b) => b.createdAt - a.createdAt)) {
        const key = systemEventKey(event);
        const latest = latestByKey.get(key);
        if (latest != null && latest - event.createdAt <= windowMs) {
            continue;
        }
        latestByKey.set(key, event.createdAt);
        result.push(event);
        if (result.length >= limit) break;
    }
    return result;
}

export function systemEventForAgentActivity(
    spaceId: string,
    activity: LiveAgentSurfaceActivity
): Omit<SystemEvent, "id" | "createdAt"> | undefined {
    if (!DurableAgentPhases.has(activity.phase)) return undefined;
    const subject = activity.appname?.trim() || activity.surface;
    const statusCopy: Record<string, string> = {
        queued: `Kronos queued work in ${subject}`,
        "awaiting-approval": `Kronos needs approval for ${subject}`,
        succeeded: `Kronos completed work in ${subject}`,
        degraded: `Kronos completed with warnings in ${subject}`,
        failed: `Kronos could not finish work in ${subject}`,
        cancelled: `Kronos work was interrupted in ${subject}`,
        paused: `Kronos paused work in ${subject}`,
    };
    const actions =
        activity.phase === "awaiting-approval"
            ? ["os.activity.inspect", "os.activity.interrupt"]
            : activity.phase === "failed" || activity.phase === "degraded"
              ? ["os.activity.inspect", "os.activity.retry"]
              : activity.phase === "queued" || activity.phase === "paused"
                ? ["os.activity.inspect", "os.activity.interrupt", "os.activity.takeover"]
                : ["os.activity.inspect"];
    return {
        spaceId,
        kind: activity.phase === "awaiting-approval" ? "approval" : "agent",
        status: activity.phase,
        title: statusCopy[activity.phase],
        source: activity.source,
        blockId: activity.blockid,
        actions,
    };
}

class OSSystemModel {
    private static instance: OSSystemModel;
    private loadSequence = 0;
    private agentEventKeys = new Set<string>();

    activeSpaceIdAtom = atom("") as PrimitiveAtom<string>;
    profileAtom = atom(DefaultSpaceProfile) as PrimitiveAtom<SpaceProfile>;
    eventsAtom = atom([]) as PrimitiveAtom<SystemEvent[]>;
    grantsAtom = atom([]) as PrimitiveAtom<CapabilityGrant[]>;
    appInstancesAtom = atom([]) as PrimitiveAtom<AppInstance[]>;
    loadStateAtom = atom("idle") as PrimitiveAtom<OSSystemLoadState>;
    errorAtom = atom("") as PrimitiveAtom<string>;

    private constructor() {}

    static getInstance(): OSSystemModel {
        if (!OSSystemModel.instance) {
            OSSystemModel.instance = new OSSystemModel();
        }
        return OSSystemModel.instance;
    }

    async loadSpace(spaceId: string): Promise<void> {
        if (!spaceId) return;
        const sequence = ++this.loadSequence;
        globalStore.set(this.activeSpaceIdAtom, spaceId);
        globalStore.set(this.loadStateAtom, "restoring");
        globalStore.set(this.errorAtom, "");
        try {
            const [profile, events, grants] = await Promise.all([
                RpcApi.OSSpaceProfileGetCommand(TabRpcClient, spaceId),
                RpcApi.OSActivityListCommand(TabRpcClient, { spaceid: spaceId, limit: 200, includeread: true }),
                RpcApi.OSCapabilityListCommand(TabRpcClient, { spaceid: spaceId }),
            ]);
            if (sequence !== this.loadSequence) return;
            globalStore.set(this.profileAtom, toSpaceProfile(profile));
            globalStore.set(this.eventsAtom, dedupeSystemEvents(events.map(toSystemEvent)));
            globalStore.set(this.grantsAtom, grants.map(toCapabilityGrant));
            globalStore.set(this.loadStateAtom, "ready");
        } catch (error) {
            if (sequence !== this.loadSequence) return;
            globalStore.set(this.profileAtom, DefaultSpaceProfile);
            globalStore.set(this.eventsAtom, []);
            globalStore.set(this.grantsAtom, []);
            globalStore.set(this.loadStateAtom, "degraded");
            globalStore.set(this.errorAtom, error instanceof Error ? error.message : "Unable to restore this space");
        }
    }

    async updateProfile(profile: SpaceProfile): Promise<SpaceProfile> {
        const spaceId = globalStore.get(this.activeSpaceIdAtom);
        if (!spaceId) throw new Error("No project space is active");
        const saved = await RpcApi.OSSpaceProfileSetCommand(TabRpcClient, {
            spaceid: spaceId,
            profile: {
                version: 1,
                roots: profile.roots,
                pinnedappids: profile.pinnedAppIds,
                restorepolicy: profile.restorePolicy,
                artifactshelf: profile.artifactShelf.map((item) => ({
                    id: item.id,
                    kind: item.kind,
                    name: item.name,
                    resource: item.resource,
                    detail: item.detail,
                    addedat: item.addedAt,
                })),
            },
        });
        const nextProfile = toSpaceProfile(saved);
        globalStore.set(this.profileAtom, nextProfile);
        return nextProfile;
    }

    async pinArtifact(resource: OSResourceReference): Promise<SpaceProfile> {
        const profile = globalStore.get(this.profileAtom);
        const saved = await this.updateProfile({
            ...profile,
            artifactShelf: addArtifactToShelf(profile.artifactShelf, resource),
        });
        const spaceId = globalStore.get(this.activeSpaceIdAtom);
        if (spaceId) {
            void this.appendEvent({
                spaceId,
                kind: "notification",
                status: "artifact-saved",
                title: `Saved ${resource.name} to the Artifact Shelf`,
                source: "artifact-shelf",
            }).catch(() => undefined);
        }
        return saved;
    }

    async removeArtifact(artifactId: string): Promise<SpaceProfile> {
        const profile = globalStore.get(this.profileAtom);
        return this.updateProfile({
            ...profile,
            artifactShelf: removeArtifactFromShelf(profile.artifactShelf, artifactId),
        });
    }

    async appendEvent(event: Omit<SystemEvent, "id" | "createdAt">): Promise<SystemEvent> {
        const saved = await RpcApi.OSActivityAppendCommand(TabRpcClient, {
            spaceid: event.spaceId,
            kind: event.kind,
            status: event.status,
            title: event.title,
            source: event.source,
            blockid: event.blockId,
            actions: event.actions,
        });
        const nextEvent = toSystemEvent(saved);
        if (event.spaceId === globalStore.get(this.activeSpaceIdAtom)) {
            globalStore.set(this.eventsAtom, (current) => dedupeSystemEvents([nextEvent, ...current]));
        }
        return nextEvent;
    }

    async markEventsRead(eventIds?: string[]): Promise<void> {
        const spaceId = globalStore.get(this.activeSpaceIdAtom);
        if (!spaceId) return;
        await RpcApi.OSActivityReadCommand(TabRpcClient, {
            spaceid: spaceId,
            eventids: eventIds,
            all: eventIds == null,
        });
        const readAt = Date.now();
        globalStore.set(this.eventsAtom, (current) =>
            current.map((event) =>
                eventIds == null || eventIds.includes(event.id) ? { ...event, readAt: event.readAt ?? readAt } : event
            )
        );
    }

    async grantCapability(input: Omit<CapabilityGrant, "id" | "revokedAt">): Promise<CapabilityGrant> {
        const spaceId = globalStore.get(this.activeSpaceIdAtom);
        if (!spaceId) throw new Error("No project space is active");
        const saved = await RpcApi.OSCapabilityGrantCommand(TabRpcClient, {
            spaceid: spaceId,
            capability: input.capability,
            scope: input.scope,
            resource: input.resource,
            agentsessionid: input.agentSessionId,
            expirests: input.expiresAt,
        });
        const grant = toCapabilityGrant(saved);
        globalStore.set(this.grantsAtom, (current) => [grant, ...current.filter((item) => item.id !== grant.id)]);
        return grant;
    }

    async revokeCapability(grantId: string): Promise<void> {
        await RpcApi.OSCapabilityRevokeCommand(TabRpcClient, grantId);
        const revokedAt = Date.now();
        globalStore.set(this.grantsAtom, (current) =>
            current.map((grant) => (grant.id === grantId ? { ...grant, revokedAt } : grant))
        );
    }

    async saveCheckpoint(spaceId: string, tabId: string, snapshot: unknown, reason = "periodic"): Promise<void> {
        await RpcApi.OSCheckpointSaveCommand(TabRpcClient, {
            spaceid: spaceId,
            tabid: tabId,
            reason,
            snapshotjson: JSON.stringify(snapshot),
        });
    }

    async recordAgentActivity(spaceId: string, activity: LiveAgentSurfaceActivity): Promise<void> {
        const event = systemEventForAgentActivity(spaceId, activity);
        if (!event) return;
        const key = `${spaceId}:${activity.runid ?? "default"}:${activity.phase}:${activity.blockid ?? ""}`;
        if (this.agentEventKeys.has(key)) return;
        this.agentEventKeys.add(key);
        await this.appendEvent(event).catch(() => {
            this.agentEventKeys.delete(key);
        });
    }

    async recordAppTransition(name: string, status: "focused" | "launched", blockId?: string): Promise<void> {
        const spaceId = globalStore.get(this.activeSpaceIdAtom);
        if (!spaceId) return;
        await this.appendEvent({
            spaceId,
            kind: "app",
            status,
            title: `${status === "focused" ? "Focused" : "Opened"} ${name}`,
            source: "app-registry",
            blockId,
            actions: blockId ? ["os.activity.inspect"] : undefined,
        });
    }

    reconcileAppInstances(spaceId: string, seeds: AppInstanceSeed[]): void {
        if (!spaceId) return;
        globalStore.set(this.appInstancesAtom, (current) => reconcileAppInstances(current, spaceId, seeds));
    }
}

export { DefaultSpaceProfile, OSSystemModel };
