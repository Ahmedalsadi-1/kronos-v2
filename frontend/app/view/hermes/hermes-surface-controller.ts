// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type HermesSurfacePresentation = "closed" | "hud" | "panel";

export type HermesHudGeometry = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type HermesSurfaceSnapshot = {
    presentation: HermesSurfacePresentation;
    geometry: HermesHudGeometry;
    sessionId: string | null;
};

const GeometryStorageKey = "kronterm.hermes.hud.geometry.v1";
const HudMinWidth = 320;
const HudMinHeight = 160;
const HudDefaultWidth = 360;
const HudDefaultHeight = 720;
const HudViewportMargin = 12;
const HudBottomClearance = 78;
const OSShellClearance = 76;

type HudBounds = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;

function viewportBounds(): HudBounds {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return { bottom: 900, height: 900, left: 0, right: 1440, top: 0, width: 1440 };
    }
    const surface = document.querySelector<HTMLElement>(".workspace-surface-row");
    const rect = surface?.getBoundingClientRect();
    const bounds: HudBounds = rect
        ? {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
          }
        : {
              bottom: window.innerHeight,
              height: window.innerHeight,
              left: 0,
              right: window.innerWidth,
              top: 0,
              width: window.innerWidth,
          };
    if (surface?.dataset.workspacePresentation !== "os") {
        return bounds;
    }
    // keep the floating HUD out of the OS shell band (brand, workspaces, dock)
    const top = bounds.top + OSShellClearance;
    return { ...bounds, top, height: Math.max(0, bounds.bottom - top) };
}

export function clampHermesHudGeometry(
    geometry: Partial<HermesHudGeometry>,
    bounds: HudBounds = viewportBounds()
): HermesHudGeometry {
    const maxWidth = Math.max(1, bounds.width - HudViewportMargin * 2);
    const maxHeight = Math.max(1, bounds.height - HudViewportMargin - HudBottomClearance);
    const width = Math.min(maxWidth, Math.max(HudMinWidth, geometry.width ?? HudDefaultWidth));
    const height = Math.min(maxHeight, Math.max(HudMinHeight, geometry.height ?? HudDefaultHeight));
    const defaultX = bounds.left + HudViewportMargin;
    const defaultY = bounds.bottom - height - HudBottomClearance;
    const minX = bounds.left + HudViewportMargin;
    const minY = bounds.top + HudViewportMargin;
    const maxX = Math.max(minX, bounds.right - width - HudViewportMargin);
    const maxY = Math.max(minY, bounds.bottom - height - HudBottomClearance);

    return {
        x: Math.min(maxX, Math.max(minX, geometry.x ?? defaultX)),
        y: Math.min(maxY, Math.max(minY, geometry.y ?? defaultY)),
        width,
        height,
    };
}

function loadGeometry(): HermesHudGeometry {
    if (typeof window === "undefined") {
        return clampHermesHudGeometry({});
    }
    try {
        const raw = window.localStorage.getItem(GeometryStorageKey);
        return clampHermesHudGeometry(raw ? (JSON.parse(raw) as Partial<HermesHudGeometry>) : {});
    } catch {
        return clampHermesHudGeometry({});
    }
}

class HermesSurfaceController {
    private snapshot: HermesSurfaceSnapshot = {
        presentation: "closed",
        geometry: loadGeometry(),
        sessionId: null,
    };
    private listeners = new Set<() => void>();
    getSnapshot = (): HermesSurfaceSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    requestOpenHud(sessionId?: string | null): void {
        this.update({
            presentation: "hud",
            sessionId: sessionId ?? this.snapshot.sessionId,
            geometry: clampHermesHudGeometry(this.snapshot.geometry),
        });
    }

    requestOpenPanel(sessionId?: string | null): void {
        this.update({ presentation: "panel", sessionId: sessionId ?? this.snapshot.sessionId });
    }

    requestOpenChat(sessionId?: string | null): void {
        if (this.snapshot.presentation === "panel") {
            this.requestOpenPanel(sessionId);
            return;
        }
        this.requestOpenHud(sessionId);
    }

    dismiss(): void {
        this.update({ presentation: "closed" });
    }

    setSession(sessionId: string | null): void {
        this.update({ sessionId });
    }

    moveBy(delta: { x: number; y: number }): void {
        this.setGeometry({
            ...this.snapshot.geometry,
            x: this.snapshot.geometry.x + delta.x,
            y: this.snapshot.geometry.y + delta.y,
        });
    }

    setGeometry(geometry: Partial<HermesHudGeometry>): void {
        const next = clampHermesHudGeometry({ ...this.snapshot.geometry, ...geometry });
        try {
            window.localStorage.setItem(GeometryStorageKey, JSON.stringify(next));
        } catch {
            // In-memory geometry remains usable when storage is unavailable.
        }
        this.update({ geometry: next });
    }

    clampToViewport(): void {
        this.setGeometry(this.snapshot.geometry);
    }

    resetForTests(): void {
        this.snapshot = {
            presentation: "closed",
            geometry: clampHermesHudGeometry({}),
            sessionId: null,
        };
        this.emit();
    }

    private update(patch: Partial<HermesSurfaceSnapshot>): void {
        const next = { ...this.snapshot, ...patch };
        if (
            next.presentation === this.snapshot.presentation &&
            next.geometry === this.snapshot.geometry &&
            next.sessionId === this.snapshot.sessionId
        ) {
            return;
        }
        this.snapshot = next;
        this.emit();
    }

    private emit(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

export const hermesSurfaceController = new HermesSurfaceController();
