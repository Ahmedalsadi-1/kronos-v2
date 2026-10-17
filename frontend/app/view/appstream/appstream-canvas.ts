// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function drawAppStreamFrame(context: CanvasRenderingContext2D, image: HTMLImageElement): void {
    const canvas = context.canvas;
    const widthChanged = canvas.width !== image.naturalWidth;
    const heightChanged = canvas.height !== image.naturalHeight;
    // Assigning even identical dimensions resets the backing buffer and drawing state.
    if (widthChanged) canvas.width = image.naturalWidth;
    if (heightChanged) canvas.height = image.naturalHeight;
    if (!widthChanged && !heightChanged) {
        context.clearRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0);
}
