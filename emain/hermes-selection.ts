// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { HermesSelection } from "../frontend/types/hermes-selection";

export function validateHermesSelection(input: unknown): HermesSelection {
    const value = input as HermesSelection;
    if (
        !value ||
        typeof value.text !== "string" ||
        !value.text.trim() ||
        value.text.length > 64000 ||
        !["current", "new"].includes(value.target)
    )
        throw new Error("Invalid selection context");
    if (value.images != null && (!Array.isArray(value.images) || value.images.length > 4))
        throw new Error("Invalid selection images");
    let bytes = 0;
    const images = value.images?.map((image) => {
        if (
            !image ||
            typeof image.filename !== "string" ||
            image.filename.length > 200 ||
            typeof image.dataUrl !== "string" ||
            image.dataUrl.length > 4_000_000 ||
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl)
        )
            throw new Error("Invalid selection image");
        bytes += image.dataUrl.length;
        if (bytes > 8_000_000) throw new Error("Selection images are too large");
        return { filename: image.filename.split(/[\\/]/).pop() || "selection.png", dataUrl: image.dataUrl };
    });
    return { text: value.text.trim(), target: value.target, ...(images?.length ? { images } : {}) };
}
