// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { WOS } from "@/store/global";
import { atom, useAtom, useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { DefaultGameProject, exportGameHtml, normalizeGameProject, type GameProject } from "./game-project";

export class GameStudioModel implements ViewModel {
    viewType = "gamestudio";
    viewName = atom("Game Studio");
    viewIcon = atom("gamepad");
    noPadding = atom(true);
    blockId: string;
    project = atom<GameProject>({ ...DefaultGameProject });
    status = atom("");
    busy = atom(false);

    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
        const block = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${blockId}`));
        const saved = (block?.meta as Record<string, unknown>)?.["gamestudio:project"];
        if (saved && typeof saved === "object") globalStore.set(this.project, normalizeGameProject(saved));
    }

    get viewComponent(): ViewComponent {
        return GameStudio;
    }

    async save() {
        if (globalStore.get(this.busy)) return;
        globalStore.set(this.busy, true);
        globalStore.set(this.status, "Saving project…");
        try {
            const project = globalStore.get(this.project);
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { "gamestudio:project": project } as MetaType,
            });
            globalStore.set(this.status, "Project saved in this widget.");
        } catch (error) {
            globalStore.set(this.status, `Save failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            globalStore.set(this.busy, false);
        }
    }
}

export function GameStudio({ model }: { model: GameStudioModel }) {
    const [project, setProject] = useAtom(model.project);
    const status = useAtomValue(model.status);
    const busy = useAtomValue(model.busy);
    const appearance = useCoucouWorkbenchAppearance();
    const [previewProject, setPreviewProject] = useState(project);
    const [previewEpoch, setPreviewEpoch] = useState(0);
    const html = useMemo(() => exportGameHtml(previewProject), [previewProject]);
    const [exportStatus, setExportStatus] = useState("");
    const inputClass = "w-full rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-2 py-1.5";
    const buttonClass =
        "cursor-pointer rounded border border-[var(--coucou-border)] px-3 py-2 hover:bg-[var(--coucou-card)]";
    const update = (patch: Partial<GameProject>) => setProject(normalizeGameProject({ ...project, ...patch }));
    const download = () => {
        try {
            const url = URL.createObjectURL(new Blob([exportGameHtml(project)], { type: "text/html;charset=utf-8" }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${project.title.replace(/[^a-z0-9_-]+/gi, "-") || "game"}.html`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            setExportStatus("HTML download requested. Check Downloads for the exported game.");
        } catch (error) {
            setExportStatus(`Export failed: ${String(error)}`);
        }
    };
    return (
        <div
            style={appearance}
            className="flex h-full min-h-0 flex-col bg-[var(--coucou-surface)] text-[var(--coucou-label)]"
        >
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--coucou-border)] p-3">
                <span className="mr-auto font-semibold">Game Studio</span>
                <button
                    className={buttonClass}
                    onClick={() => {
                        setPreviewProject({ ...project });
                        setPreviewEpoch((value) => value + 1);
                    }}
                >
                    Run preview
                </button>
                <button className={buttonClass} disabled={busy} onClick={() => void model.save()}>
                    Save project
                </button>
                <button className={buttonClass} onClick={download}>
                    Export HTML
                </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-wrap overflow-auto">
                <div className="flex w-60 shrink-0 flex-col gap-4 border-r border-[var(--coucou-border)] p-4">
                    <label className="flex flex-col gap-1 text-sm">
                        Title
                        <input
                            className={inputClass}
                            value={project.title}
                            maxLength={80}
                            onChange={(e) => update({ title: e.target.value })}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        Template
                        <select
                            className={`${inputClass} cursor-pointer`}
                            value={project.mode}
                            onChange={(e) => update({ mode: e.target.value as GameProject["mode"] })}
                        >
                            <option value="collect">Collect orbs</option>
                            <option value="dodge">Dodge obstacles</option>
                        </select>
                    </label>
                    {(
                        [
                            ["speed", "Player speed", 80, 800, 10],
                            ["spawnRate", "Objects per second", 0.5, 8, 0.5],
                            ["duration", "Duration (seconds)", 10, 180, 5],
                        ] as const
                    ).map(([key, label, min, max, step]) => (
                        <label key={key} className="flex flex-col gap-1 text-sm">
                            {label}: {project[key]}
                            <input
                                className="cursor-pointer"
                                type="range"
                                min={min}
                                max={max}
                                step={step}
                                value={project[key]}
                                onChange={(e) => update({ [key]: Number(e.target.value) })}
                            />
                        </label>
                    ))}
                    <label className="flex flex-col gap-1 text-sm">
                        Player color
                        <input
                            className="h-9 w-full cursor-pointer"
                            type="color"
                            value={project.playerColor}
                            onChange={(e) => update({ playerColor: e.target.value })}
                        />
                    </label>
                    <p className="text-xs text-[var(--coucou-secondary)]">
                        Run preview applies your changes and restarts the game. Save keeps these settings with this
                        widget. Export produces a playable file with no server or dependencies.
                    </p>
                </div>
                <div className="min-h-[450px] min-w-[280px] flex-1 p-3">
                    <iframe
                        key={previewEpoch}
                        title="Playable game preview"
                        className="h-full min-h-[450px] w-full rounded-lg border border-[var(--coucou-border)]"
                        sandbox="allow-scripts"
                        srcDoc={html}
                    />
                </div>
            </div>
            {(status || exportStatus) && (
                <div className="border-t border-[var(--coucou-border)] px-4 py-2 text-xs" role="status">
                    {status} {exportStatus}
                </div>
            )}
        </div>
    );
}
