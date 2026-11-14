// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { getApi, WOS } from "@/store/global";
import { atom, useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { captionsFromSrt, captionsToSrt, validateCaptions, type CaptionRow } from "./captions";

export class AudioStudioModel implements ViewModel {
    viewType = "audiostudio";
    viewName = atom("Audio Studio");
    viewIcon = atom("headphones");
    noPadding = atom(true);
    viewComponent = AudioStudio;
    blockId: string;
    rows = atom<CaptionRow[]>([]);
    search = atom("");
    error = atom("");
    notice = atom("");
    source = atom("");
    filename = atom("");
    saving = atom(false);
    transcribing = atom(false);
    starting = atom(false);
    loaded = false;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
    }
    hydrate() {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const block = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${this.blockId}`));
            if (block?.meta?.["audiostudio:captions"])
                globalStore.set(this.rows, validateCaptions(block.meta["audiostudio:captions"]));
        } catch (error) {
            globalStore.set(this.error, String(error));
        }
    }
    async save() {
        globalStore.set(this.saving, true);
        globalStore.set(this.error, "");
        try {
            const rows = validateCaptions(globalStore.get(this.rows));
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { "audiostudio:captions": rows } as MetaType,
            });
            globalStore.set(this.notice, "Caption snapshot saved to this widget.");
        } catch (error) {
            globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        } finally {
            globalStore.set(this.saving, false);
        }
    }
    async startEngine() {
        globalStore.set(this.starting, true);
        globalStore.set(this.error, "");
        try {
            const ready = await getApi().audioStart();
            if (!ready)
                throw new Error(
                    "The local audio engine could not start. Check its Python runtime and installed voice dependencies."
                );
            globalStore.set(
                this.notice,
                "Local audio engine started. File transcription requires a cached speech model."
            );
        } catch (error) {
            globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        } finally {
            globalStore.set(this.starting, false);
        }
    }
    async transcribeFile() {
        if (globalStore.get(this.transcribing)) return;
        globalStore.set(this.transcribing, true);
        globalStore.set(this.error, "");
        globalStore.set(this.notice, "");
        try {
            const api = getApi() as ReturnType<typeof getApi> & {
                audioTranscribeFile?: (
                    path: string
                ) => Promise<{ segments: { start: number; end: number; text: string }[]; language?: string }>;
            };
            if (!api.audioTranscribeFile)
                throw new Error("File transcription requires the updated KronOS desktop audio bridge.");
            if (
                globalStore.get(this.rows).length &&
                !window.confirm("Replace current captions with a new local transcription?")
            )
                return;
            const files = await api.selectFiles();
            if (!files?.length) return;
            globalStore.set(this.notice, "Transcribing locally using the cached voice model…");
            const result = await api.audioTranscribeFile(files[0]);
            const rows = validateCaptions(
                result.segments.map((segment, index) => ({ id: `transcript-${index}`, ...segment }))
            );
            globalStore.set(this.rows, rows);
            const previous = globalStore.get(this.source);
            if (previous) URL.revokeObjectURL(previous);
            globalStore.set(this.source, "");
            globalStore.set(this.filename, files[0].split(/[\\/]/).at(-1) ?? "audio");
            globalStore.set(
                this.notice,
                `${rows.length} caption segments transcribed locally${result.language ? ` (${result.language})` : ""}. Save captions to retain them. Import the same audio file for playback.`
            );
        } catch (error) {
            globalStore.set(this.notice, "");
            globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        } finally {
            globalStore.set(this.transcribing, false);
        }
    }
    update(id: string, patch: Partial<CaptionRow>) {
        globalStore.set(
            this.rows,
            globalStore.get(this.rows).map((row) => (row.id === id ? { ...row, ...patch } : row))
        );
        globalStore.set(this.notice, "Caption edits have not been saved.");
    }
    importAudio(file: File) {
        const previous = globalStore.get(this.source);
        if (previous) URL.revokeObjectURL(previous);
        globalStore.set(this.source, URL.createObjectURL(file));
        globalStore.set(this.filename, file.name);
        globalStore.set(this.notice, "Audio stays on this computer. Reimport it after reopening this widget.");
    }
    dispose() {
        const source = globalStore.get(this.source);
        if (source) URL.revokeObjectURL(source);
    }
}

export function AudioStudio({ model }: ViewComponentProps<AudioStudioModel>) {
    const appearance = useCoucouWorkbenchAppearance();
    const [rows, setRows] = useAtom(model.rows);
    const [search, setSearch] = useAtom(model.search);
    const error = useAtomValue(model.error);
    const notice = useAtomValue(model.notice);
    const source = useAtomValue(model.source);
    const filename = useAtomValue(model.filename);
    const saving = useAtomValue(model.saving);
    const transcribing = useAtomValue(model.transcribing);
    const starting = useAtomValue(model.starting);
    const audioRef = useRef<HTMLAudioElement>(null);
    const audioInput = useRef<HTMLInputElement>(null);
    const srtInput = useRef<HTMLInputElement>(null);
    useEffect(() => model.hydrate(), [model]);
    const button = "cursor-pointer rounded border border-[var(--coucou-border)] px-3 py-2 disabled:opacity-40";
    function exportSrt() {
        try {
            const url = URL.createObjectURL(new Blob([captionsToSrt(rows)], { type: "text/plain;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `${filename.replace(/\.[^.]+$/, "") || "captions"}.srt`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            globalStore.set(model.error, "");
        } catch (error) {
            globalStore.set(model.error, String(error instanceof Error ? error.message : error));
        }
    }
    return (
        <section
            style={appearance}
            className="h-full overflow-auto bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
        >
            <h2 className="text-lg font-semibold">Audio Studio</h2>
            <p className="mt-1 text-sm text-[var(--coucou-secondary)]">
                Listen to local audio, edit timestamped captions and export SRT.
            </p>
            <div className="my-4 flex flex-wrap gap-2">
                <input
                    ref={audioInput}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) model.importAudio(file);
                        e.target.value = "";
                    }}
                />
                <input
                    ref={srtInput}
                    type="file"
                    accept=".srt"
                    className="hidden"
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                            if (file.size > 2_000_000) throw new Error("SRT exceeds 2 MB.");
                            const parsed = captionsFromSrt(await file.text());
                            if (rows.length && !window.confirm("Replace the current captions with this SRT file?"))
                                return;
                            setRows(parsed);
                            globalStore.set(model.notice, "Imported captions have not been saved.");
                            globalStore.set(model.error, "");
                        } catch (error) {
                            globalStore.set(model.error, String(error));
                        } finally {
                            e.target.value = "";
                        }
                    }}
                />
                <button className={button} disabled={transcribing} onClick={() => audioInput.current?.click()}>
                    Import audio
                </button>
                <button className={button} disabled={starting || transcribing} onClick={() => void model.startEngine()}>
                    {starting ? "Starting engine…" : "Start local voice engine"}
                </button>
                <button
                    className={button}
                    disabled={transcribing || saving || starting}
                    onClick={() => void model.transcribeFile()}
                >
                    {transcribing ? "Transcribing…" : "Transcribe local file"}
                </button>
                <button className={button} disabled={transcribing} onClick={() => srtInput.current?.click()}>
                    Import SRT
                </button>
                <button className={button} disabled={saving || transcribing} onClick={() => void model.save()}>
                    {saving ? "Saving…" : "Save captions"}
                </button>
                <button className={button} disabled={!rows.length} onClick={exportSrt}>
                    Export SRT
                </button>
            </div>
            {source && (
                <div className="my-3">
                    <p className="mb-2 text-sm">{filename}</p>
                    <audio
                        ref={audioRef}
                        controls
                        src={source}
                        className="w-full"
                        onError={() =>
                            globalStore.set(
                                model.error,
                                "This audio format could not be played. Try WAV, MP3 or another format supported by the desktop player."
                            )
                        }
                    />
                </div>
            )}
            <p className="my-3 text-sm text-[var(--coucou-secondary)]">
                Local file transcription requires the voice engine and an already cached faster-whisper model. No audio
                is uploaded and no model is downloaded.
            </p>
            {error && (
                <p role="alert" className="mb-3 text-sm text-red-400">
                    {error}
                </p>
            )}
            {notice && (
                <p role="status" className="mb-3 text-sm">
                    {notice}
                </p>
            )}
            <div className="mb-3 flex gap-2">
                <input
                    aria-label="Search caption text"
                    className="min-w-0 grow rounded border border-[var(--coucou-border)] bg-transparent p-2"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search captions"
                />
                <button
                    className={button}
                    disabled={transcribing}
                    onClick={() => {
                        const start = audioRef.current?.currentTime ?? rows.at(-1)?.end ?? 0;
                        setRows([...rows, { id: crypto.randomUUID(), start, end: start + 3, text: "" }]);
                        globalStore.set(model.notice, "Caption edits have not been saved.");
                    }}
                >
                    Add caption here
                </button>
            </div>
            <div className="space-y-3">
                {rows
                    .filter((row) => row.text.toLowerCase().includes(search.toLowerCase()))
                    .map((row) => (
                        <div
                            key={row.id}
                            className="rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-3"
                        >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <label className="text-xs">
                                    Start seconds{" "}
                                    <input
                                        aria-label="Caption start seconds"
                                        disabled={transcribing}
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={row.start}
                                        onChange={(e) => model.update(row.id, { start: Number(e.target.value) })}
                                        className="w-24 rounded border border-[var(--coucou-border)] bg-transparent p-1"
                                    />
                                </label>
                                <label className="text-xs">
                                    End seconds{" "}
                                    <input
                                        aria-label="Caption end seconds"
                                        disabled={transcribing}
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={row.end}
                                        onChange={(e) => model.update(row.id, { end: Number(e.target.value) })}
                                        className="w-24 rounded border border-[var(--coucou-border)] bg-transparent p-1"
                                    />
                                </label>
                                <button
                                    className={button}
                                    disabled={!source}
                                    onClick={() => {
                                        if (audioRef.current) audioRef.current.currentTime = Math.max(0, row.start);
                                    }}
                                >
                                    Seek
                                </button>
                                <button
                                    className={button}
                                    disabled={transcribing}
                                    onClick={() => {
                                        setRows(rows.filter((item) => item.id !== row.id));
                                        globalStore.set(model.notice, "Caption edits have not been saved.");
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                            <textarea
                                aria-label="Caption text"
                                disabled={transcribing}
                                className="w-full rounded border border-[var(--coucou-border)] bg-transparent p-2 text-sm"
                                value={row.text}
                                onChange={(e) => model.update(row.id, { text: e.target.value })}
                            />
                        </div>
                    ))}
            </div>
            {!rows.length && (
                <p className="text-sm text-[var(--coucou-secondary)]">
                    No captions yet. Import an SRT file or add a caption at the current playback position.
                </p>
            )}
        </section>
    );
}
