// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getModelPreviewFormat } from "@/util/model-preview";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPreviewModel } from "./preview-3d-loader";

function makeGlb(json: unknown, buffer: Uint8Array<ArrayBuffer> = new Uint8Array()) {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonSize = Math.ceil(jsonBytes.length / 4) * 4;
    const bytes = new Uint8Array(20 + jsonSize + (buffer.length ? 8 + buffer.length : 0));
    const header = new DataView(bytes.buffer);
    header.setUint32(0, 0x46546c67, true);
    header.setUint32(4, 2, true);
    header.setUint32(8, bytes.length, true);
    header.setUint32(12, jsonSize, true);
    header.setUint32(16, 0x4e4f534a, true);
    bytes.fill(0x20, 20, 20 + jsonSize);
    bytes.set(jsonBytes, 20);
    if (buffer.length) {
        header.setUint32(20 + jsonSize, buffer.length, true);
        header.setUint32(24 + jsonSize, 0x004e4942, true);
        bytes.set(buffer, 28 + jsonSize);
    }
    return bytes;
}

const FixtureUrl = "http://127.0.0.1/wave/stream-file?path=fixture";

describe("3D preview", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("recognizes supported model paths case-insensitively", () => {
        expect(getModelPreviewFormat("/assets/model.GLB")).toBe("glb");
        expect(getModelPreviewFormat("/assets/mesh.stl")).toBe("stl");
        expect(getModelPreviewFormat("/assets/model.gltf")).toBeUndefined();
        expect(getModelPreviewFormat("/assets/mesh.stl/readme")).toBeUndefined();
    });

    it("loads a GLB mesh from its embedded buffer", async () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const file = makeGlb(
            {
                asset: { version: "2.0" },
                scene: 0,
                scenes: [{ nodes: [0] }],
                nodes: [{ mesh: 0 }],
                meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
                accessors: [
                    {
                        bufferView: 0,
                        componentType: 5126,
                        count: 3,
                        type: "VEC3",
                        min: [0, 0, 0],
                        max: [1, 1, 0],
                    },
                ],
                bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
                buffers: [{ byteLength: positions.byteLength }],
            },
            new Uint8Array(positions.buffer)
        );
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(file)));
        const result = await loadPreviewModel(FixtureUrl, "glb", file.byteLength, new AbortController().signal);
        expect(result.model.children).toHaveLength(1);
        result.dispose();
    });

    it("rejects a GLB with an external image before a follow-up request can occur", async () => {
        const file = makeGlb({ asset: { version: "2.0" }, images: [{ uri: "https://example.test/texture.png" }] });
        const fetchMock = vi.fn().mockResolvedValue(new Response(file));
        vi.stubGlobal("fetch", fetchMock);
        await expect(
            loadPreviewModel(FixtureUrl, "glb", file.byteLength, new AbortController().signal)
        ).rejects.toThrow("self-contained GLB");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a small GLB that declares an oversized decoded accessor", async () => {
        const file = makeGlb({
            asset: { version: "2.0" },
            accessors: [{ type: "VEC3", componentType: 5126, count: 50_000_000 }],
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(file)));
        await expect(
            loadPreviewModel(FixtureUrl, "glb", file.byteLength, new AbortController().signal)
        ).rejects.toThrow("too much memory");
    });

    it("loads a binary STL mesh and rejects a truncated triangle table", async () => {
        const file = new ArrayBuffer(134);
        const data = new DataView(file);
        data.setUint32(80, 1, true);
        data.setFloat32(92, 1, true);
        data.setFloat32(108, 1, true);
        data.setFloat32(124, 1, true);
        const fetchMock = vi.fn().mockResolvedValue(new Response(file));
        vi.stubGlobal("fetch", fetchMock);
        const result = await loadPreviewModel(FixtureUrl, "stl", file.byteLength, new AbortController().signal);
        expect(result.model.type).toBe("Mesh");
        result.dispose();

        data.setUint32(80, 2, true);
        fetchMock.mockResolvedValue(new Response(file));
        await expect(
            loadPreviewModel(FixtureUrl, "stl", file.byteLength, new AbortController().signal)
        ).rejects.toThrow("invalid triangle count");
    });

    it("refuses oversized files before fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(
            loadPreviewModel(FixtureUrl, "glb", 64 * 1024 * 1024 + 1, new AbortController().signal)
        ).rejects.toThrow("64 MiB");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
