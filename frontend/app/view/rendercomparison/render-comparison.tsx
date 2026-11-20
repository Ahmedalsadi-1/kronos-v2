// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, SystemUIProvider } from "@/app/components/system-ui";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { readWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { controlWorkspaceSurface } from "@/app/tab/workspace-surface-runtime";
import { getApi } from "@/store/global";
import * as WOS from "@/store/wos";
import { comfyFixedSeeds, comfyPromptNodes, makeComfyVariants } from "@/types/comfy-variants";
import type { ComfyJob, ComfyRenderRef } from "@/types/comfyui";
import { getWebServerEndpoint } from "@/util/endpoints";
import { formatRemoteUri } from "@/util/waveutil";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import { useEffect, useState } from "react";

type Source = ComfyRenderRef & { file: string };
type Variant = { prompt: string; id?: string; error?: string };
type VariantImage = { data: string; digest?: string; render: ComfyRenderRef };
type Result = { job: ComfyJob; image?: VariantImage };

const SourceKey = "rendercomparison:source";
const VariantsKey = "rendercomparison:variants";
const FieldClass = "w-full rounded-md border border-[var(--kt-separator)] bg-[var(--kt-content)] px-3 py-2";
const PendingStates = ["queued", "running", "cancel-requested"];

export function openRenderComparison(tabId: string, file: string, render: ComfyRenderRef) {
    return RpcApi.CreateBlockCommand(TabRpcClient, {
        tabid: tabId,
        blockdef: { meta: { view: "rendercomparison", [SourceKey]: { file, ...render } } as MetaType },
    });
}

export async function pinComfyOutput(tabId: string, render: ComfyRenderRef, digest: string) {
    const { filePath } = await getApi().comfyUiRequest({ action: "pin-image", ...render, previewDigest: digest });
    if (!filePath) throw new Error("The render was not saved for the canvas.");
    await controlWorkspaceSurface(tabId, {
        action: "add_file",
        file: filePath,
        text: render.image.filename,
        render,
    });
    return filePath;
}

export class RenderComparisonModel implements ViewModel {
    viewType = "rendercomparison";
    viewIcon = atom("images");
    viewName = atom("KronRender Variants");
    noPadding = atom(true);
    viewComponent = RenderComparison;
    blockId: string;
    tabId: string;
    source: Source;
    recipe = atom(null) as PrimitiveAtom<ComfyJob>;
    variants = atom<Variant[]>([]);
    results = atom<Record<string, Result>>({});
    error = atom("");
    busy = atom(false);
    refreshing = false;

    constructor({ blockId, tabModel }: ViewModelInitType) {
        this.blockId = blockId;
        this.tabId = tabModel?.tabId;
        const meta = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)))?.meta;
        this.source = meta?.[SourceKey] as Source;
        const saved = meta?.[VariantsKey];
        if (Array.isArray(saved)) globalStore.set(this.variants, saved);
    }

    async load() {
        if (!this.source) return;
        globalStore.set(this.error, "");
        try {
            const { job } = await getApi().comfyUiRequest({
                action: "recipe",
                origin: this.source.origin,
                id: this.source.id,
            });
            if (!job) throw new Error("The source recipe is unavailable.");
            globalStore.set(this.recipe, job);
        } catch (error) {
            globalStore.set(this.error, error instanceof Error ? error.message : String(error));
        }
    }

    async submit(nodeId: string, prompts: string[]) {
        const recipe = globalStore.get(this.recipe);
        if (!recipe || globalStore.get(this.busy)) return;
        globalStore.set(this.busy, true);
        globalStore.set(this.error, "");
        try {
            const workflows = makeComfyVariants(recipe.workflow, nodeId, prompts);
            const variants: Variant[] = [];
            globalStore.set(this.variants, []);
            globalStore.set(this.results, {});
            for (let index = 0; index < workflows.length; index++) {
                try {
                    const { job } = await getApi().comfyUiRequest({
                        action: "submit",
                        origin: this.source.origin,
                        workflow: workflows[index],
                    });
                    if (!job) throw new Error("KronRender did not return a job ID.");
                    variants.push({ id: job.id, prompt: prompts[index] });
                    globalStore.set(this.results, (results) => ({ ...results, [job.id]: { job } }));
                } catch (error) {
                    variants.push({
                        prompt: prompts[index],
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                globalStore.set(this.variants, [...variants]);
                await RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("block", this.blockId),
                    meta: { [VariantsKey]: [...variants] } as MetaType,
                });
            }
        } catch (error) {
            globalStore.set(this.error, error instanceof Error ? error.message : String(error));
        } finally {
            globalStore.set(this.busy, false);
        }
    }

    async refresh(force = false) {
        if (this.refreshing || !this.source || globalStore.get(this.busy)) return;
        this.refreshing = true;
        const { origin } = this.source;
        try {
            for (const { id } of globalStore.get(this.variants)) {
                if (!id) continue;
                const previous = globalStore.get(this.results)[id];
                if (!force && previous && !PendingStates.includes(previous.job.status)) continue;
                const { jobs } = await getApi().comfyUiRequest({ action: "refresh", origin, id });
                const job = jobs?.[0];
                if (!job) continue;
                let image = previous?.image;
                if (!image && job.status === "completed" && job.images[0]) {
                    const render = { id, origin, image: job.images[0] };
                    const preview = await getApi().comfyUiRequest({ action: "image", ...render });
                    if (preview.imageData) image = { data: preview.imageData, digest: preview.previewDigest, render };
                }
                globalStore.set(this.results, (results) => ({ ...results, [id]: { job, image } }));
            }
        } catch (error) {
            globalStore.set(this.error, error instanceof Error ? error.message : String(error));
        } finally {
            this.refreshing = false;
        }
    }

    async pin(image: VariantImage) {
        if (!image.digest) throw new Error("Preview this image before pinning it.");
        return pinComfyOutput(this.tabId, image.render, image.digest);
    }

    async open(file: string) {
        if (readWorkspacePresentation() === "os") {
            await controlWorkspaceSurface(this.tabId, { action: "spatial.openFile", file, view: "preview" });
            return;
        }
        await RpcApi.CreateBlockCommand(TabRpcClient, {
            tabid: this.tabId,
            blockdef: { meta: { view: "preview", file } },
        });
    }
}

function RenderComparison({ model }: ViewComponentProps<RenderComparisonModel>) {
    const recipe = useAtomValue(model.recipe);
    const variants = useAtomValue(model.variants);
    const results = useAtomValue(model.results);
    const error = useAtomValue(model.error);
    const busy = useAtomValue(model.busy);
    const [nodeId, setNodeId] = useState("");
    const [prompts, setPrompts] = useState(["", ""]);
    const [zoom, setZoom] = useState(1);
    const [selected, setSelected] = useState("");
    const [pinned, setPinned] = useState<Record<string, string>>({});
    const [pinning, setPinning] = useState("");
    const [feedback, setFeedback] = useState("");
    useEffect(() => {
        void model.load();
        void model.refresh();
        const interval = setInterval(() => void model.refresh(), 4000);
        return () => clearInterval(interval);
    }, [model]);
    const nodes = recipe ? comfyPromptNodes(recipe.workflow) : [];
    const prompt = nodes.find((node) => node.id === nodeId) ?? nodes[0];
    const seeds = recipe ? comfyFixedSeeds(recipe.workflow) : [];
    const source =
        model.source?.file &&
        `${getWebServerEndpoint()}/wave/stream-file?${new URLSearchParams({
            path: formatRemoteUri(model.source.file, "local"),
        })}`;
    const pin = async (id: string, image: VariantImage) => {
        if (pinning) return;
        setPinning(id);
        setFeedback("");
        try {
            const file = await model.pin(image);
            setPinned((files) => ({ ...files, [id]: file }));
            setFeedback("Pinned to canvas.");
        } catch (reason) {
            setFeedback(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setPinning("");
        }
    };
    return (
        <SystemUIProvider>
            <div className="h-full overflow-auto bg-[var(--kt-content)] text-[var(--kt-label)]">
                <div className="mx-auto grid max-w-[1600px] gap-5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">KronRender Variants</h2>
                            {seeds.length > 0 && (
                                <p className="text-xs text-[var(--kt-label-secondary)]">
                                    Fixed {seeds.length > 1 ? "seeds" : "seed"} · {seeds.join(", ")}
                                </p>
                            )}
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                            Compare zoom
                            <input
                                type="range"
                                min={1}
                                max={2.5}
                                step={0.1}
                                value={zoom}
                                onChange={(event) => setZoom(event.currentTarget.valueAsNumber)}
                            />
                        </label>
                    </div>
                    {error && (
                        <p role="alert" className="text-sm">
                            {error}
                        </p>
                    )}
                    {!model.source && <p>Open a pinned KronRender image to create variants.</p>}
                    {model.source && !recipe && !error && <p role="status">Loading the source recipe…</p>}
                    {recipe && (!prompt || !seeds.length) && (
                        <p role="status">
                            This recipe needs a CLIP text node and a fixed numeric seed to create variants.
                        </p>
                    )}
                    {prompt && seeds.length > 0 && (
                        <form
                            className="grid gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setSelected("");
                                void model.submit(prompt.id, prompts);
                            }}
                        >
                            {nodes.length > 1 && (
                                <label className="grid max-w-80 gap-1 text-sm">
                                    Prompt node
                                    <select
                                        className={FieldClass}
                                        value={prompt.id}
                                        onChange={(event) => setNodeId(event.currentTarget.value)}
                                    >
                                        {nodes.map((node) => (
                                            <option key={node.id} value={node.id}>
                                                #{node.id}
                                                {node.positive ? " · Positive conditioning" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
                                {prompts.map((value, index) => (
                                    <label key={index} className="grid gap-1 text-sm">
                                        Variant {index + 1} prompt
                                        <textarea
                                            className={FieldClass}
                                            rows={2}
                                            required
                                            maxLength={8000}
                                            value={value}
                                            onChange={(event) =>
                                                setPrompts((current) =>
                                                    current.map((text, i) => (i === index ? event.target.value : text))
                                                )
                                            }
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <SystemButton type="submit" variant="filled" disabled={busy}>
                                    {busy ? "Queuing variants…" : "Render variants"}
                                </SystemButton>
                                <SystemButton
                                    type="button"
                                    disabled={busy || prompts.length === 4}
                                    onClick={() => setPrompts([...prompts, ""])}
                                >
                                    Add variant
                                </SystemButton>
                                {prompts.length > 2 && (
                                    <SystemButton
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setPrompts(prompts.slice(0, -1))}
                                    >
                                        Remove last
                                    </SystemButton>
                                )}
                                {prompt.text && prompts.some((text) => !text) && (
                                    <SystemButton
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setPrompts(prompts.map((text) => text || prompt.text))}
                                    >
                                        Fill empty prompts from source
                                    </SystemButton>
                                )}
                            </div>
                        </form>
                    )}
                    {feedback && (
                        <p role="status" className="text-sm">
                            {feedback}
                        </p>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-3">
                        {source && (
                            <ComparisonImage title="Source" text={prompt?.text} image={source} zoom={zoom}>
                                <SystemButton
                                    size="small"
                                    onClick={() =>
                                        void model
                                            .open(model.source.file)
                                            .catch((reason) => setFeedback(String(reason)))
                                    }
                                >
                                    Open image widget
                                </SystemButton>
                            </ComparisonImage>
                        )}
                        {variants.map((variant, index) => {
                            const result = results[variant.id];
                            const image = result?.image;
                            const file = pinned[variant.id];
                            return (
                                <ComparisonImage
                                    key={variant.id ?? index}
                                    title={`Variant ${index + 1}`}
                                    text={variant.prompt}
                                    image={image?.data}
                                    zoom={zoom}
                                    selected={!!variant.id && selected === variant.id}
                                    status={
                                        variant.error ||
                                        result?.job.error ||
                                        (result?.job.status === "completed" ? "No image output" : result?.job.status) ||
                                        "Loading job…"
                                    }
                                >
                                    {image && (
                                        <SystemButton
                                            size="small"
                                            aria-pressed={selected === variant.id}
                                            onClick={() => setSelected(selected === variant.id ? "" : variant.id)}
                                        >
                                            {selected === variant.id ? "Selected" : "Pick variant"}
                                        </SystemButton>
                                    )}
                                    {selected === variant.id && image && !file && (
                                        <SystemButton
                                            size="small"
                                            disabled={!!pinning}
                                            onClick={() => void pin(variant.id, image)}
                                        >
                                            Pin to canvas
                                        </SystemButton>
                                    )}
                                    {file && (
                                        <SystemButton
                                            size="small"
                                            onClick={() =>
                                                void model.open(file).catch((reason) => setFeedback(String(reason)))
                                            }
                                        >
                                            Open image widget
                                        </SystemButton>
                                    )}
                                </ComparisonImage>
                            );
                        })}
                    </div>
                    {variants.length > 0 && (
                        <SystemButton
                            className="justify-self-start"
                            size="small"
                            onClick={() => void model.refresh(true)}
                        >
                            Refresh renders
                        </SystemButton>
                    )}
                </div>
            </div>
        </SystemUIProvider>
    );
}

function ComparisonImage({
    title,
    text,
    image,
    zoom,
    selected,
    status,
    children,
}: {
    title: string;
    text?: string;
    image?: string;
    zoom: number;
    selected?: boolean;
    status?: string;
    children: React.ReactNode;
}) {
    return (
        <figure
            className={`m-0 min-w-0 overflow-hidden rounded-lg border bg-[var(--kt-window)] ${selected ? "border-[var(--kt-focus-ring)]" : "border-[var(--kt-separator)]"}`}
        >
            <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-black/20">
                {image ? (
                    <img
                        src={image}
                        alt={title}
                        draggable={false}
                        className="h-full w-full object-contain"
                        style={{ transform: `scale(${zoom})` }}
                    />
                ) : (
                    <p className="max-h-full overflow-auto px-3 text-sm">{status}</p>
                )}
            </div>
            <figcaption className="grid gap-2 p-3">
                <span className="text-sm font-semibold">{title}</span>
                {text && (
                    <p className="m-0 line-clamp-3 text-xs text-[var(--kt-label-secondary)]" title={text}>
                        {text}
                    </p>
                )}
                <div className="flex flex-wrap gap-1">{children}</div>
            </figcaption>
        </figure>
    );
}
