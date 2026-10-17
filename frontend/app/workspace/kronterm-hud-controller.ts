// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type KronTermHudSnapshot = {
    active: boolean;
    selectedBlockId?: string;
    expanded?: boolean;
    keepWorkspaceVisible: boolean;
    islandBlockIds: readonly string[];
    backgroundBlockIds: readonly string[];
};

const HudIslandsStorageKey = "kronterm:os-hud-islands:v1";

export function readStoredHudIslands(tabId: string): string[] {
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(`${HudIslandsStorageKey}:${tabId}`) ?? "[]");
        return Array.isArray(value)
            ? [...new Set(value.filter((id) => typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id)))].slice(0, 40)
            : [];
    } catch {
        return [];
    }
}

const HudModeStorageKey = "kronterm:os-hud-mode";
const HudWorkspacePlacementStorageKey = "kronterm:os-hud-workspace-placement";

function readStoredHudMode(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(HudModeStorageKey) === "true";
    } catch {
        return false;
    }
}

function readStoredWorkspacePlacement(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(HudWorkspacePlacementStorageKey) === "true";
    } catch {
        return false;
    }
}

class KronTermHudController {
    private snapshot: KronTermHudSnapshot = {
        active: readStoredHudMode(),
        keepWorkspaceVisible: readStoredWorkspacePlacement(),
        islandBlockIds: [],
        backgroundBlockIds: [],
    };
    private ownerTabId: string;

    setOwnerTab(tabId: string): void {
        if (!tabId || this.ownerTabId === tabId) return;
        this.ownerTabId = tabId;
        this.snapshot = {
            ...this.snapshot,
            islandBlockIds: readStoredHudIslands(tabId),
            backgroundBlockIds: [],
            selectedBlockId: undefined,
            expanded: true,
        };
        this.emit();
    }

    private listeners = new Set<() => void>();

    getSnapshot = (): KronTermHudSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    setActive(active: boolean): void {
        if (this.snapshot.active === active) return;
        this.snapshot = { ...this.snapshot, active };
        try {
            window.localStorage.setItem(HudModeStorageKey, String(active));
        } catch {
            // The live state remains authoritative when persistence is unavailable.
        }
        this.emit();
    }

    selectWidget(blockId: string, expanded: boolean): void {
        if (this.snapshot.selectedBlockId === blockId && this.snapshot.expanded === expanded) return;
        this.snapshot = { ...this.snapshot, selectedBlockId: blockId, expanded };
        this.emit();
    }

    registerIsland(blockId: string): void {
        if (!this.snapshot.active || this.snapshot.islandBlockIds.includes(blockId)) return;
        this.snapshot = { ...this.snapshot, islandBlockIds: [...this.snapshot.islandBlockIds, blockId] };
        this.emit();
    }

    unregisterIsland(blockId: string): void {
        if (!this.snapshot.islandBlockIds.includes(blockId)) return;
        this.snapshot = {
            ...this.snapshot,
            islandBlockIds: this.snapshot.islandBlockIds.filter((candidate) => candidate !== blockId),
        };
        this.emit();
    }

    isIsland(blockId: string): boolean {
        return this.snapshot.islandBlockIds.includes(blockId);
    }

    setBlockBackground(blockId: string, background: boolean): void {
        if (this.snapshot.backgroundBlockIds.includes(blockId) === background) return;
        this.snapshot = {
            ...this.snapshot,
            backgroundBlockIds: background
                ? [...this.snapshot.backgroundBlockIds, blockId]
                : this.snapshot.backgroundBlockIds.filter((candidate) => candidate !== blockId),
        };
        this.emit();
    }

    toggle(): boolean {
        if (!this.snapshot.active) this.snapshot = { ...this.snapshot, keepWorkspaceVisible: false };
        const active = !this.snapshot.active;
        this.setActive(active);
        return active;
    }

    openAlongsideWorkspace(): void {
        if (this.snapshot.active && this.snapshot.keepWorkspaceVisible) return;
        this.snapshot = { ...this.snapshot, keepWorkspaceVisible: true };
        if (!this.snapshot.active) {
            this.setActive(true);
            return;
        }
        this.emit();
    }

    openExclusiveHud(): void {
        if (this.snapshot.active && !this.snapshot.keepWorkspaceVisible) return;
        this.snapshot = { ...this.snapshot, keepWorkspaceVisible: false };
        if (!this.snapshot.active) {
            this.setActive(true);
            return;
        }
        this.emit();
    }

    resetForTests(): void {
        this.ownerTabId = undefined;
        this.snapshot = { active: false, keepWorkspaceVisible: false, islandBlockIds: [], backgroundBlockIds: [] };
        this.emit();
    }

    private emit(): void {
        try {
            if (this.ownerTabId)
                window.localStorage.setItem(
                    `${HudIslandsStorageKey}:${this.ownerTabId}`,
                    JSON.stringify(this.snapshot.islandBlockIds)
                );
            window.localStorage.setItem(HudWorkspacePlacementStorageKey, String(this.snapshot.keepWorkspaceVisible));
        } catch {
            // The live placement remains authoritative when persistence is unavailable.
        }
        for (const listener of this.listeners) listener();
    }
}

export const kronTermHudController = new KronTermHudController();
