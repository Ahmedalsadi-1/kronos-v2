export interface SubagentSurfaceSnapshot {
    imageUrl?: string;
    title?: string;
    detail?: string;
}

export interface SubagentSurfaceTarget {
    id: string;
    sessionId?: string;
    live?: boolean;
}

type SurfaceSubscriber = (
    target: SubagentSurfaceTarget,
    onSnapshot: (snapshot: SubagentSurfaceSnapshot) => void
) => () => void;

let subscribe: SurfaceSubscriber;

export function registerSubagentSurfaceSource(source: SurfaceSubscriber): void {
    subscribe = source;
}

export function subscribeSubagentSurface(
    target: SubagentSurfaceTarget,
    onSnapshot: (snapshot: SubagentSurfaceSnapshot) => void
): () => void {
    return subscribe?.(target, onSnapshot) ?? (() => {});
}
