// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatFileSize } from "@/app/aipanel/ai-utils";
import { Box, FileText, FolderOpen, Music2 } from "@/app/components/system-ui/os-icons";
import { globalStore } from "@/app/store/jotaiStore";
import {
    attachOSResourceToKronos,
    revealOSResource,
    writeOSResourceDragPayload,
    type OSResourceReference,
} from "@/app/store/os-resource-service";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { readWorkspacePresentation, subscribeWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { controlWorkspaceSurface } from "@/app/tab/workspace-surface-runtime";
import { isVideoStudioSource, normalizeVideoProject } from "@/app/view/videostudio/video-project";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { createBlock, getApi, WOS } from "@/store/global";
import { getWebServerEndpoint } from "@/util/endpoints";
import { formatRemoteUri } from "@/util/waveutil";
import { atom, useAtom, useAtomValue } from "jotai";
import { useMemo, useState, useSyncExternalStore } from "react";
import { canPreviewMedia, canThumbnailMedia, classifyMedia, filterMedia } from "./media-library-utils";

const MediaLabels: Record<string, string> = {
    all: "All media",
    image: "Images",
    video: "Video",
    audio: "Audio",
    "3d": "3D models",
    document: "Documents",
};

const ControlFocus =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--coucou-accent)]";
const MediaButton = `min-h-8 cursor-pointer rounded-md border border-[var(--coucou-border)] px-2.5 py-1 text-sm hover:border-[var(--coucou-secondary)] disabled:opacity-50 ${ControlFocus}`;

function resourceForMedia(entry: FileInfo): OSResourceReference {
    return {
        id: `local:${entry.path}`,
        kind: entry.isdir ? "folder" : "file",
        name: entry.name || entry.path.split(/[\\/]/).pop() || entry.path,
        resource: entry.path,
        detail: entry.path,
    };
}

function MediaThumbnail({ entry, kind }: { entry: FileInfo; kind: string }) {
    const [failed, setFailed] = useState(false);
    const endpoint = canThumbnailMedia(entry) ? getWebServerEndpoint() : null;
    const Icon = kind === "folder" ? FolderOpen : kind === "3d" ? Box : kind === "audio" ? Music2 : FileText;
    return (
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--coucou-border)] bg-[var(--coucou-surface)] text-[var(--coucou-secondary)]">
            {endpoint && !failed ? (
                <img
                    className="size-full object-contain"
                    src={`${endpoint}/wave/stream-file?${new URLSearchParams({ path: formatRemoteUri(entry.path, "local") })}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onError={() => setFailed(true)}
                />
            ) : (
                <Icon size={20} />
            )}
        </div>
    );
}

export class MediaLibraryViewModel implements ViewModel {
    viewType = "medialibrary";
    viewIcon = atom("photo-film");
    viewName = atom("Media Library");
    noPadding = atom(true);
    folder = atom("");
    entries = atom<FileInfo[]>([]);
    loading = atom(false);
    error = atom("");
    feedback = atom({ message: "", error: false });
    query = atom("");
    category = atom("all");
    generation = 0;
    env: ViewModelInitType["waveEnv"];
    blockId: string;
    tabId: string;

    constructor({ blockId, tabModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.tabId = tabModel?.tabId;
        this.env = waveEnv;
        const block = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${blockId}`));
        const savedFolder = block?.meta?.["medialibrary:folder"];
        if (typeof savedFolder === "string" && savedFolder.startsWith("/")) void this.loadFolder(savedFolder, false);
    }

    get viewComponent(): ViewComponent {
        return MediaLibraryView;
    }

    async chooseFolder() {
        try {
            const path = await getApi().selectDirectory();
            if (path != null) await this.loadFolder(path);
        } catch (error) {
            globalStore.set(this.error, String(error));
        }
    }

    async openEntry(entry: FileInfo) {
        globalStore.set(this.feedback, { message: "", error: false });
        try {
            if (entry.isdir) await this.loadFolder(entry.path);
            else if (canPreviewMedia(entry)) await createBlock({ meta: { view: "preview", file: entry.path } });
            else getApi().openNativePath(entry.path);
        } catch (error) {
            globalStore.set(this.feedback, { message: String(error), error: true });
        }
    }

    async pinEntry(entry: FileInfo) {
        globalStore.set(this.feedback, { message: "", error: false });
        try {
            const resource = resourceForMedia(entry);
            await controlWorkspaceSurface(this.tabId, {
                action: "add_file",
                file: resource.resource,
                text: resource.name,
            });
            globalStore.set(this.feedback, { message: `Pinned ${resource.name} to the canvas.`, error: false });
        } catch (error) {
            globalStore.set(this.feedback, { message: String(error), error: true });
        }
    }

    async openInVideoStudio(entry: FileInfo) {
        if (!this.tabId || entry.isdir || !isVideoStudioSource(entry.path)) return;
        globalStore.set(this.feedback, { message: "", error: false });
        try {
            await this.env.rpc.CreateBlockCommand(TabRpcClient, {
                tabid: this.tabId,
                focused: true,
                blockdef: {
                    meta: {
                        view: "videostudio",
                        "videostudio:project": normalizeVideoProject({ source: entry.path }),
                    } as MetaType,
                },
            });
        } catch (error) {
            globalStore.set(this.feedback, { message: String(error), error: true });
        }
    }

    async loadFolder(path: string, persist = true) {
        const generation = ++this.generation;
        globalStore.set(this.folder, path);
        globalStore.set(this.entries, []);
        globalStore.set(this.error, "");
        globalStore.set(this.feedback, { message: "", error: false });
        globalStore.set(this.loading, true);
        try {
            const entries = await this.env.rpc.FileListCommand(TabRpcClient, { path, opts: { all: false } });
            if (generation !== this.generation) return;
            globalStore.set(
                this.entries,
                entries
                    .filter((entry) => !entry.notfound && !entry.staterror)
                    .map((entry) => ({
                        ...entry,
                        path: entry.name ? `${path.replace(/\/$/, "")}/${entry.name}` : entry.path,
                    }))
            );
            if (persist) {
                await this.env.rpc.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("block", this.blockId),
                    meta: { "medialibrary:folder": path } as MetaType,
                });
            }
            if (generation !== this.generation) return;
            const failed = entries.filter((entry) => entry.staterror).length;
            if (failed > 0) globalStore.set(this.error, `${failed} items could not be inspected.`);
        } catch (error) {
            if (generation === this.generation) globalStore.set(this.error, String(error));
        } finally {
            if (generation === this.generation) globalStore.set(this.loading, false);
        }
    }

    dispose() {
        ++this.generation;
    }
}

export const MediaLibraryView: ViewComponent = ({ model: genericModel }) => {
    const model = genericModel as MediaLibraryViewModel;
    const folder = useAtomValue(model.folder);
    const entries = useAtomValue(model.entries);
    const loading = useAtomValue(model.loading);
    const error = useAtomValue(model.error);
    const feedback = useAtomValue(model.feedback);
    const [query, setQuery] = useAtom(model.query);
    const [category, setCategory] = useAtom(model.category);
    const appearance = useCoucouWorkbenchAppearance();
    const presentation = useSyncExternalStore(subscribeWorkspacePresentation, readWorkspacePresentation);
    const canPin = model.tabId != null && presentation === "os";
    const visible = useMemo(() => filterMedia(entries, query, category), [entries, query, category]);
    return (
        <section
            style={appearance}
            className="flex h-full w-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
            aria-label="Media Library"
        >
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={MediaButton} onClick={() => void model.chooseFolder()}>
                    Choose folder
                </button>
                <button
                    type="button"
                    className={MediaButton}
                    disabled={!folder || loading}
                    onClick={() => void model.loadFolder(folder)}
                >
                    Refresh
                </button>
                <button
                    type="button"
                    className={MediaButton}
                    disabled={!folder || folder === "/"}
                    onClick={() => void model.loadFolder(folder.replace(/\/?[^/]+\/?$/, "") || "/")}
                >
                    Parent folder
                </button>
            </div>
            <p className="truncate text-sm text-[var(--coucou-secondary)]" title={folder}>
                {folder || "Select a local folder to browse media."}
            </p>
            <div className="flex flex-wrap gap-2">
                <input
                    aria-label="Search filenames and paths"
                    placeholder="Search files"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={`min-w-24 flex-1 rounded-md border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-3 py-2 ${ControlFocus}`}
                />
                <select
                    aria-label="Media type"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className={`min-h-8 cursor-pointer rounded-md border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-2 ${ControlFocus}`}
                >
                    {Object.entries(MediaLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>
            {error && (
                <p role="alert" className="text-sm text-[var(--kt-danger,var(--coucou-label))]">
                    {error}
                </p>
            )}
            {feedback.message && (
                <p
                    role={feedback.error ? "alert" : "status"}
                    className={feedback.error ? "text-sm text-[var(--kt-danger,var(--coucou-label))]" : "text-sm"}
                >
                    {feedback.message}
                </p>
            )}
            {loading && <p role="status">Loading folder…</p>}
            {!loading && canPin && visible.some((entry) => !entry.isdir) && (
                <p className="text-xs text-[var(--coucou-secondary)]">
                    Drag a file to the canvas or choose Pin to canvas.
                </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
                {!loading && folder && visible.length === 0 && (
                    <p className="p-4 text-sm">No matching media or subfolders.</p>
                )}
                <ul className="space-y-2">
                    {visible.map((entry) => {
                        const resource = resourceForMedia(entry);
                        const kind = classifyMedia(entry);
                        const primaryAction = entry.isdir ? "Browse" : canPreviewMedia(entry) ? "Preview" : "Open";
                        const extension = /\.([^./\\]+)$/.exec(entry.path)?.[1]?.toUpperCase();
                        return (
                            <li
                                key={entry.path}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-2"
                                draggable={!entry.isdir}
                                onDragStart={(event) => {
                                    if (!entry.isdir) writeOSResourceDragPayload(event, resource);
                                }}
                            >
                                <div className="flex min-w-0 flex-[1_0_min(100%,12rem)] items-center gap-2">
                                    <MediaThumbnail entry={entry} kind={kind} />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium" title={entry.path}>
                                            {resource.name}
                                        </p>
                                        <p className="text-xs text-[var(--coucou-secondary)]">
                                            {entry.isdir
                                                ? "Folder"
                                                : [extension, entry.size != null && formatFileSize(entry.size)]
                                                      .filter(Boolean)
                                                      .join(" · ")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        type="button"
                                        className={MediaButton}
                                        aria-label={`${primaryAction} ${resource.name}`}
                                        onClick={() => void model.openEntry(entry)}
                                    >
                                        {primaryAction}
                                    </button>
                                    {model.tabId && !entry.isdir && isVideoStudioSource(entry.path) && (
                                        <button
                                            type="button"
                                            className={MediaButton}
                                            aria-label={`Edit ${resource.name} in Video Studio`}
                                            onClick={() => void model.openInVideoStudio(entry)}
                                        >
                                            Edit video
                                        </button>
                                    )}
                                    {canPin && !entry.isdir && (
                                        <button
                                            type="button"
                                            className={MediaButton}
                                            aria-label={`Pin ${resource.name} to canvas`}
                                            onClick={() => void model.pinEntry(entry)}
                                        >
                                            Pin to canvas
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={MediaButton}
                                        aria-label={`Reveal ${resource.name}`}
                                        onClick={() => revealOSResource(resource)}
                                    >
                                        Reveal
                                    </button>
                                    <button
                                        type="button"
                                        className={MediaButton}
                                        aria-label={`Attach ${resource.name} to KronOS Agent`}
                                        onClick={() => attachOSResourceToKronos(resource)}
                                    >
                                        Attach
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
};
