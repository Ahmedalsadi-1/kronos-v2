// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ModelPreviewFormat } from "@/util/model-preview";
import { LoadingManager, Material, Mesh, MeshStandardMaterial, Object3D, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const MaxModelBytes = 64 * 1024 * 1024;
const MaxDecodedAccessorBytes = 256 * 1024 * 1024;
const AccessorComponents = new Map([
    ["SCALAR", 1],
    ["VEC2", 2],
    ["VEC3", 3],
    ["VEC4", 4],
    ["MAT2", 4],
    ["MAT3", 9],
    ["MAT4", 16],
]);
const SizeError = "3D preview supports files up to 64 MiB.";

async function readModel(url: string, size: number, signal: AbortSignal): Promise<ArrayBuffer> {
    if (size > MaxModelBytes) throw new Error(SizeError);
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal });
    if (!response.ok || response.body == null) {
        throw new Error("KronOS could not read this model.");
    }
    if (Number(response.headers.get("content-length")) > MaxModelBytes) {
        await response.body.cancel();
        throw new Error(SizeError);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MaxModelBytes) {
                await reader.cancel();
                throw new Error(SizeError);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes.buffer;
}

function validateGlb(data: ArrayBuffer) {
    const view = new DataView(data);
    if (
        view.byteLength < 20 ||
        view.getUint32(0, true) !== 0x46546c67 ||
        view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== view.byteLength ||
        view.getUint32(16, true) !== 0x4e4f534a
    ) {
        throw new Error("This file is not a valid glTF 2.0 binary model.");
    }
    const jsonLength = view.getUint32(12, true);
    if (jsonLength === 0 || jsonLength > view.byteLength - 20) {
        throw new Error("This GLB file has an invalid JSON chunk.");
    }
    const model = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)));
    for (const resources of [model.images ?? [], model.buffers ?? []]) {
        if (resources.some((resource: { uri?: string }) => resource.uri != null)) {
            throw new Error("Export a self-contained GLB with embedded buffers and textures to preview it here.");
        }
    }
    // Sparse and zero-filled accessors can allocate much more than the embedded buffer contains.
    let decodedBytes = 0;
    for (const accessor of model.accessors ?? []) {
        const components = AccessorComponents.get(accessor.type);
        if (!components || !Number.isSafeInteger(accessor.count) || accessor.count < 1) {
            throw new Error("This GLB file has an invalid accessor.");
        }
        decodedBytes += accessor.count * components * Float32Array.BYTES_PER_ELEMENT;
        if (decodedBytes > MaxDecodedAccessorBytes) {
            throw new Error("This GLB file requires too much memory to preview.");
        }
    }
}

function validateStl(data: ArrayBuffer) {
    if (data.byteLength < 84) throw new Error("This STL file has no complete mesh.");
    const view = new DataView(data);
    const triangleCount = view.getUint32(80, true);
    const binaryLength = 84 + triangleCount * 50;
    const prefix = String.fromCharCode(...new Uint8Array(data, 0, 9));
    if (data.byteLength !== binaryLength && !/^.{0,4}solid/s.test(prefix)) {
        throw new Error("This STL file has an invalid triangle count.");
    }
}

function disposeModels(models: Object3D[]) {
    const geometries = new Set<Mesh["geometry"]>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    const bitmaps = new Set<ImageBitmap>();
    for (const model of models) {
        model.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            geometries.add(object.geometry);
            const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
            meshMaterials.forEach((material) => materials.add(material));
        });
    }
    for (const material of materials) {
        for (const value of Object.values(material)) {
            if (value instanceof Texture) textures.add(value);
        }
        material.dispose();
    }
    for (const texture of textures) {
        if (typeof ImageBitmap !== "undefined" && texture.source.data instanceof ImageBitmap) {
            bitmaps.add(texture.source.data);
        }
        texture.dispose();
    }
    bitmaps.forEach((bitmap) => bitmap.close());
    geometries.forEach((geometry) => geometry.dispose());
}

export async function loadPreviewModel(url: string, format: ModelPreviewFormat, size: number, signal: AbortSignal) {
    const data = await readModel(url, size, signal);
    if (format === "stl") {
        validateStl(data);
        const geometry = new STLLoader().parse(data);
        geometry.rotateX(-Math.PI / 2);
        const model = new Mesh(
            geometry,
            new MeshStandardMaterial({
                color: geometry.getAttribute("color") ? 0xffffff : 0x9aaed0,
                vertexColors: Boolean(geometry.getAttribute("color")),
                roughness: 0.7,
            })
        );
        return { model, dispose: () => disposeModels([model]) };
    }

    validateGlb(data);
    const manager = new LoadingManager().setURLModifier((resource) => {
        // The loader creates blob URLs for images stored in the binary chunk.
        if (resource.startsWith("blob:")) return resource;
        throw new Error("External model resources are unavailable in this preview.");
    });
    const gltf = await new GLTFLoader(manager).parseAsync(data, "");
    return { model: gltf.scene, dispose: () => disposeModels(gltf.scenes) };
}
