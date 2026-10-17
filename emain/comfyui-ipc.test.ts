// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test, vi } from "vitest";
import { registerComfyUiIpc } from "./comfyui-ipc";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), execute: vi.fn(), construct: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("./emain-platform", () => ({ getWaveDataDir: () => "/local-data" }));
vi.mock("./emain-tabview", () => ({ getWaveTabViewByWebContentsId: (id: number) => (id === 1 ? {} : null) }));
vi.mock("./emain-hud", () => ({ listNativeHudWebContents: () => [{ id: 2 }] }));
vi.mock("./comfyui-client", () => ({
    ComfyUiClient: class {
        constructor(file: string) {
            mocks.construct(file);
        }
        execute = mocks.execute;
    },
}));

test("workspace and notch share one image journal; browser guests cannot submit renders", async () => {
    registerComfyUiIpc();
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === "comfyui-command")[1];
    const request = { action: "health", origin: "http://127.0.0.1:8188" };
    expect(() => handler({ sender: { id: 99 } }, request)).toThrow("Untrusted");
    expect(mocks.construct).not.toHaveBeenCalled();
    await handler({ sender: { id: 1 } }, request);
    await handler({ sender: { id: 2 } }, request);
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.construct).toHaveBeenCalledWith("/local-data/images/journal.json");
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.execute).toHaveBeenCalledWith(request);
});
