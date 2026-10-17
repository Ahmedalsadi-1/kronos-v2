// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type BrowserMarkupTool = "pen" | "highlight" | "arrow" | "rect" | "ellipse" | "text";
export interface MarkupPoint {
    x: number;
    y: number;
}
export interface BrowserMarkupShape {
    tool: BrowserMarkupTool;
    points: MarkupPoint[];
    color: string;
    width: number;
    text?: string;
}

export function markupPointInImage(
    point: MarkupPoint,
    display: { left: number; top: number; width: number; height: number },
    image: { width: number; height: number }
): MarkupPoint {
    return {
        x: Math.max(0, Math.min(image.width, ((point.x - display.left) / display.width) * image.width)),
        y: Math.max(0, Math.min(image.height, ((point.y - display.top) / display.height) * image.height)),
    };
}

export function drawBrowserMarkup(context: CanvasRenderingContext2D, shape: BrowserMarkupShape) {
    const start = shape.points[0];
    const end = shape.points[shape.points.length - 1];
    if (!start || !end) return;
    context.save();
    context.strokeStyle = shape.color;
    context.fillStyle = shape.color;
    context.lineWidth = shape.width;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.globalAlpha = shape.tool === "highlight" ? 0.35 : 1;
    context.beginPath();
    if (shape.tool === "text") {
        context.font = `${Math.max(16, shape.width * 6)}px system-ui`;
        context.fillText(shape.text ?? "", start.x, start.y);
    } else if (shape.tool === "rect") {
        context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (shape.tool === "ellipse") {
        context.ellipse(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2,
            Math.abs(end.x - start.x) / 2,
            Math.abs(end.y - start.y) / 2,
            0,
            0,
            Math.PI * 2
        );
        context.stroke();
    } else {
        context.moveTo(start.x, start.y);
        for (const point of shape.points.slice(1)) context.lineTo(point.x, point.y);
        context.stroke();
        if (shape.tool === "arrow") {
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const length = Math.max(12, shape.width * 4);
            context.beginPath();
            context.moveTo(
                end.x - length * Math.cos(angle - Math.PI / 6),
                end.y - length * Math.sin(angle - Math.PI / 6)
            );
            context.lineTo(end.x, end.y);
            context.lineTo(
                end.x - length * Math.cos(angle + Math.PI / 6),
                end.y - length * Math.sin(angle + Math.PI / 6)
            );
            context.stroke();
        }
    }
    context.restore();
}
