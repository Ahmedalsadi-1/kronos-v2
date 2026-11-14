// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { OSResourceDragMimeType, readOSResourceDragPayload } from "@/app/store/os-resource-service";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { getApi, WOS } from "@/store/global";
import { getWebServerEndpoint } from "@/util/endpoints";
import { formatRemoteUri } from "@/util/waveutil";
import { atom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
    captionsAtTime,
    exportTrimmedSubtitles,
    isVideoStudioSource,
    normalizeVideoProject,
    type VideoProject,
} from "./video-project";

export class VideoStudioViewModel implements ViewModel {
    viewType = "videostudio";
    viewIcon = atom("film");
    viewName = atom("Video Studio");
    noPadding = atom(true);
    project = atom<VideoProject>(normalizeVideoProject(null));
    pendingSource = atom("");
    error = atom("");
    status = atom("");
    env: ViewModelInitType["waveEnv"];
    blockId: string;
    saveQueue: Promise<void> = Promise.resolve();

    constructor({ blockId, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.env = waveEnv;
        const block = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${blockId}`));
        globalStore.set(this.project, normalizeVideoProject(block?.meta?.["videostudio:project"]));
    }

    get viewComponent(): ViewComponent {
        return VideoStudioView;
    }

    updateProject(project: VideoProject) {
        const snapshot = normalizeVideoProject(project);
        globalStore.set(this.project, snapshot);
        globalStore.set(this.status, "Saving project...");
        this.saveQueue = this.saveQueue
            .catch(() => {})
            .then(async () => {
                try {
                    await this.env.rpc.SetMetaCommand(TabRpcClient, {
                        oref: WOS.makeORef("block", this.blockId),
                        meta: { "videostudio:project": snapshot } as MetaType,
                    });
                    if (globalStore.get(this.project) === snapshot) {
                        globalStore.set(this.status, "Project saved");
                        if (globalStore.get(this.error).startsWith("Project could not be saved:"))
                            globalStore.set(this.error, "");
                    }
                } catch (error) {
                    globalStore.set(this.error, `Project could not be saved: ${String(error)}`);
                    globalStore.set(this.status, "Unsaved project");
                }
            });
    }

    async importVideo() {
        try {
            const paths = await getApi().selectFiles();
            if (paths?.length) this.requestSource(paths[0]);
        } catch (error) {
            globalStore.set(this.error, String(error));
        }
    }

    requestSource(path: unknown) {
        if (!isVideoStudioSource(path)) {
            globalStore.set(this.error, "Choose a local MP4, MOV, WebM, M4V, MKV, or AVI video.");
            return;
        }
        const { source } = globalStore.get(this.project);
        globalStore.set(this.error, "");
        globalStore.set(this.pendingSource, "");
        if (path === source) return;
        if (source) globalStore.set(this.pendingSource, path);
        else this.updateProject(normalizeVideoProject({ source: path }));
    }

    replaceSource() {
        const source = globalStore.get(this.pendingSource);
        if (!source) return;
        globalStore.set(this.pendingSource, "");
        this.updateProject(normalizeVideoProject({ source }));
    }

    async exportProject(subtitles = false) {
        try {
            const project = globalStore.get(this.project);
            const saved = await getApi().saveTextFile(
                subtitles ? "captions.srt" : "video-project.json",
                subtitles ? exportTrimmedSubtitles(project) : JSON.stringify(project, null, 2)
            );
            globalStore.set(this.status, saved ? "Export saved" : "Export canceled");
        } catch (error) {
            globalStore.set(this.error, String(error));
        }
    }
}

export const VideoStudioView: ViewComponent = ({ model: genericModel }) => {
    const model = genericModel as VideoStudioViewModel;
    const project = useAtomValue(model.project);
    const pendingSource = useAtomValue(model.pendingSource);
    const error = useAtomValue(model.error);
    const status = useAtomValue(model.status);
    const appearance = useCoucouWorkbenchAppearance();
    const video = useRef<HTMLVideoElement>(null);
    const importButton = useRef<HTMLButtonElement>(null);
    const cancelReplaceButton = useRef<HTMLButtonElement>(null);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [captionText, setCaptionText] = useState("");
    const [captionStart, setCaptionStart] = useState("0");
    const [captionEnd, setCaptionEnd] = useState("2");
    const [captionError, setCaptionError] = useState("");
    const endpoint = getWebServerEndpoint();
    const source =
        project.source && endpoint
            ? `${endpoint}/wave/stream-file?path=${encodeURIComponent(formatRemoteUri(project.source, "local"))}`
            : "";
    const activeCaptions = captionsAtTime(project, time);
    useEffect(() => {
        setTime(0);
        setPlaying(false);
        setCaptionText("");
        setCaptionStart("0");
        setCaptionEnd("2");
        setCaptionError("");
    }, [project.source]);
    useEffect(() => {
        if (pendingSource) cancelReplaceButton.current?.focus();
    }, [pendingSource]);
    const buttonClass =
        "cursor-pointer rounded border border-[var(--coucou-border)] px-3 py-1.5 hover:bg-[var(--coucou-card)] disabled:opacity-50";
    const inputClass = "min-w-0 rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-2 py-1";
    const seek = (position: number) => {
        if (video.current) {
            video.current.pause();
            video.current.currentTime = position;
        }
        setTime(position);
    };
    const addCaption = () => {
        const start = Number(captionStart),
            end = Number(captionEnd);
        if (
            !captionText.trim() ||
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            start < 0 ||
            end <= start ||
            end > project.duration
        ) {
            setCaptionError("Enter text and a valid start/end within the source duration.");
            return;
        }
        model.updateProject({
            ...project,
            captions: [...project.captions, { id: crypto.randomUUID(), start, end, text: captionText.trim() }],
        });
        setCaptionText("");
        setCaptionError("");
    };
    return (
        <section
            style={appearance}
            className="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
            aria-label="Video Studio"
            onDragOver={(event) => {
                if (event.defaultPrevented || !event.dataTransfer.types.includes(OSResourceDragMimeType)) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
                if (event.defaultPrevented || !event.dataTransfer.types.includes(OSResourceDragMimeType)) return;
                event.preventDefault();
                event.stopPropagation();
                const resource = readOSResourceDragPayload(event.dataTransfer);
                model.requestSource(
                    resource?.kind === "file" || resource?.kind === "generated-artifact" ? resource.resource : undefined
                );
            }}
        >
            <div className="flex flex-wrap gap-2">
                <button
                    ref={importButton}
                    type="button"
                    className={buttonClass}
                    onClick={() => void model.importVideo()}
                >
                    Import video
                </button>
                <button className={buttonClass} disabled={!project.source} onClick={() => model.updateProject(project)}>
                    Save project
                </button>
                <button className={buttonClass} disabled={!project.source} onClick={() => void model.exportProject()}>
                    Export project JSON
                </button>
                <button
                    className={buttonClass}
                    disabled={!project.captions.length}
                    onClick={() => void model.exportProject(true)}
                >
                    Export trimmed captions
                </button>
            </div>
            <p className="truncate text-xs text-[var(--coucou-secondary)]" title={project.source}>
                {project.source || "Import a video or drag one from Media Library to edit its trim and captions."}
            </p>
            {pendingSource && (
                <div
                    role="group"
                    aria-label="Replace video source"
                    className="flex flex-wrap items-center gap-2 rounded border border-[var(--coucou-border)] p-2"
                >
                    <p className="min-w-0 basis-full text-sm break-words">
                        Replace this video with {pendingSource.split(/[\\/]/).pop()}? Replacing clears the trim and
                        captions.
                    </p>
                    <button
                        ref={cancelReplaceButton}
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                            globalStore.set(model.pendingSource, "");
                            importButton.current?.focus();
                        }}
                    >
                        Keep current video
                    </button>
                    <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                            model.replaceSource();
                            importButton.current?.focus();
                        }}
                    >
                        Replace video
                    </button>
                </div>
            )}
            {error && (
                <p role="alert" className="text-sm text-red-400">
                    {error}
                </p>
            )}
            <div className="relative min-h-40 flex-shrink-0 bg-black">
                {source ? (
                    <video
                        key={project.source}
                        ref={video}
                        src={source}
                        className="max-h-80 w-full"
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                            const duration = event.currentTarget.duration;
                            if (!Number.isFinite(duration)) return;
                            const current = globalStore.get(model.project);
                            if (current.source !== project.source) return;
                            if (duration !== current.duration) {
                                model.updateProject({
                                    ...current,
                                    duration,
                                    trimEnd: current.duration === 0 ? duration : current.trimEnd,
                                });
                            }
                            seek(Math.min(duration, current.trimStart));
                        }}
                        onTimeUpdate={(event) => {
                            const player = event.currentTarget;
                            setTime(player.currentTime);
                            if (!player.paused && player.currentTime >= project.trimEnd) {
                                player.pause();
                                seek(project.trimEnd);
                            }
                        }}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onError={() =>
                            globalStore.set(
                                model.error,
                                "This source could not be played. Check the file still exists and its codec is supported."
                            )
                        }
                    />
                ) : (
                    <p className="p-8 text-center text-sm text-white">No video loaded</p>
                )}
                {activeCaptions.length > 0 && (
                    <div className="pointer-events-none absolute inset-x-4 bottom-3 text-center">
                        <span className="whitespace-pre-wrap rounded bg-black/80 px-3 py-1 text-white">
                            {activeCaptions.map((caption) => caption.text).join("\n")}
                        </span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-3">
                <button
                    className={buttonClass}
                    disabled={!project.duration}
                    onClick={() => {
                        const player = video.current;
                        if (!player) return;
                        if (playing) player.pause();
                        else {
                            if (player.currentTime < project.trimStart || player.currentTime >= project.trimEnd)
                                seek(project.trimStart);
                            void player.play().catch((error) => globalStore.set(model.error, String(error)));
                        }
                    }}
                >
                    {playing ? "Pause" : "Play trim"}
                </button>
                <input
                    className="min-w-0 flex-1 cursor-pointer"
                    aria-label="Timeline playhead"
                    type="range"
                    min={0}
                    max={project.duration || 0}
                    step={0.01}
                    value={time}
                    onChange={(event) => seek(Number(event.target.value))}
                />
                <span className="text-xs">
                    {time.toFixed(2)} / {project.duration.toFixed(2)}s
                </span>
            </div>
            {project.duration > 0 && (
                <div
                    className="relative h-8 flex-shrink-0 rounded bg-[var(--coucou-card)]"
                    aria-label="Caption timeline"
                >
                    <div
                        className="absolute inset-y-0 border-x border-[var(--coucou-accent)] bg-[var(--coucou-accent)]/10"
                        style={{
                            left: `${(project.trimStart / project.duration) * 100}%`,
                            width: `${((project.trimEnd - project.trimStart) / project.duration) * 100}%`,
                        }}
                    />
                    {project.captions.map((caption) => (
                        <button
                            key={caption.id}
                            title={`${caption.start}–${caption.end}s: ${caption.text}`}
                            aria-label={`Seek to caption: ${caption.text}`}
                            className="absolute top-2 h-4 cursor-pointer overflow-hidden rounded bg-[var(--coucou-accent)] px-1 text-xs text-black"
                            style={{
                                left: `${(caption.start / project.duration) * 100}%`,
                                width: `${((Math.min(project.duration, caption.end) - caption.start) / project.duration) * 100}%`,
                            }}
                            onClick={() => seek(caption.start)}
                        >
                            {caption.text}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
                <label>
                    Trim in{" "}
                    <input
                        className={`${inputClass} w-24`}
                        type="number"
                        min={0}
                        max={project.trimEnd}
                        step={0.1}
                        value={project.trimStart}
                        onChange={(event) =>
                            model.updateProject({
                                ...project,
                                trimStart: Math.min(project.trimEnd, Number(event.target.value)),
                            })
                        }
                    />
                </label>
                <label>
                    Trim out{" "}
                    <input
                        className={`${inputClass} w-24`}
                        type="number"
                        min={project.trimStart}
                        max={project.duration}
                        step={0.1}
                        value={project.trimEnd}
                        onChange={(event) =>
                            model.updateProject({
                                ...project,
                                trimEnd: Math.max(project.trimStart, Number(event.target.value)),
                            })
                        }
                    />
                </label>
            </div>
            <fieldset className="flex flex-wrap gap-2 border-t border-[var(--coucou-border)] pt-3">
                <legend className="text-sm">Timed captions (source seconds)</legend>
                <input
                    aria-label="Caption text"
                    className={`${inputClass} flex-1`}
                    value={captionText}
                    placeholder="Caption text"
                    onChange={(event) => setCaptionText(event.target.value)}
                />
                <input
                    aria-label="Caption start"
                    className={`${inputClass} w-20`}
                    type="number"
                    step={0.1}
                    value={captionStart}
                    onChange={(event) => setCaptionStart(event.target.value)}
                />
                <input
                    aria-label="Caption end"
                    className={`${inputClass} w-20`}
                    type="number"
                    step={0.1}
                    value={captionEnd}
                    onChange={(event) => setCaptionEnd(event.target.value)}
                />
                <button className={buttonClass} disabled={!project.duration} onClick={addCaption}>
                    Add caption
                </button>
            </fieldset>
            {captionError && (
                <p role="alert" className="text-sm text-red-400">
                    {captionError}
                </p>
            )}
            {project.captions.map((caption) => (
                <div
                    key={caption.id}
                    className="flex items-center gap-2 rounded border border-[var(--coucou-border)] p-2"
                >
                    <button className={buttonClass} onClick={() => seek(caption.start)}>
                        {caption.start.toFixed(1)}–{caption.end.toFixed(1)}s
                    </button>
                    <input
                        aria-label={`Start time for caption ${caption.text}`}
                        className={`${inputClass} w-20`}
                        type="number"
                        min={0}
                        max={caption.end - 0.01}
                        step={0.1}
                        value={caption.start}
                        onChange={(event) =>
                            model.updateProject({
                                ...project,
                                captions: project.captions.map((item) =>
                                    item.id === caption.id
                                        ? {
                                              ...item,
                                              start: Math.max(0, Math.min(item.end - 0.01, Number(event.target.value))),
                                          }
                                        : item
                                ),
                            })
                        }
                    />
                    <input
                        aria-label={`End time for caption ${caption.text}`}
                        className={`${inputClass} w-20`}
                        type="number"
                        min={caption.start + 0.01}
                        max={project.duration}
                        step={0.1}
                        value={caption.end}
                        onChange={(event) =>
                            model.updateProject({
                                ...project,
                                captions: project.captions.map((item) =>
                                    item.id === caption.id
                                        ? {
                                              ...item,
                                              end: Math.min(
                                                  project.duration,
                                                  Math.max(item.start + 0.01, Number(event.target.value))
                                              ),
                                          }
                                        : item
                                ),
                            })
                        }
                    />
                    <input
                        aria-label={`Caption at ${caption.start} seconds`}
                        value={caption.text}
                        className={`${inputClass} flex-1`}
                        onChange={(event) =>
                            model.updateProject({
                                ...project,
                                captions: project.captions.map((item) =>
                                    item.id === caption.id ? { ...item, text: event.target.value } : item
                                ),
                            })
                        }
                    />
                    <button
                        className={buttonClass}
                        onClick={() =>
                            model.updateProject({
                                ...project,
                                captions: project.captions.filter((item) => item.id !== caption.id),
                            })
                        }
                    >
                        Remove
                    </button>
                </div>
            ))}
            <p role="status" className="text-xs text-[var(--coucou-secondary)]">
                {status}
            </p>
            <p className="text-xs text-[var(--coucou-secondary)]">
                Exports project JSON referencing the original file and SRT captions shifted to the trim start. This
                editor does not render a new video file.
            </p>
        </section>
    );
};
