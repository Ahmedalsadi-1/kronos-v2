// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComfyUiClient, comfyOrigin, validateComfyWorkflow } from "./comfyui-client";

const Origin = "http://127.0.0.1:8188";
const Workflow = { "1": { class_type: "SaveImage", inputs: {} } };
const Directories: string[] = [];
function journal() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kron-comfy-test-"));
    Directories.push(directory);
    return path.join(directory, "jobs.json");
}
function json(value: unknown) {
    return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}
afterEach(() => {
    for (const directory of Directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("ComfyUI local bridge", () => {
    it("rejects remote destinations, URL credentials and UI-format workflows", () => {
        for (const url of [
            "https://127.0.0.1:8188",
            "http://example.com",
            "http://user@localhost",
            "http://localhost/private",
            "http://localhost?secret=x",
        ])
            expect(() => comfyOrigin(url)).toThrow();
        expect(comfyOrigin(Origin)).toBe(Origin);
        expect(() => validateComfyWorkflow({ nodes: [] })).toThrow();
        expect(validateComfyWorkflow(Workflow)).toEqual(Workflow);
    });
    it("persists submitted workflows and reloads their history", async () => {
        const file = journal();
        const fetcher = vi.fn(async () => json({ prompt_id: "owned" }));
        const client = new ComfyUiClient(file, fetcher as typeof fetch);
        const result = await client.execute({ action: "submit", origin: Origin, workflow: Workflow });
        expect(result.jobs[0]).toMatchObject({ id: "owned", status: "queued", workflow: Workflow });
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        const restored = new ComfyUiClient(
            file,
            vi.fn(async (url) =>
                String(url).endsWith("/system_stats")
                    ? json({ system: { comfyui_version: "test" } })
                    : json({ SaveImage: {} })
            ) as typeof fetch
        );
        expect((await restored.execute({ action: "health", origin: Origin })).jobs[0].id).toBe("owned");
    });
    it("maps running queues and completed image output without inventing progress", async () => {
        const fetcher = vi.fn(async (url) => {
            if (String(url).endsWith("/prompt")) return json({ prompt_id: "owned" });
            if (String(url).endsWith("/queue")) return json({ queue_running: [], queue_pending: [] });
            return json({
                owned: {
                    status: { completed: true, status_str: "success" },
                    outputs: { "1": { images: [{ filename: "render.png", subfolder: "", type: "output" }] } },
                },
            });
        });
        const client = new ComfyUiClient(journal(), fetcher as typeof fetch);
        await client.execute({ action: "submit", origin: Origin, workflow: Workflow });
        expect((await client.execute({ action: "refresh", origin: Origin })).jobs[0]).toMatchObject({
            status: "completed",
            images: [{ filename: "render.png" }],
        });
    });
    it("rejects other users' job cancellation and image access", async () => {
        const fetcher = vi.fn();
        const client = new ComfyUiClient(journal(), fetcher);
        await expect(client.execute({ action: "cancel", origin: Origin, id: "someone-else" })).rejects.toThrow(
            "not submitted"
        );
        await expect(
            client.execute({
                action: "image",
                origin: Origin,
                id: "someone-else",
                image: { filename: "secret.png", type: "output", subfolder: "" },
            })
        ).rejects.toThrow("not submitted");
        expect(fetcher).not.toHaveBeenCalled();
    });
    it("cancels only the owned ID through the atomic endpoint", async () => {
        const fetcher = vi.fn(async (url) =>
            String(url).endsWith("/prompt") ? json({ prompt_id: "owned" }) : json({ cancelled: true })
        );
        const client = new ComfyUiClient(journal(), fetcher as typeof fetch);
        await client.execute({ action: "submit", origin: Origin, workflow: Workflow });
        expect((await client.execute({ action: "cancel", origin: Origin, id: "owned" })).jobs[0].status).toBe(
            "cancel-requested"
        );
        expect(fetcher.mock.calls[1][0]).toBe(`${Origin}/api/jobs/owned/cancel`);
        expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/interrupt"))).toBe(false);
    });
    it("surfaces rejected prompts and service failures", async () => {
        const client = new ComfyUiClient(
            journal(),
            vi.fn(async () => new Response("missing model", { status: 400 })) as typeof fetch
        );
        await expect(client.execute({ action: "submit", origin: Origin, workflow: Workflow })).rejects.toThrow(
            "missing model"
        );
    });
});

it("rejects malformed requests before touching the local service", async () => {
    const fetcher = vi.fn();
    const client = new ComfyUiClient(journal(), fetcher);
    await expect(client.execute({ action: "arbitrary", origin: Origin } as never)).rejects.toThrow("Unknown");
    await expect(client.execute({ action: "image", origin: Origin } as never)).rejects.toThrow("identity");
    expect(fetcher).not.toHaveBeenCalled();
});

it("rejects malformed stored jobs without overwriting the journal", () => {
    const file = journal();
    fs.writeFileSync(file, JSON.stringify([{ id: "broken" }]));
    expect(() => new ComfyUiClient(file)).toThrow("journal");
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual([{ id: "broken" }]);
});
