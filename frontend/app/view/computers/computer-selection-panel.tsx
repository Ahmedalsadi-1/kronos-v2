// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { getApi } from "@/store/global";
import type { ComputerTargetSnapshot } from "@/types/computer-targets";
import { useEffect, useRef, useState } from "react";
import {
    capturePixelPoint,
    captureRegion,
    deviceSelectionContext,
    type CapturePoint,
    type CaptureRegion,
} from "./computer-selection";

export function ComputerSelection({ snapshot, onClose }: { snapshot: ComputerTargetSnapshot; onClose: () => void }) {
    const image = useRef<HTMLImageElement>(null);
    const start = useRef<CapturePoint>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [region, setRegion] = useState<CaptureRegion>(null);
    const [mode, setMode] = useState("region");
    const [annotation, setAnnotation] = useState("");
    const [notice, setNotice] = useState("");
    const [preview, setPreview] = useState("");
    const [sending, setSending] = useState(false);
    const context = region ? deviceSelectionContext(snapshot, dimensions, region, annotation) : null;
    useEffect(() => {
        if (!region || !image.current || !dimensions.width) {
            setPreview("");
            return;
        }
        setPreview("");
        try {
            const canvas = document.createElement("canvas");
            canvas.width = region.width;
            canvas.height = region.height;
            const drawing = canvas.getContext("2d");
            if (!drawing) throw new Error("Image capture is unavailable.");
            drawing.drawImage(
                image.current,
                region.x,
                region.y,
                region.width,
                region.height,
                0,
                0,
                region.width,
                region.height
            );
            setPreview(canvas.toDataURL("image/png"));
        } catch (error) {
            setNotice(String(error));
        }
    }, [region, dimensions]);
    const point = (event: { clientX: number; clientY: number }, clamp = false) => {
        const bounds = image.current?.getBoundingClientRect();
        return bounds ? capturePixelPoint(bounds, dimensions, { x: event.clientX, y: event.clientY }, clamp) : null;
    };
    const copyImage = async () => {
        try {
            const blob = await (await fetch(preview)).blob();
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            setNotice("Image copied. Paste it into a chat to attach it.");
        } catch {
            setNotice("Image copy is unavailable. The selection preview and context remain available.");
        }
    };
    return (
        <div
            className="kt-device-selection"
            role="group"
            aria-label="Frozen device selection"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            <div className="kt-device-selection-settings">
                <strong>Screen selection · Labs</strong>
                <p>Frozen pixels only. Select a region without touching the device.</p>
                <label>
                    Capture{" "}
                    <select
                        value={mode}
                        onChange={(event) => {
                            setMode(event.target.value);
                            setRegion(
                                event.target.value === "full" && dimensions.width ? { x: 0, y: 0, ...dimensions } : null
                            );
                            start.current = null;
                        }}
                    >
                        <option value="region">Region</option>
                        <option value="full">Full frame</option>
                    </select>
                </label>
                <SystemButton size="small" onClick={onClose}>
                    Cancel selection
                </SystemButton>
            </div>
            <div
                className="kt-device-selection-frame"
                tabIndex={0}
                aria-label="Drag a region on the frozen screen"
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (mode !== "region") return;
                    start.current = point(event);
                    setRegion(null);
                    if (start.current) event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                    if (start.current) setRegion(captureRegion(start.current, point(event, true)));
                }}
                onPointerUp={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (start.current) setRegion(captureRegion(start.current, point(event, true)));
                    start.current = null;
                }}
                onPointerCancel={() => {
                    start.current = null;
                    setRegion(null);
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                <img
                    ref={image}
                    draggable={false}
                    onError={() =>
                        setNotice("The frozen screen could not be loaded. Cancel selection and capture again.")
                    }
                    src={snapshot.imageDataUrl}
                    alt={`Frozen ${snapshot.target.name} screen`}
                    onLoad={(event) => {
                        const size = {
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight,
                        };
                        setDimensions(size);
                        if (mode === "full") setRegion({ x: 0, y: 0, ...size });
                    }}
                />
                {region && dimensions.width > 0 && (
                    <span
                        className="kt-device-selection-region"
                        style={{
                            left: `${(100 * region.x) / dimensions.width}%`,
                            top: `${(100 * region.y) / dimensions.height}%`,
                            width: `${(100 * region.width) / dimensions.width}%`,
                            height: `${(100 * region.height) / dimensions.height}%`,
                        }}
                    />
                )}
            </div>
            <div className="kt-device-selection-review">
                {preview && <img className="kt-device-selection-preview" src={preview} alt="Selected screen pixels" />}
                <label>
                    Note{" "}
                    <input
                        value={annotation}
                        maxLength={2000}
                        placeholder="What should the agent inspect?"
                        onChange={(event) => setAnnotation(event.target.value)}
                    />
                </label>
                <div className="kt-device-selection-actions">
                    <SystemButton size="small" disabled={!preview} onClick={() => void copyImage()}>
                        Copy image
                    </SystemButton>
                    <SystemButton
                        size="small"
                        disabled={!context}
                        onClick={() =>
                            void navigator.clipboard.writeText(JSON.stringify(context, null, 2)).then(
                                () => setNotice("Context copied."),
                                () => setNotice("Clipboard is unavailable.")
                            )
                        }
                    >
                        Copy context
                    </SystemButton>
                    <SystemButton
                        size="small"
                        disabled={!context || !preview || sending}
                        onClick={() => {
                            setSending(true);
                            void getApi()
                                .sendHermesSelection({
                                    text: `Selected mobile screen region (Labs; pixel-only snapshot; revalidate device before acting):\n${JSON.stringify(context, null, 2)}`,
                                    target: "current",
                                    images: [{ filename: "mobile-selection.png", dataUrl: preview }],
                                })
                                .then(
                                    () =>
                                        setNotice(
                                            "Image and context queued for Hermes. Failed sends return to its draft."
                                        ),
                                    (error) =>
                                        setNotice(
                                            error instanceof Error
                                                ? error.message
                                                : "Could not queue selection. Retry when Hermes is available."
                                        )
                                )
                                .finally(() => setSending(false));
                        }}
                    >
                        {sending ? "Sending…" : "Send to Hermes"}
                    </SystemButton>
                </div>
                <p role="status">
                    {notice ||
                        (region
                            ? `${region.width} × ${region.height} pixels · ${dimensions.width} × ${dimensions.height} frame`
                            : "Drag a region, or choose Full frame for keyboard selection.")}
                </p>
            </div>
        </div>
    );
}
