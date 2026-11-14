// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { ScreenSelectorToolbar, type ScreenSelectorAction } from "@/app/lib/screen-selector-toolbar";
import { getApi } from "@/store/global";
import type { ComputerTargetSnapshot, DeviceSelectedElement } from "@/types/computer-targets";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    capturePixelPoint,
    captureRegion,
    deviceSelectionContext,
    type CapturePoint,
    type CaptureRegion,
} from "./computer-selection";
import "./computers.css";

export type VmSelectionSnapshot = {
    imageDataUrl: string;
    capturedAt: number;
    name: string;
} & (
    | { kind: "linux"; desktopId: string; controlGeneration: number; supportsElementPick?: boolean }
    | { kind: "macos"; blockId: string; sessionId: string }
);

export function ComputerSelection({
    snapshot,
    vm,
    action,
    onClose,
}: ({ snapshot: ComputerTargetSnapshot; vm?: never } | { snapshot?: never; vm: VmSelectionSnapshot }) & {
    onClose: () => void;
    action?: ScreenSelectorAction;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const selectionFrame = useRef<HTMLDivElement>(null);
    const image = useRef<HTMLImageElement>(null);
    const start = useRef<CapturePoint>(null);
    const revision = useRef(0);
    const canPickElement = snapshot?.target.kind === "ios-simulator" || snapshot?.target.id.startsWith("android-");
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [region, setRegion] = useState<CaptureRegion>(null);
    const [mode, setMode] = useState(
        action ? (action === "region" ? "region" : "point") : vm || canPickElement ? "point" : "region"
    );
    const [selectedPoint, setSelectedPoint] = useState<CapturePoint>(null);
    const [element, setElement] = useState<DeviceSelectedElement>(null);
    const [resolving, setResolving] = useState(false);
    const [annotation, setAnnotation] = useState("");
    const [notice, setNotice] = useState("");
    const [preview, setPreview] = useState("");
    const [sending, setSending] = useState(false);
    useEffect(() => {
        selectionFrame.current?.focus({ preventScroll: true });
    }, []);
    const context = region
        ? vm
            ? {
                  kind: "vm-screen-selection",
                  semantics: element ? "accessibility" : "pixels-only",
                  name: vm.name,
                  capturedAt: vm.capturedAt,
                  ...(vm.kind === "linux"
                      ? { desktopId: vm.desktopId, controlGeneration: vm.controlGeneration }
                      : { blockId: vm.blockId, sessionId: vm.sessionId }),
                  frame: dimensions,
                  region,
                  point: selectedPoint,
                  ...(element ? { element } : {}),
                  annotation: annotation.trim(),
                  requiresRevalidation: true,
              }
            : {
                  ...deviceSelectionContext(snapshot, dimensions, region, annotation),
                  ...(element ? { semantics: "accessibility", element } : {}),
                  ...(selectedPoint ? { point: selectedPoint } : {}),
              }
        : null;
    const tools = !vm
        ? "Use device_list and device_screenshot for this deviceId, then use device tools on it."
        : vm.kind === "linux"
          ? "Use linux_desktop_list and linux_desktop_screenshot for this desktopId. Use Linux desktop tools for the desktop and guest browser."
          : "Use widget_screenshot on this macOS VM blockId, then use widget tools inside the guest.";
    useEffect(
        () => () => {
            revision.current++;
        },
        []
    );
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
    const selectPoint = async (pixel: CapturePoint) => {
        if (!pixel || !dimensions.width || !dimensions.height) return;
        const x = Math.min(dimensions.width - 1, Math.floor(pixel.x));
        const y = Math.min(dimensions.height - 1, Math.floor(pixel.y));
        const normalized = { x: x / dimensions.width, y: y / dimensions.height };
        const operation = ++revision.current;
        setNotice("");
        setElement(null);
        setSelectedPoint(vm ? { x, y } : normalized);
        const fallback = {
            x: Math.max(0, x - 24),
            y: Math.max(0, y - 24),
            width: Math.min(48, dimensions.width - Math.max(0, x - 24)),
            height: Math.min(48, dimensions.height - Math.max(0, y - 24)),
        };
        setRegion(fallback);
        if (vm?.kind === "linux" && vm.supportsElementPick) {
            setResolving(true);
            try {
                const result = await getApi().performLinuxDesktopAction({
                    action: "pick-element",
                    desktopId: vm.desktopId,
                    expectedGeneration: vm.controlGeneration,
                    x,
                    y,
                });
                if (operation !== revision.current || !result.success || !result.data.element) return;
                const hit = result.data.element;
                const { frame } = hit;
                const bounds = captureRegion(
                    { x: Math.max(0, frame.x), y: Math.max(0, frame.y) },
                    {
                        x: Math.min(dimensions.width, frame.x + frame.width),
                        y: Math.min(dimensions.height, frame.y + frame.height),
                    }
                );
                if (bounds) {
                    setElement(hit);
                    setRegion(bounds);
                }
            } catch (error) {
                if (operation === revision.current) {
                    setNotice(error instanceof Error ? error.message : "VM element information is unavailable.");
                }
            } finally {
                if (operation === revision.current) setResolving(false);
            }
            return;
        }
        if (!canPickElement) return;
        setResolving(true);
        try {
            const result = await getApi().pickComputerTargetElement({
                targetId: snapshot.target.id,
                expectedGeneration: snapshot.target.controlGeneration,
                ...normalized,
                ...dimensions,
            });
            if (operation !== revision.current) return;
            if (result.success === false) throw new Error(result.error.message);
            if (!result.data) {
                setNotice("No accessible element was found. You can comment on the selected pixels.");
                return;
            }
            const { frame } = result.data;
            const elementRegion = captureRegion(
                { x: Math.max(0, frame.x) * dimensions.width, y: Math.max(0, frame.y) * dimensions.height },
                {
                    x: Math.min(1, frame.x + frame.width) * dimensions.width,
                    y: Math.min(1, frame.y + frame.height) * dimensions.height,
                }
            );
            setElement(result.data);
            if (elementRegion) setRegion(elementRegion);
        } catch (error) {
            if (operation === revision.current) {
                setNotice(error instanceof Error ? error.message : "Element information is unavailable.");
            }
        } finally {
            if (operation === revision.current) setResolving(false);
        }
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
    const sendSelection = (comment: string) => {
        if (!context || !preview || resolving || sending) return;
        const text = comment.trim().slice(0, 2000);
        setSending(true);
        void getApi()
            .sendHermesSelection({
                text: `${text}\n\nSelected ${vm ? "VM screen" : "mobile"} target (Labs snapshot, revalidate before acting). ${tools}\n${JSON.stringify({ ...context, annotation: text }, null, 2)}`,
                target: "current",
                images: [{ filename: vm ? "vm-selection.png" : "mobile-selection.png", dataUrl: preview }],
            })
            .then(
                () => {
                    if (action || vm || mode === "point") onClose();
                    else setNotice("Image and context queued for Hermes. Failed sends return to its draft.");
                },
                (error) => setNotice(error instanceof Error ? error.message : "Could not queue selection.")
            )
            .finally(() => setSending(false));
    };
    const panelBounds = panel.current?.getBoundingClientRect();
    const imageBounds = image.current?.getBoundingClientRect();
    const inlinePrompt =
        action &&
        region &&
        preview &&
        !resolving &&
        !start.current &&
        panelBounds?.width &&
        panelBounds.height &&
        imageBounds
            ? {
                  x:
                      (imageBounds.left -
                          panelBounds.left +
                          (imageBounds.width * (region.x + region.width / 2)) / dimensions.width) /
                      panelBounds.width,
                  y:
                      (imageBounds.top -
                          panelBounds.top +
                          (imageBounds.height * (region.y + region.height / 2)) / dimensions.height) /
                      panelBounds.height,
                  label:
                      element?.name ||
                      (vm ? element?.role : "") ||
                      element?.application ||
                      (mode === "region"
                          ? "Screen region"
                          : vm
                            ? `Screen point (${selectedPoint?.x}, ${selectedPoint?.y})`
                            : snapshot.target.name),
              }
            : null;
    return (
        <div
            ref={panel}
            className={vm ? "kt-device-selection kt-vm-screen-selection" : "kt-device-selection relative"}
            role="group"
            aria-label={vm ? "Frozen VM selection" : "Frozen device selection"}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            {vm ? (
                <SystemButton
                    className="kt-vm-selection-cancel"
                    size="small"
                    aria-label="Cancel selection"
                    title="Cancel selection (Escape)"
                    onClick={onClose}
                >
                    <X size={15} aria-hidden="true" />
                </SystemButton>
            ) : (
                <div className="kt-device-selection-settings">
                    <strong>Screen selection · Labs</strong>
                    <p>
                        {canPickElement
                            ? "Pick an app or control, or drag a screen region."
                            : "Pick a point or region on the frozen screen."}
                    </p>
                    <label>
                        Capture{" "}
                        <select
                            value={mode}
                            onChange={(event) => {
                                setMode(event.target.value);
                                revision.current++;
                                setResolving(false);
                                setElement(null);
                                setSelectedPoint(null);
                                setNotice("");
                                setRegion(
                                    event.target.value === "full" && dimensions.width
                                        ? { x: 0, y: 0, ...dimensions }
                                        : null
                                );
                                start.current = null;
                            }}
                        >
                            <option value="point">{canPickElement ? "App or element" : "Point"}</option>
                            <option value="region">Region</option>
                            <option value="full">Full frame</option>
                        </select>
                    </label>
                    <SystemButton size="small" onClick={onClose}>
                        Cancel selection
                    </SystemButton>
                </div>
            )}
            <div
                ref={selectionFrame}
                className="kt-device-selection-frame"
                style={
                    vm && dimensions.height
                        ? {
                              width: `min(100cqw, calc(100cqh * ${dimensions.width / dimensions.height}))`,
                              aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                          }
                        : undefined
                }
                tabIndex={0}
                aria-label={
                    mode === "point" ? "Pick a target on the frozen screen" : "Drag a region on the frozen screen"
                }
                onKeyDown={(event) => {
                    if (event.key !== "Enter" || mode !== "point") return;
                    event.preventDefault();
                    void selectPoint({ x: dimensions.width / 2, y: dimensions.height / 2 });
                }}
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
                    if (mode === "point") void selectPoint(point(event));
                }}
            >
                <img
                    ref={image}
                    draggable={false}
                    onError={() =>
                        setNotice("The frozen screen could not be loaded. Cancel selection and capture again.")
                    }
                    src={vm?.imageDataUrl ?? snapshot.imageDataUrl}
                    alt={`Frozen ${vm?.name ?? snapshot.target.name} screen`}
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
            {inlinePrompt && (
                <ScreenSelectorToolbar
                    title="Comment on selected screen target"
                    prompt={inlinePrompt}
                    onComment={sendSelection}
                    onCancel={() => {
                        if (vm) {
                            onClose();
                            return;
                        }
                        setRegion(null);
                        setSelectedPoint(null);
                        setElement(null);
                    }}
                />
            )}
            {action ? (
                (notice || resolving || sending) && (
                    <p role="status">
                        {resolving ? "Finding the selected app or element…" : sending ? "Sending…" : notice}
                    </p>
                )
            ) : (
                <div className="kt-device-selection-review">
                    {element && (
                        <strong>
                            {[element.application, element.name || element.id || element.role]
                                .filter(Boolean)
                                .join(" · ")}
                        </strong>
                    )}
                    {preview && (
                        <img className="kt-device-selection-preview" src={preview} alt="Selected screen pixels" />
                    )}
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
                            disabled={
                                !context || !preview || sending || resolving || (mode === "point" && !annotation.trim())
                            }
                            onClick={() => sendSelection(annotation)}
                        >
                            {sending ? "Sending…" : "Send to Hermes"}
                        </SystemButton>
                    </div>
                    <p role="status">
                        {resolving
                            ? "Finding the selected app or element…"
                            : notice ||
                              (region
                                  ? `${region.width} × ${region.height} pixels · ${dimensions.width} × ${dimensions.height} frame`
                                  : "Drag a region, or choose Full frame for keyboard selection.")}
                    </p>
                </div>
            )}
        </div>
    );
}
