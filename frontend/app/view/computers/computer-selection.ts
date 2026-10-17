// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { ComputerTarget, ComputerTargetSnapshot } from "@/types/computer-targets";

export type CapturePoint = { x: number; y: number };
export type CaptureRegion = CapturePoint & { width: number; height: number };

export function capturePixelPoint(
    bounds: CaptureRegion,
    dimensions: { width: number; height: number },
    client: CapturePoint,
    clamp = false
): CapturePoint {
    if (bounds.width <= 0 || bounds.height <= 0 || dimensions.width <= 0 || dimensions.height <= 0) return null;
    const scale = Math.min(bounds.width / dimensions.width, bounds.height / dimensions.height);
    const width = dimensions.width * scale;
    const height = dimensions.height * scale;
    const x = (client.x - bounds.x - (bounds.width - width) / 2) / scale;
    const y = (client.y - bounds.y - (bounds.height - height) / 2) / scale;
    if (!clamp && (x < 0 || y < 0 || x > dimensions.width || y > dimensions.height)) return null;
    return { x: Math.max(0, Math.min(dimensions.width, x)), y: Math.max(0, Math.min(dimensions.height, y)) };
}

export function captureRegion(start: CapturePoint, end: CapturePoint): CaptureRegion {
    if (!start || !end) return null;
    const x = Math.floor(Math.min(start.x, end.x));
    const y = Math.floor(Math.min(start.y, end.y));
    const right = Math.ceil(Math.max(start.x, end.x));
    const bottom = Math.ceil(Math.max(start.y, end.y));
    return right - x >= 2 && bottom - y >= 2 ? { x, y, width: right - x, height: bottom - y } : null;
}

export function captureStillValid(snapshot: ComputerTargetSnapshot, target: ComputerTarget): boolean {
    return (
        !!target &&
        snapshot.target.id === target.id &&
        snapshot.target.controlGeneration === target.controlGeneration &&
        ["booted", "connected"].includes(target.status)
    );
}

export function deviceSelectionContext(
    snapshot: ComputerTargetSnapshot,
    dimensions: { width: number; height: number },
    region: CaptureRegion,
    annotation: string
) {
    return {
        kind: "mobile-screen-region",
        labs: true,
        semantics: "pixels-only",
        deviceId: snapshot.target.id,
        deviceName: snapshot.target.name,
        runtime: snapshot.target.runtime,
        deviceKind: snapshot.target.kind,
        controlGeneration: snapshot.target.controlGeneration,
        capturedAt: snapshot.capturedAt,
        orientation: dimensions.width > dimensions.height ? "landscape" : "portrait",
        frame: dimensions,
        region,
        annotation: annotation.trim().slice(0, 2000),
        requiresRevalidation: true,
    };
}
