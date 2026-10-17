// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { attachOSResourceToKronos, revealOSResource } from "@/app/store/os-resource-service";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { getApi, WOS } from "@/store/global";
import { atom, useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { classifyMedia, filterMedia } from "./media-library-utils";

export class MediaLibraryViewModel implements ViewModel {
    viewType = "medialibrary";
    viewIcon = atom("photo-film");
    viewName = atom("Media Library");
    noPadding = atom(true);
    folder = atom("");
    entries = atom<FileInfo[]>([]);
    loading = atom(false);
    error = atom("");
    query = atom("");
    category = atom("all");
    generation = 0;
    env: ViewModelInitType["waveEnv"];
    blockId: string;

    constructor({ blockId, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
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

    async loadFolder(path: string, persist = true) {
        const generation = ++this.generation;
        globalStore.set(this.folder, path);
        globalStore.set(this.entries, []);
        globalStore.set(this.error, "");
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
    const [query, setQuery] = useAtom(model.query);
    const [category, setCategory] = useAtom(model.category);
    const appearance = useCoucouWorkbenchAppearance();
    const visible = filterMedia(entries, query, category);
    useEffect(() => () => model.dispose(), [model]);
    const resource = (entry: FileInfo) => ({
        id: `local:${entry.path}`,
        kind: entry.isdir ? ("folder" as const) : ("file" as const),
        name: entry.name ?? entry.path.split("/").pop(),
        resource: entry.path,
        detail: entry.path,
    });
    const buttonClass =
        "cursor-pointer rounded border border-[var(--coucou-border)] px-3 py-1.5 hover:bg-[var(--coucou-card)] disabled:opacity-50";
    return (
        <section
            style={appearance}
            className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
            aria-label="Media Library"
        >
            <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass} onClick={() => void model.chooseFolder()}>
                    Choose folder
                </button>
                <button
                    className={buttonClass}
                    disabled={!folder || loading}
                    onClick={() => void model.loadFolder(folder)}
                >
                    Refresh
                </button>
                <button
                    className={buttonClass}
                    disabled={!folder || folder === "/"}
                    onClick={() => void model.loadFolder(folder.replace(/\/?[^/]+\/?$/, "") || "/")}
                >
                    Parent folder
                </button>
            </div>
            <p className="truncate text-sm text-[var(--coucou-secondary)]" title={folder}>
                {folder || "Select a local folder to browse media."}
            </p>
            <div className="flex gap-2">
                <input
                    aria-label="Search filenames and paths"
                    placeholder="Search filenames and paths"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-3 py-2"
                />
                <select
                    aria-label="Media type"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="cursor-pointer rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-2"
                >
                    {["all", "image", "video", "audio", "3d", "document"].map((kind) => (
                        <option key={kind} value={kind}>
                            {kind === "all" ? "All media" : kind}
                        </option>
                    ))}
                </select>
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-400">
                    {error}
                </p>
            )}
            {loading && <p role="status">Loading folder...</p>}
            {!loading && folder && (
                <p className="text-xs text-[var(--coucou-secondary)]">
                    {visible.length} matching items in this folder. Subfolders open separately.
                </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
                {!loading && folder && visible.length === 0 && (
                    <p className="p-4 text-sm">No matching media or subfolders.</p>
                )}
                {visible.map((entry) => (
                    <div
                        key={entry.path}
                        className="mb-2 flex flex-wrap items-center gap-2 rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-3"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{entry.name ?? entry.path}</p>
                            <p className="truncate text-xs text-[var(--coucou-secondary)]" title={entry.path}>
                                {entry.path}
                            </p>
                            <p className="text-xs text-[var(--coucou-secondary)]">
                                {entry.isdir ? "Folder" : `${classifyMedia(entry)} · ${entry.size ?? 0} bytes`}
                            </p>
                        </div>
                        <button
                            className={buttonClass}
                            onClick={() =>
                                entry.isdir ? void model.loadFolder(entry.path) : getApi().openNativePath(entry.path)
                            }
                        >
                            {entry.isdir ? "Browse" : "Open"}
                        </button>
                        <button className={buttonClass} onClick={() => revealOSResource(resource(entry))}>
                            Reveal
                        </button>
                        <button className={buttonClass} onClick={() => attachOSResourceToKronos(resource(entry))}>
                            Attach
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
};
