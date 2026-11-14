// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type ModelPreviewFormat = "glb" | "stl";

export function getModelPreviewFormat(path: string): ModelPreviewFormat {
    const extension = /\.(glb|stl)$/i.exec(path ?? "")?.[1];
    return extension?.toLowerCase() as ModelPreviewFormat;
}
