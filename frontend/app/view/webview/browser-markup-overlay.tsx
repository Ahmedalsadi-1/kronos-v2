// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { cn } from "@/util/util";
import { ArrowUpRight, Circle, Copy, Highlighter, Pencil, Square, Type, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    drawBrowserMarkup,
    markupPointInImage,
    type BrowserMarkupShape,
    type BrowserMarkupTool,
} from "./browser-markup-model";

export const BrowserMarkupEvent = "kronterm:browser-markup";
const Tools = [
    { tool: "pen", label: "Pen", icon: Pencil },
    { tool: "highlight", label: "Highlight", icon: Highlighter },
    { tool: "arrow", label: "Arrow", icon: ArrowUpRight },
    { tool: "rect", label: "Rectangle", icon: Square },
    { tool: "ellipse", label: "Ellipse", icon: Circle },
    { tool: "text", label: "Text", icon: Type },
] as const;

export function BrowserMarkupOverlay({ blockId }: { blockId: string }) {
    const [screenshot, setScreenshot] = useState<string>(null);
    const [tool, setTool] = useState<BrowserMarkupTool>("pen");
    const [color, setColor] = useState("#a78bfa");
    const [width, setWidth] = useState(3);
    const [text, setText] = useState("");
    const [shapes, setShapes] = useState<BrowserMarkupShape[]>([]);
    const [draft, setDraft] = useState<BrowserMarkupShape>(null);
    const [status, setStatus] = useState("");
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const open = (event: Event) => {
            const detail = (event as CustomEvent<{ blockId: string; dataUrl: string }>).detail;
            if (detail.blockId !== blockId) return;
            setShapes([]);
            setDraft(null);
            setStatus("");
            setScreenshot(detail.dataUrl);
        };
        window.addEventListener(BrowserMarkupEvent, open);
        return () => window.removeEventListener(BrowserMarkupEvent, open);
    }, [blockId]);

    useEffect(() => {
        if (!screenshot) return;
        const image = new Image();
        image.onload = () => {
            imageRef.current = image;
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            for (const shape of shapes) drawBrowserMarkup(context, shape);
            if (draft) drawBrowserMarkup(context, draft);
        };
        image.src = screenshot;
        return () => {
            image.onload = null;
        };
    }, [screenshot, shapes, draft]);

    if (!screenshot) return null;
    const point = (event: React.PointerEvent<HTMLCanvasElement>) =>
        markupPointInImage({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), {
            width: event.currentTarget.width,
            height: event.currentTarget.height,
        });
    const copy = async () => {
        try {
            const copied = await getApi().copyBrowserImage(canvasRef.current.toDataURL("image/png"));
            setStatus(copied ? "Screenshot copied" : "Unable to copy screenshot");
        } catch {
            setStatus("Unable to copy screenshot");
        }
    };
    return (
        <section
            className="absolute inset-0 z-40 flex min-h-0 flex-col bg-black/95 p-2"
            aria-label="Screenshot markup"
            onKeyDown={(event) => {
                if (event.key === "Escape") setScreenshot(null);
            }}
        >
            <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg border border-white/15 bg-[#171719] p-1 text-white">
                {Tools.map(({ tool: itemTool, label, icon: Icon }) => (
                    <button
                        type="button"
                        key={itemTool}
                        title={label}
                        aria-label={label}
                        aria-pressed={tool === itemTool}
                        className={cn(
                            "grid size-8 cursor-pointer place-items-center rounded hover:bg-white/10",
                            tool === itemTool && "bg-violet-400/20 text-violet-300"
                        )}
                        onClick={() => setTool(itemTool)}
                    >
                        <Icon size={16} />
                    </button>
                ))}
                <input
                    type="color"
                    value={color}
                    aria-label="Markup color"
                    className="size-7 cursor-pointer"
                    onChange={(event) => setColor(event.target.value)}
                />
                <select
                    value={width}
                    aria-label="Stroke width"
                    className="h-7 cursor-pointer rounded bg-white/10"
                    onChange={(event) => setWidth(Number(event.target.value))}
                >
                    {[2, 3, 5, 10, 20].map((value) => (
                        <option key={value} value={value}>
                            {value}px
                        </option>
                    ))}
                </select>
                {tool === "text" && (
                    <input
                        aria-label="Markup text"
                        value={text}
                        onChange={(event) => setText(event.target.value.slice(0, 500))}
                        placeholder="Text to place"
                        className="h-7 min-w-0 rounded bg-white/10 px-2"
                    />
                )}
                <button
                    type="button"
                    aria-label="Undo markup"
                    disabled={!shapes.length}
                    className="grid size-8 cursor-pointer place-items-center disabled:opacity-30"
                    onClick={() => setShapes(shapes.slice(0, -1))}
                >
                    <Undo2 size={16} />
                </button>
                <button
                    type="button"
                    aria-label="Copy marked screenshot"
                    className="grid size-8 cursor-pointer place-items-center"
                    onClick={() => void copy()}
                >
                    <Copy size={16} />
                </button>
                <button
                    autoFocus
                    type="button"
                    aria-label="Close markup"
                    className="ml-auto grid size-8 cursor-pointer place-items-center"
                    onClick={() => setScreenshot(null)}
                >
                    <X size={16} />
                </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className="max-h-full max-w-full touch-none object-contain"
                    style={{ cursor: "crosshair" }}
                    onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const first = point(event);
                        const shape = {
                            tool,
                            color,
                            width: tool === "highlight" ? width * 5 : width,
                            points: [first],
                            text,
                        };
                        if (tool === "text") {
                            if (text.trim()) setShapes([...shapes, shape]);
                            return;
                        }
                        setDraft(shape);
                    }}
                    onPointerMove={(event) => {
                        if (!draft) return;
                        const next = point(event);
                        setDraft({
                            ...draft,
                            points:
                                draft.tool === "pen" || draft.tool === "highlight"
                                    ? [...draft.points, next]
                                    : [draft.points[0], next],
                        });
                    }}
                    onPointerUp={() => {
                        if (draft) setShapes([...shapes, draft]);
                        setDraft(null);
                    }}
                    onPointerCancel={() => setDraft(null)}
                />
            </div>
            {status && (
                <p className="text-center text-xs text-white" role="status">
                    {status}
                </p>
            )}
        </section>
    );
}
