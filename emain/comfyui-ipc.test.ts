// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { registerComfyUiIpc } from "./comfyui-ipc";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), execute: vi.fn(), construct: vi.fn(), dataDir: "/local-data" }));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("./emain-platform", () => ({ getWaveDataDir: () => mocks.dataDir }));
vi.mock("./emain-tabview", () => ({ getWaveTabViewByWebContentsId: (id: number) => (id === 1 ? {} : null) }));
vi.mock("./emain-hud", () => ({ listNativeHudWebContents: () => [{ id: 2 }] }));
vi.mock("./comfyui-client", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./comfyui-client")>()),
    ComfyUiClient: class {
        constructor(file: string) {
            mocks.construct(file);
        }
        execute = mocks.execute;
    },
}));

test("opens the ComfyUI editor without reading the catalog or joining the image job queue", async () => {
    const frame = { url: "http://localhost:3000/index.html" };
    const sender = Object.assign(new EventEmitter(), { id: 1, mainFrame: frame, isDestroyed: () => false });
    const probe = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", probe);
    const before = mocks.execute.mock.calls.length;
    try {
        registerComfyUiIpc();
        const handler = mocks.handle.mock.calls.at(-1)[1];
        const event = { sender, senderFrame: frame };
        const request = { action: "editor", origin: "http://127.0.0.1:8188" };
        const [first, second] = await Promise.all([handler(event, request), handler(event, request)]);
        expect(first.editorUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+$/);
        expect(second).toEqual(first);
        expect(probe).toHaveBeenCalledExactlyOnceWith(`${request.origin}/system_stats`, expect.anything());
        expect(mocks.execute).toHaveBeenCalledTimes(before);
    } finally {
        sender.emit("destroyed");
        vi.unstubAllGlobals();
    }
});

test("workspace and notch share one image journal; browser guests cannot submit renders", async () => {
    registerComfyUiIpc();
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === "comfyui-command")[1];
    const request = { action: "health", origin: "http://127.0.0.1:8188" };
    await expect(handler({ sender: { id: 99 } }, request)).rejects.toThrow("Untrusted");
    expect(mocks.construct).not.toHaveBeenCalled();
    await handler({ sender: { id: 1 } }, request);
    await handler({ sender: { id: 2 } }, request);
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.construct).toHaveBeenCalledWith("/local-data/images/journal.json");
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.execute).toHaveBeenCalledWith(request);
});

test("materializes only the displayed image in the app data directory", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "comfy-canvas-test-"));
    mocks.dataDir = dataDir;
    try {
        registerComfyUiIpc();
        const handler = mocks.handle.mock.calls.at(-1)[1];
        const frame = {};
        const event = { senderFrame: frame, sender: { id: 1, mainFrame: frame, isDestroyed: () => false } };
        const request = {
            action: "image",
            origin: "http://127.0.0.1:8188",
            id: "owned-job",
            image: { filename: "../../render.png", subfolder: "", type: "output" },
        };
        const bytes = Buffer.from("test-render");
        mocks.execute.mockResolvedValue({ imageData: `data:image/png;base64,${bytes.toString("base64")}` });
        const { previewDigest } = await handler(event, request);
        const pin = { ...request, action: "pin-image", previewDigest };
        await expect(handler({ ...event, senderFrame: {} }, pin)).rejects.toThrow("Untrusted KronRender canvas caller");
        await expect(handler({ ...event, sender: { ...event.sender, id: 2 } }, pin)).rejects.toThrow("Untrusted");
        await expect(handler(event, { ...pin, previewDigest: "f".repeat(64) })).rejects.toThrow("output changed");
        const { filePath } = await handler(event, pin);
        expect(mocks.execute).toHaveBeenLastCalledWith(request);
        expect(path.dirname(filePath)).toBe(path.join(dataDir, "images", "canvas"));
        expect(path.basename(filePath)).toMatch(/^[0-9a-f]{64}\.png$/);
        expect(await readFile(filePath)).toEqual(bytes);
        expect(await handler(event, pin)).toEqual({ filePath });
        expect(await readdir(path.dirname(filePath))).toEqual([path.basename(filePath)]);
    } finally {
        mocks.execute.mockReset();
        mocks.dataDir = "/local-data";
        await rm(dataDir, { recursive: true, force: true });
    }
});
