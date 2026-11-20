export interface SubagentSurfaceSnapshot {
    imageUrl?: string;
    blockId?: string;
    targetKey?: string;
    title?: string;
    detail?: string;
    filepath?: string;
    captureError?: string;
}

export interface SubagentSurfaceTarget {
    id: string;
    sessionId?: string;
    live?: boolean;
    capture?: boolean;
    since?: number;
    swarm?: boolean;
}

type SurfaceSubscriber = (
    target: SubagentSurfaceTarget,
    onSnapshot: (snapshot: SubagentSurfaceSnapshot) => void
) => () => void;

let subscribe: SurfaceSubscriber;
let stopSwarm: (sessionId: string) => Promise<void>;

export function registerSubagentSurfaceSource(source: SurfaceSubscriber): void {
    subscribe = source;
}

export function subscribeSubagentSurface(
    target: SubagentSurfaceTarget,
    onSnapshot: (snapshot: SubagentSurfaceSnapshot) => void
): () => void {
    return subscribe?.(target, onSnapshot) ?? (() => {});
}

export function registerSwarmWorkerStop(stop: (sessionId: string) => Promise<void>): void {
    stopSwarm = stop;
}

export async function requestSwarmWorkerStop(sessionId: string): Promise<void> {
    if (!stopSwarm) throw new Error("Swarm worker connection unavailable.");
    await stopSwarm(sessionId);
}
