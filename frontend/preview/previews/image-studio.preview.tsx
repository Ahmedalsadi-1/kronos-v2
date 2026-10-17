// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ImageStudio, ImageStudioModel } from "@/app/view/imagestudio/imagestudio";
import { useMemo, useRef } from "react";

export function ImageStudioPreview() {
    const blockRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const model = useMemo(() => new ImageStudioModel({ blockId: "image-appearance" } as ViewModelInitType), []);
    return (
        <div className="flex h-full flex-col">
            <p className="bg-amber-950 px-4 py-2 text-sm text-amber-100">
                Appearance preview. Connecting and rendering require the desktop runtime and a local ComfyUI server.
            </p>
            <div className="min-h-0 flex-1">
                <ImageStudio model={model} blockId={model.blockId} blockRef={blockRef} contentRef={contentRef} />
            </div>
        </div>
    );
}
