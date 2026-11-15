// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type PenCamera = { x: number; y: number; zoom: number };
export type PenViewport = { x: number; y: number; width: number; height: number };
export type PenCameraSnapshot = { camera: PenCamera; viewport: PenViewport; sequence?: number };

export function samePenCamera(a: PenCamera, b: PenCamera): boolean {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

export function readPenCameraSnapshot(value: unknown): PenCameraSnapshot | undefined {
    const snapshot = value as PenCameraSnapshot;
    const camera = snapshot?.camera;
    const viewport = snapshot?.viewport;
    if (!camera || !viewport) return;
    if (
        ![camera.x, camera.y, camera.zoom, viewport.x, viewport.y, viewport.width, viewport.height].every(
            Number.isFinite
        )
    )
        return;
    if (camera.zoom <= 0 || viewport.width <= 0 || viewport.height <= 0) return;
    if (snapshot.sequence != null && (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 1)) return;
    return { camera: { ...camera }, viewport: { ...viewport }, sequence: snapshot.sequence };
}

export function makePenCameraSync({
    camera,
    apply,
    onCamera,
    onViewport,
    onError,
}: {
    camera: PenCamera;
    apply: (camera: PenCamera) => Promise<unknown>;
    onCamera: (camera: PenCamera) => void;
    onViewport: (viewport: PenViewport) => void;
    onError: (error: unknown) => void;
}) {
    let desired = camera;
    let acknowledged: PenCamera;
    let active = false;
    let initialized = false;
    let pending = false;
    let disposed = false;
    let revision = 0;
    let lastSequence = 0;
    let latestNative: PenCameraSnapshot;
    const accept = (snapshot: PenCameraSnapshot) => {
        lastSequence = snapshot.sequence ?? lastSequence;
        acknowledged = snapshot.camera;
        desired = snapshot.camera;
        onViewport(snapshot.viewport);
        onCamera(snapshot.camera);
    };
    const flush = () => {
        if (!active || pending || disposed || samePenCamera(desired, acknowledged)) return;
        pending = true;
        const sentRevision = revision;
        const sent = desired;
        void apply(sent)
            .then((value) => {
                if (disposed) return;
                const snapshot = readPenCameraSnapshot(value);
                if (!snapshot) throw new Error("The canvas returned an invalid camera.");
                initialized = true;
                const native = latestNative;
                latestNative = undefined;
                const newest = native?.sequence > snapshot.sequence ? native : snapshot;
                if (active && revision === sentRevision) accept(newest);
                else {
                    lastSequence = newest.sequence ?? lastSequence;
                    acknowledged = newest.camera;
                }
            })
            .catch((error) => {
                if (disposed) return;
                active = false;
                onError(error);
            })
            .finally(() => {
                pending = false;
                flush();
            });
    };
    return {
        start() {
            active = true;
            flush();
        },
        pause() {
            active = false;
        },
        setCamera(next: PenCamera) {
            if (samePenCamera(desired, next)) return;
            desired = next;
            revision++;
            flush();
        },
        receive(value: unknown) {
            const snapshot = readPenCameraSnapshot(value);
            if (!snapshot || disposed || !active) return;
            // The saved OS camera wins over Pen's startup fit-to-document camera.
            if (!initialized) {
                onViewport(snapshot.viewport);
                return;
            }
            if (snapshot.sequence != null && snapshot.sequence <= lastSequence) return;
            if (pending) {
                if (snapshot.sequence != null && (!latestNative || snapshot.sequence > latestNative.sequence))
                    latestNative = snapshot;
                return;
            }
            accept(snapshot);
        },
        dispose() {
            disposed = true;
        },
    };
}
