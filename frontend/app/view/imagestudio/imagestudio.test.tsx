// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { registerWorkspaceSurfaceModeProvider } from "@/app/tab/workspace-surface-runtime";
import type { ComfyRequest, ComfyResponse } from "@/types/comfyui";
import { describe, expect, test, vi } from "vitest";
import { ImageStudioModel } from "./imagestudio";

const comfyUiRequest = vi.hoisted(() => vi.fn<(request: ComfyRequest) => Promise<ComfyResponse>>());
vi.mock("@/store/global", () => ({ getApi: () => ({ comfyUiRequest }) }));
vi.mock("@/app/components/system-ui", () => ({}));

const render = {
    action: "image",
    origin: "http://127.0.0.1:8188",
    id: "render-job",
    image: { filename: "artwork.png", subfolder: "", type: "output" },
} as const;
const displayed = { imageData: "data:image/png;base64,AA==", previewDigest: "a".repeat(64) };

function studio() {
    comfyUiRequest.mockReset();
    const model = new ImageStudioModel({ blockId: "studio", tabModel: { tabId: "studio-tab" } } as ViewModelInitType);
    model.select(render.id);
    return model;
}

describe("Image Studio canvas handoff", () => {
    test("pins the displayed render to the owning tab and retains the downloadable preview", async () => {
        const model = studio();
        const control = vi.fn(() => ({ success: true, message: "Pinned" }));
        const dispose = registerWorkspaceSurfaceModeProvider("studio-tab", {
            control,
            snapshot: () => ({ presentation: "canvas" }),
        });
        comfyUiRequest.mockResolvedValueOnce(displayed).mockResolvedValueOnce({ filePath: "/artifacts/artwork.png" });
        try {
            await model.run(render);
            model.select(render.id);
            await model.pinImage();
            expect(comfyUiRequest).toHaveBeenLastCalledWith({
                ...render,
                action: "pin-image",
                previewDigest: displayed.previewDigest,
            });
            expect(control).toHaveBeenCalledWith({
                action: "add_file",
                file: "/artifacts/artwork.png",
                text: "artwork.png",
            });
            expect(globalStore.get(model.preview)?.data).toBe(displayed.imageData);
            expect(globalStore.get(model.pinStatus)).toBe("Pinned artwork.png to the canvas.");
        } finally {
            dispose();
        }
    });

    test("discards a pending preview after selecting another job and clears a failed preview", async () => {
        const model = studio();
        let finish: (result: ComfyResponse) => void;
        comfyUiRequest.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const pending = model.run(render);
        model.select("another-job");
        finish(displayed);
        await pending;
        expect(globalStore.get(model.preview)).toBeNull();
        await model.pinImage();
        expect(comfyUiRequest).toHaveBeenCalledTimes(1);

        model.select(render.id);
        comfyUiRequest.mockResolvedValueOnce(displayed).mockRejectedValueOnce(new Error("Preview failed"));
        await model.run(render);
        await model.run({ ...render, image: { ...render.image, filename: "missing.png" } });
        expect(globalStore.get(model.preview)).toBeNull();
        expect(globalStore.get(model.error)).toBe("Preview failed");
        await model.pinImage();
        expect(comfyUiRequest).toHaveBeenCalledTimes(3);
    });
});
