// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
    comfyOrigin,
    type ComfyImage,
    type ComfyJob,
    type ComfyRequest,
    type ComfyResponse,
    type ComfyWorkflow,
} from "../frontend/types/comfyui";

export { comfyOrigin };
export function validateComfyWorkflow(input: unknown): ComfyWorkflow {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Paste a KronRender workflow exported in API format");
    const nodes = Object.entries(input);
    if (!nodes.length || nodes.length > 2000 || JSON.stringify(input).length > 2_000_000)
        throw new Error("Workflow must contain between 1 and 2000 nodes and be under 2 MB");
    for (const [id, value] of nodes) {
        const node = value as ComfyWorkflow[string];
        if (
            !/^\d+$/.test(id) ||
            !node ||
            typeof node.class_type !== "string" ||
            !node.class_type ||
            typeof node.inputs !== "object" ||
            !node.inputs ||
            Array.isArray(node.inputs)
        )
            throw new Error("Paste an API workflow with numeric node IDs, class_type and inputs");
    }
    return structuredClone(input) as ComfyWorkflow;
}

export class ComfyUiClient {
    private jobs: ComfyJob[];
    private pending: Promise<unknown> = Promise.resolve();
    constructor(
        private file: string,
        private fetcher: typeof fetch = fetch
    ) {
        this.jobs = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
        if (!Array.isArray(this.jobs) || this.jobs.length > 5000) throw new Error("Invalid image job journal");
        for (const job of this.jobs) {
            if (
                !job ||
                typeof job.id !== "string" ||
                !job.id ||
                typeof job.origin !== "string" ||
                !Number.isFinite(job.createdAt) ||
                !Array.isArray(job.images) ||
                !["queued", "running", "completed", "failed", "cancel-requested", "unknown"].includes(job.status)
            ) {
                throw new Error("Invalid image job journal");
            }
            comfyOrigin(job.origin);
            validateComfyWorkflow(job.workflow);
            if (
                job.images.some(
                    (image) =>
                        !image ||
                        typeof image.filename !== "string" ||
                        typeof image.subfolder !== "string" ||
                        !["output", "temp", "input"].includes(image.type)
                )
            ) {
                throw new Error("Invalid image job outputs");
            }
        }
    }
    private save() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(this.jobs), { mode: 0o600 });
            fs.renameSync(temporary, this.file);
        } finally {
            fs.rmSync(temporary, { force: true });
        }
    }
    private async request(origin: string, route: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
        let response: Response;
        try {
            response = await this.fetcher(`${origin}${route}`, {
                method: body == null ? "GET" : "POST",
                redirect: "error",
                signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
                ...(body == null
                    ? {}
                    : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
            });
        } catch (error) {
            throw new Error(
                `KronRender could not be reached at ${origin}. Check the engine address or retry once it is ready. ${String(error)}`
            );
        }
        if (!response.ok)
            throw new Error(`KronRender ${route} returned ${response.status}: ${(await response.text()).slice(0, 1500)}`);
        return response;
    }
    private owned(origin: string, id: string, workspaceId?: string): ComfyJob {
        const job = this.jobs.find(
            (row) => row.id === id && row.origin === origin && (workspaceId == null || row.workspaceId === workspaceId)
        );
        if (!job) throw new Error("This image job was not submitted by KronOS");
        return job;
    }
    execute(input: ComfyRequest, workspaceId?: string, signal?: AbortSignal): Promise<ComfyResponse> {
        const result = this.pending.then(() => {
            signal?.throwIfAborted();
            return this.executeRequest(input, workspaceId, signal);
        });
        this.pending = result.catch(() => undefined);
        return result;
    }
    private async executeRequest(input: ComfyRequest, workspaceId?: string, signal?: AbortSignal): Promise<ComfyResponse> {
        if (
            !input ||
            typeof input !== "object" ||
            !["health", "submit", "refresh", "cancel", "image"].includes(input.action)
        ) {
            throw new Error("Unknown KronRender request");
        }
        if (typeof input.origin !== "string") throw new Error("KronRender address is required");
        if ((input.action === "cancel" || input.action === "image") && (typeof input.id !== "string" || !input.id)) {
            throw new Error("Image job identity is required");
        }
        if (input.action === "image" && (!input.image || typeof input.image !== "object"))
            throw new Error("Image identity is required");
        const origin = comfyOrigin(input.origin);
        const jobs = () =>
            this.jobs.filter((job) => job.origin === origin && (workspaceId == null || job.workspaceId === workspaceId));
        if (input.action === "health") {
            const [stats, objects] = await Promise.all([
                this.request(origin, "/system_stats", undefined, signal).then((response) => response.json()),
                this.request(origin, "/object_info", undefined, signal).then((response) => response.json()),
            ]);
            return {
                version: stats.system?.comfyui_version ?? "Version not reported",
                nodeTypes: Object.keys(objects).sort(),
                jobs: structuredClone(jobs()),
            };
        }
        if (input.action === "submit") {
            const workflow = validateComfyWorkflow(input.workflow);
            const result = await (
                await this.request(origin, "/prompt", { prompt: workflow, client_id: randomUUID() }, signal)
            ).json();
            if (typeof result.prompt_id !== "string" || !result.prompt_id)
                throw new Error(`Workflow rejected: ${JSON.stringify(result).slice(0, 1500)}`);
            this.jobs.unshift({
                id: result.prompt_id,
                origin,
                workflow,
                createdAt: Date.now(),
                status: "queued",
                images: [],
                ...(workspaceId ? { workspaceId } : {}),
            });
            this.save();
            if (workspaceId != null) return { jobs: [structuredClone(this.jobs[0])] };
        }
        if (input.action === "cancel") {
            const job = this.owned(origin, input.id, workspaceId);
            // New servers cancel by ID atomically. A global interrupt could stop someone else's render.
            const result = await (
                await this.request(origin, `/api/jobs/${encodeURIComponent(job.id)}/cancel`, {}, signal)
            ).json();
            if (result.cancelled !== true)
                throw new Error("KronRender did not cancel this job. It may already be finished; refresh its status.");
            job.status = "cancel-requested";
            this.save();
            if (workspaceId != null) return { jobs: [structuredClone(job)] };
        }
        if (input.action === "image") {
            const job = this.owned(origin, input.id, workspaceId);
            const image = job.images.find(
                (row) =>
                    row.filename === input.image.filename &&
                    row.subfolder === input.image.subfolder &&
                    row.type === input.image.type
            );
            if (!image) throw new Error("Image does not belong to this job");
            const params = new URLSearchParams(image);
            const response = await this.request(origin, `/view?${params}`, undefined, signal);
            const mime = response.headers.get("content-type")?.split(";")[0];
            if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime))
                throw new Error("KronRender output is not a supported image");
            if (Number(response.headers.get("content-length")) > 20_000_000)
                throw new Error("Image is too large to preview (20 MB limit)");
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 20_000_000) {
                    await reader.cancel();
                    throw new Error("Image is too large to preview (20 MB limit)");
                }
                chunks.push(value);
            }
            return { imageData: `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}` };
        }
        if (input.action === "refresh") {
            const selected = input.id ? [this.owned(origin, input.id, workspaceId)] : jobs().slice(0, 100);
            const queue = await (await this.request(origin, "/queue", undefined, signal)).json();
            for (const job of selected) {
                if (queue.queue_running?.some((entry: unknown[]) => entry[1] === job.id)) {
                    job.status = "running";
                    continue;
                }
                if (queue.queue_pending?.some((entry: unknown[]) => entry[1] === job.id)) {
                    job.status = "queued";
                    continue;
                }
                const history = await (
                    await this.request(origin, `/history/${encodeURIComponent(job.id)}`, undefined, signal)
                ).json();
                const entry = history[job.id];
                if (!entry) {
                    job.status = "unknown";
                    continue;
                }
                job.status =
                    entry.status?.status_str === "error"
                        ? "failed"
                        : entry.status?.completed === true
                          ? "completed"
                          : "unknown";
                job.images = Object.values(entry.outputs ?? {})
                    .flatMap((output: { images?: ComfyImage[] }) => output.images ?? [])
                    .filter(
                        (image) =>
                            typeof image.filename === "string" &&
                            typeof image.subfolder === "string" &&
                            ["output", "input", "temp"].includes(image.type)
                    );
                if (job.status === "failed") job.error = JSON.stringify(entry.status?.messages ?? []).slice(0, 1500);
            }
            this.save();
            if (input.id) return { jobs: structuredClone(selected) };
        }
        return { jobs: structuredClone(jobs()) };
    }
}
