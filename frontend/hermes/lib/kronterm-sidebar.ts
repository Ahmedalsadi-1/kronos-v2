import { atom } from "nanostores";

export const $krontermSidebarTarget = atom<HTMLElement>(null);
export const $krontermInspectorTarget = atom<HTMLElement>(null);
export const $krontermInspectorOpen = atom(false);
export const $krontermInspectorHasFiles = atom(false);
export type KrontermInspectorSection = "files" | "changes" | "chat" | "diff" | `file:${string}`;
export const $krontermInspectorSection = atom<KrontermInspectorSection>("files");
export const $krontermInspectorExpanded = atom(false);

// Dragged side-panel width in CSS pixels; null keeps the layout default.
export const $krontermInspectorWidth = atom<number>(null);
// Rail mode: the side panel folds to an icon-only strip.
export const $krontermInspectorCompact = atom(false);
export const KRONTERM_INSPECTOR_MIN_WIDTH = 240;
export const KRONTERM_INSPECTOR_MAX_WIDTH = 900;
export const KRONTERM_INSPECTOR_RESIZE_STEP = 16;
export const KrontermInspectorChatEvent = "kronterm:inspector-chat";
export const KrontermInspectorChatTargetId = "kronterm-inspector-chat";
export const $krontermSidebarOwner = atom<symbol>(null);
export const KrontermSidebarActivateEvent = "kronterm:sidebar-activate";

const SidebarOwners = new Map<symbol, number>();

function syncSidebarOwner(): void {
    const owners = [...SidebarOwners].sort((a, b) => b[1] - a[1]);
    $krontermSidebarOwner.set(owners[0]?.[0] ?? null);
}

export function registerKrontermSidebarOwner(owner: symbol, preferred = false): () => void {
    SidebarOwners.set(owner, preferred ? 1 : 0);
    syncSidebarOwner();
    return () => {
        SidebarOwners.delete(owner);
        syncSidebarOwner();
    };
}

export const KrontermInspectorFileEvent = "kronterm:inspector-file";
export function openKrontermFile(path: string): void {
    $krontermInspectorSection.set(`file:${path}`);
    $krontermInspectorOpen.set(true);
    window.dispatchEvent(new CustomEvent(KrontermInspectorFileEvent, { detail: { path } }));
}
