// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import {
    SystemButton,
    SystemListRow,
    SystemMaterial,
    SystemStatusBadge,
    SystemUIProvider,
} from "@/app/components/system-ui";
import { globalStore } from "@/app/store/jotaiStore";
import { readWorkspacePresentation, subscribeWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { controlWorkspaceSurface } from "@/app/tab/workspace-surface-runtime";
import { getApi } from "@/store/global";
import type { ComfyJob, ComfyRequest, ComfyResponse, ComfyWorkflow } from "@/types/comfyui";
import { atom, useAtom, useAtomValue } from "jotai";
import { Image } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

const FieldClass =
    "min-w-0 rounded-[var(--kt-radius-control)] border border-[var(--kt-separator)] bg-[var(--kt-content)] px-3 text-[var(--kt-label)] placeholder:text-[var(--kt-label-tertiary)]";

type DisplayedRender = Extract<ComfyRequest, { action: "image" }> & { data: string; digest?: string };

export class ImageStudioModel implements ViewModel {
    viewType = "imagestudio";
    viewIcon = atom("image");
    viewName = atom("Image Studio");
    noPadding = atom(true);
    viewComponent = ImageStudio;
    blockId: string;
    tabId: string;
    origin = atom("http://127.0.0.1:8188");
    workflow = atom("");
    jobs = atom<ComfyJob[]>([]);
    busy = atom(false);
    error = atom("");
    health = atom("");
    pinStatus = atom("");
    selected = atom("");
    preview = atom(null as DisplayedRender);
    private disposed = false;
    constructor({ blockId, tabModel }: ViewModelInitType) {
        this.blockId = blockId;
        this.tabId = tabModel?.tabId;
    }
    select(id: string) {
        if (globalStore.get(this.selected) === id) return;
        globalStore.set(this.selected, id);
        globalStore.set(this.preview, null);
    }
    async run(request: ComfyRequest) {
        if (globalStore.get(this.busy)) return;
        globalStore.set(this.busy, true);
        globalStore.set(this.error, "");
        if (request.action === "image") globalStore.set(this.preview, null);
        try {
            const api = getApi() as ReturnType<typeof getApi> & {
                comfyUiRequest?: (request: ComfyRequest) => Promise<ComfyResponse>;
            };
            if (!api.comfyUiRequest) throw new Error("Image Studio requires the KronOS desktop KronRender bridge.");
            const result = await api.comfyUiRequest(request);
            if (this.disposed) return;
            if (result.jobs) globalStore.set(this.jobs, result.jobs);
            if (result.version)
                globalStore.set(
                    this.health,
                    `Connected: ${result.version} · ${result.nodeTypes?.length ?? 0} node types`
                );
            if (
                request.action === "image" &&
                result.imageData &&
                globalStore.get(this.selected) === request.id &&
                globalStore.get(this.origin) === request.origin
            )
                globalStore.set(this.preview, { ...request, data: result.imageData, digest: result.previewDigest });
        } catch (error) {
            if (!this.disposed) globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        } finally {
            globalStore.set(this.busy, false);
        }
    }
    async pinImage() {
        const preview = globalStore.get(this.preview);
        if (globalStore.get(this.busy) || !this.tabId || !preview?.digest) return;
        if (globalStore.get(this.selected) !== preview.id || globalStore.get(this.origin) !== preview.origin) return;
        globalStore.set(this.busy, true);
        globalStore.set(this.error, "");
        globalStore.set(this.pinStatus, "");
        try {
            const { filePath } = await getApi().comfyUiRequest({
                action: "pin-image",
                origin: preview.origin,
                id: preview.id,
                image: preview.image,
                previewDigest: preview.digest,
            });
            if (this.disposed) return;
            if (!filePath) throw new Error("The render was not saved for the canvas.");
            await controlWorkspaceSurface(this.tabId, {
                action: "add_file",
                file: filePath,
                text: preview.image.filename,
                render: { id: preview.id, origin: preview.origin, image: preview.image },
            });
            if (!this.disposed) globalStore.set(this.pinStatus, `Pinned ${preview.image.filename} to the canvas.`);
        } catch (error) {
            if (!this.disposed) globalStore.set(this.error, error instanceof Error ? error.message : String(error));
        } finally {
            globalStore.set(this.busy, false);
        }
    }
    submit() {
        try {
            const workflow = JSON.parse(globalStore.get(this.workflow)) as ComfyWorkflow;
            void this.run({ action: "submit", origin: globalStore.get(this.origin), workflow });
        } catch {
            globalStore.set(this.error, "Paste valid JSON exported from KronRender in API format.");
        }
    }
    dispose() {
        this.disposed = true;
    }
}

export function ImageStudio({ model, contentRef }: ViewComponentProps<ImageStudioModel>) {
    const [origin, setOrigin] = useAtom(model.origin);
    const [workflow, setWorkflow] = useAtom(model.workflow);
    const selected = useAtomValue(model.selected);
    const jobs = useAtomValue(model.jobs);
    const busy = useAtomValue(model.busy);
    const error = useAtomValue(model.error);
    const health = useAtomValue(model.health);
    const preview = useAtomValue(model.preview);
    const pinStatus = useAtomValue(model.pinStatus);
    const presentation = useSyncExternalStore(subscribeWorkspacePresentation, readWorkspacePresentation);
    const canPin = model.tabId != null && presentation === "os";
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
    const addressId = `comfy-address-${model.blockId}`;
    const workflowId = `workflow-${model.blockId}`;
    const historyId = `comfy-history-${model.blockId}`;
    return (
        <div ref={contentRef} className="relative h-full w-full">
            <SystemUIProvider>
                <SystemMaterial role="region" aria-label="Image Studio" className="h-full overflow-auto p-3 sm:p-4">
                    <div className="mx-auto grid max-w-6xl gap-4">
                        <div className="grid gap-2">
                            <label className="font-medium" htmlFor={addressId}>
                                Local KronRender address
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    id={addressId}
                                    className={`${FieldClass} h-9 flex-[1_1_14rem]`}
                                    value={origin}
                                    onChange={(e) => {
                                        setOrigin(e.target.value);
                                        globalStore.set(model.health, "");
                                        globalStore.set(model.jobs, []);
                                        globalStore.set(model.pinStatus, "");
                                        model.select("");
                                    }}
                                    disabled={busy}
                                />
                                <SystemButton
                                    type="button"
                                    variant="tinted"
                                    disabled={busy}
                                    onClick={() => void model.run({ action: "health", origin })}
                                >
                                    Connect
                                </SystemButton>
                                <SystemButton
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void model.run({ action: "refresh", origin })}
                                >
                                    Refresh jobs
                                </SystemButton>
                            </div>
                            {health && (
                                <p role="status" className="text-[var(--kt-label-secondary)]">
                                    {health}
                                </p>
                            )}
                            {pinStatus && (
                                <p role="status" className="text-[var(--kt-label-secondary)]">
                                    {pinStatus}
                                </p>
                            )}
                            {error && (
                                <p
                                    role="alert"
                                    className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--kt-danger)]"
                                >
                                    {error}
                                </p>
                            )}
                        </div>
                        <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
                            <div className="grid min-w-0 gap-3 rounded-[var(--kt-radius-row)] border border-[var(--kt-separator)] bg-[var(--kt-window)] p-3">
                                <label className="font-semibold" htmlFor={workflowId}>
                                    API workflow JSON
                                </label>
                                <textarea
                                    id={workflowId}
                                    className={`${FieldClass} h-44 w-full resize-y py-2 font-mono text-xs`}
                                    value={workflow}
                                    onChange={(e) => setWorkflow(e.target.value)}
                                    spellCheck={false}
                                    placeholder="Import or paste a KronRender workflow exported in API format"
                                />
                                <div className="flex flex-wrap justify-between gap-2">
                                    <input
                                        ref={importRef}
                                        type="file"
                                        accept=".json,application/json"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            e.target.value = "";
                                            if (file.size > 2_000_000) {
                                                globalStore.set(model.error, "Workflow exceeds the 2 MB limit.");
                                                return;
                                            }
                                            try {
                                                setWorkflow(await file.text());
                                            } catch (error) {
                                                globalStore.set(model.error, String(error));
                                            }
                                        }}
                                    />
                                    <SystemButton
                                        type="button"
                                        variant="tinted"
                                        onClick={() => importRef.current?.click()}
                                    >
                                        Import JSON
                                    </SystemButton>
                                    <SystemButton
                                        type="button"
                                        variant="filled"
                                        disabled={busy || !workflow.trim()}
                                        onClick={() => model.submit()}
                                    >
                                        {busy ? "Working…" : "Queue workflow"}
                                    </SystemButton>
                                </div>
                            </div>
                            <section
                                aria-labelledby={historyId}
                                className="grid min-w-0 gap-3 rounded-[var(--kt-radius-row)] border border-[var(--kt-separator)] bg-[var(--kt-window)] p-3"
                            >
                                <h2 id={historyId} className="font-semibold">
                                    Render history
                                </h2>
                                {!jobs.length ? (
                                    <p className="text-[var(--kt-label-secondary)]">
                                        {health
                                            ? "No renders submitted in this workspace yet."
                                            : "Connect to load renders from this workspace."}
                                    </p>
                                ) : (
                                    <div className="grid max-h-56 gap-1 overflow-auto p-1">
                                        {jobs.map((item) => (
                                            <SystemListRow
                                                key={item.id}
                                                title={item.id.slice(0, 12)}
                                                detail={new Date(item.createdAt).toLocaleString()}
                                                trailing={
                                                    <SystemStatusBadge className="capitalize">
                                                        {item.status.replace("-", " ")}
                                                    </SystemStatusBadge>
                                                }
                                                icon={<Image aria-hidden="true" />}
                                                aria-pressed={selected === item.id}
                                                style={
                                                    selected === item.id
                                                        ? { backgroundColor: "var(--kt-fill-hover)" }
                                                        : undefined
                                                }
                                                onClick={() => model.select(item.id)}
                                            />
                                        ))}
                                    </div>
                                )}
                                {job && (
                                    <div className="grid min-w-0 justify-items-start gap-2 border-t border-[var(--kt-separator)] pt-3">
                                        {job.error && (
                                            <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--kt-danger)]">
                                                {job.error}
                                            </p>
                                        )}
                                        <div className="flex min-w-0 flex-wrap gap-2">
                                            <SystemButton
                                                type="button"
                                                variant="tinted"
                                                onClick={() => setWorkflow(JSON.stringify(job.workflow, null, 2))}
                                            >
                                                Reuse workflow
                                            </SystemButton>
                                            {["queued", "running"].includes(job.status) && (
                                                <SystemButton
                                                    type="button"
                                                    variant="destructive"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void model.run({ action: "cancel", origin, id: job.id })
                                                    }
                                                >
                                                    Cancel this job
                                                </SystemButton>
                                            )}
                                            {job.images.map((image, index) => (
                                                <SystemButton
                                                    key={index}
                                                    type="button"
                                                    variant="tinted"
                                                    title={`Preview ${image.filename}`}
                                                    className="max-w-full"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void model.run({ action: "image", origin, id: job.id, image })
                                                    }
                                                >
                                                    <span className="truncate">Preview {image.filename}</span>
                                                </SystemButton>
                                            ))}
                                        </div>
                                        {preview && (
                                            <>
                                                <img
                                                    className="max-h-96 max-w-full rounded-[var(--kt-radius-control)] object-contain"
                                                    src={preview.data}
                                                    alt="Selected KronRender render"
                                                />
                                                <div className="flex flex-wrap gap-2">
                                                    <SystemButton asChild variant="tinted">
                                                        <a href={preview.data} download={preview.image.filename}>
                                                            Save displayed image
                                                        </a>
                                                    </SystemButton>
                                                    {canPin && preview.digest && (
                                                        <SystemButton
                                                            type="button"
                                                            variant="tinted"
                                                            disabled={busy}
                                                            onClick={() => void model.pinImage()}
                                                        >
                                                            Pin to canvas
                                                        </SystemButton>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </SystemMaterial>
            </SystemUIProvider>
        </div>
    );
}
