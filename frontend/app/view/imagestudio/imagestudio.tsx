// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { globalStore } from "@/app/store/jotaiStore";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { getApi } from "@/store/global";
import { atom, useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import type { ComfyJob, ComfyRequest, ComfyResponse, ComfyWorkflow } from "../../../types/comfyui";

export class ImageStudioModel implements ViewModel {
    viewType = "imagestudio";
    viewIcon = atom("image");
    viewName = atom("Image Studio");
    noPadding = atom(true);
    viewComponent = ImageStudio;
    blockId: string;
    origin = atom("http://127.0.0.1:8188");
    workflow = atom("");
    jobs = atom<ComfyJob[]>([]);
    busy = atom(false);
    error = atom("");
    health = atom("");
    selected = atom("");
    preview = atom("");
    previewFilename = atom("render.png");
    private disposed = false;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
    }
    async run(request: ComfyRequest) {
        if (globalStore.get(this.busy)) return;
        globalStore.set(this.busy, true);
        globalStore.set(this.error, "");
        try {
            const api = getApi() as ReturnType<typeof getApi> & {
                comfyUiRequest?: (request: ComfyRequest) => Promise<ComfyResponse>;
            };
            if (!api.comfyUiRequest) throw new Error("Image Studio requires the KronTerm desktop ComfyUI bridge.");
            const result = await api.comfyUiRequest(request);
            if (this.disposed) return;
            if (result.jobs) globalStore.set(this.jobs, result.jobs);
            if (result.version)
                globalStore.set(
                    this.health,
                    `Connected: ${result.version} · ${result.nodeTypes?.length ?? 0} node types`
                );
            if (result.imageData) {
                globalStore.set(this.preview, result.imageData);
                if (request.action === "image") globalStore.set(this.previewFilename, request.image.filename);
            }
        } catch (error) {
            if (!this.disposed) globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        } finally {
            globalStore.set(this.busy, false);
        }
    }
    submit() {
        try {
            const workflow = JSON.parse(globalStore.get(this.workflow)) as ComfyWorkflow;
            void this.run({ action: "submit", origin: globalStore.get(this.origin), workflow });
        } catch {
            globalStore.set(this.error, "Paste valid JSON exported from ComfyUI in API format.");
        }
    }
    dispose() {
        this.disposed = true;
    }
}

export function ImageStudio({ model }: ViewComponentProps<ImageStudioModel>) {
    const appearance = useCoucouWorkbenchAppearance();
    const [origin, setOrigin] = useAtom(model.origin);
    const [workflow, setWorkflow] = useAtom(model.workflow);
    const [selected, setSelected] = useAtom(model.selected);
    const jobs = useAtomValue(model.jobs);
    const busy = useAtomValue(model.busy);
    const error = useAtomValue(model.error);
    const health = useAtomValue(model.health);
    const preview = useAtomValue(model.preview);
    const previewFilename = useAtomValue(model.previewFilename);
    const importRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const timer = setInterval(() => {
            if (
                globalStore
                    .get(model.jobs)
                    .some((job) => ["queued", "running", "cancel-requested"].includes(job.status))
            ) {
                void model.run({ action: "refresh", origin: globalStore.get(model.origin) });
            }
        }, 5000);
        return () => clearInterval(timer);
    }, [model]);
    const job = jobs.find((item) => item.id === selected);
    const button = "cursor-pointer rounded border border-[var(--coucou-border)] px-3 py-1.5 disabled:opacity-40";
    return (
        <section
            style={appearance}
            className="h-full overflow-auto bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
        >
            <h2 className="text-lg font-semibold">Image Studio</h2>
            <p className="mt-1 text-sm text-[var(--coucou-secondary)]">
                Run API workflows on your local ComfyUI server. Generation uses its installed models and nodes.
            </p>
            <div className="my-3 flex flex-wrap gap-2">
                <input
                    aria-label="Local ComfyUI address"
                    className="min-w-48 grow rounded border border-[var(--coucou-border)] bg-transparent px-2"
                    value={origin}
                    onChange={(e) => {
                        setOrigin(e.target.value);
                        globalStore.set(model.health, "");
                        globalStore.set(model.jobs, []);
                        globalStore.set(model.preview, "");
                    }}
                    disabled={busy}
                />
                <button className={button} disabled={busy} onClick={() => void model.run({ action: "health", origin })}>
                    Connect
                </button>
                <button
                    className={button}
                    disabled={busy}
                    onClick={() => void model.run({ action: "refresh", origin })}
                >
                    Refresh jobs
                </button>
            </div>
            {health && (
                <p role="status" className="mb-3 text-sm">
                    {health}
                </p>
            )}
            {error && (
                <p role="alert" className="mb-3 whitespace-pre-wrap text-sm text-red-400">
                    {error}
                </p>
            )}
            <label className="block text-sm" htmlFor={`workflow-${model.blockId}`}>
                API workflow JSON
            </label>
            <textarea
                id={`workflow-${model.blockId}`}
                className="mt-2 h-44 w-full rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-3 font-mono text-xs"
                value={workflow}
                onChange={(e) => setWorkflow(e.target.value)}
                spellCheck={false}
                placeholder="Import or paste your workflow exported in API format"
            />
            <div className="my-3 flex gap-2">
                <input
                    ref={importRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2_000_000) {
                            globalStore.set(model.error, "Workflow exceeds the 2 MB limit.");
                            return;
                        }
                        try {
                            setWorkflow(await file.text());
                        } catch (error) {
                            globalStore.set(model.error, String(error));
                        }
                        e.target.value = "";
                    }}
                />
                <button className={button} onClick={() => importRef.current?.click()}>
                    Import JSON
                </button>
                <button className={button} disabled={busy || !workflow.trim()} onClick={() => model.submit()}>
                    {busy ? "Working…" : "Queue workflow"}
                </button>
            </div>
            <h3 className="mb-2 font-medium">Your render history</h3>
            {!jobs.length && (
                <p className="text-sm text-[var(--coucou-secondary)]">
                    Connect to load jobs previously submitted by KronTerm.
                </p>
            )}
            <div className="space-y-2">
                {jobs.map((item) => (
                    <button
                        key={item.id}
                        aria-pressed={selected === item.id}
                        className={`w-full text-left ${button}`}
                        onClick={() => {
                            setSelected(item.id);
                            globalStore.set(model.preview, "");
                        }}
                    >
                        <span className="font-mono text-xs">{item.id.slice(0, 12)}</span>
                        <span className="ml-3 text-sm">
                            {item.status} · {new Date(item.createdAt).toLocaleString()}
                        </span>
                    </button>
                ))}
            </div>
            {job && (
                <div className="mt-4 space-y-3">
                    {job.error && <p className="whitespace-pre-wrap text-sm text-red-400">{job.error}</p>}
                    <div className="flex flex-wrap gap-2">
                        <button className={button} onClick={() => setWorkflow(JSON.stringify(job.workflow, null, 2))}>
                            Reuse workflow
                        </button>
                        {["queued", "running"].includes(job.status) && (
                            <button
                                className={button}
                                disabled={busy}
                                onClick={() => void model.run({ action: "cancel", origin, id: job.id })}
                            >
                                Cancel this job
                            </button>
                        )}
                        {job.images.map((image, index) => (
                            <button
                                key={index}
                                className={button}
                                disabled={busy}
                                onClick={() => void model.run({ action: "image", origin, id: job.id, image })}
                            >
                                Preview {image.filename}
                            </button>
                        ))}
                    </div>
                    {preview && (
                        <>
                            <img
                                className="max-h-96 max-w-full rounded object-contain"
                                src={preview}
                                alt="Selected ComfyUI render"
                            />
                            <a className={button} href={preview} download={previewFilename}>
                                Save displayed image
                            </a>
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
