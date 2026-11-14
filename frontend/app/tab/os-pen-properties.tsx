// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlignCenter, AlignLeft, AlignRight, MousePointer2, Palette, SlidersHorizontal, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PenLayer } from "./os-pen-import";
import "./os-pen-ui.css";
import type { OSCanvasObject } from "./os-workspace-model";

function PropertyField({
    label,
    value,
    onCommit,
    number = false,
    min,
    max,
    multiline = false,
}: {
    label: string;
    value: string | number;
    onCommit: (value: string) => void;
    number?: boolean;
    min?: number;
    max?: number;
    multiline?: boolean;
}) {
    const [draft, setDraft] = useState(String(value ?? ""));
    const cancelled = useRef(false);
    useEffect(() => setDraft(String(value ?? "")), [value]);
    const commit = () => {
        if (cancelled.current) {
            cancelled.current = false;
            return;
        }
        if (
            number &&
            (draft.trim() === "" ||
                !Number.isFinite(Number(draft)) ||
                (min != null && Number(draft) < min) ||
                (max != null && Number(draft) > max))
        ) {
            setDraft(String(value ?? ""));
            return;
        }
        if (draft !== String(value ?? "")) onCommit(draft);
    };
    const shared = {
        "aria-label": label,
        value: draft,
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            event.stopPropagation();
            if (event.key === "Enter" && !multiline) event.currentTarget.blur();
            if (event.key === "Escape") {
                cancelled.current = true;
                setDraft(String(value ?? ""));
                event.currentTarget.blur();
            }
        },
    };
    return (
        <label className={`os-pen-field${multiline ? " is-multiline" : ""}`}>
            <span>{label}</span>
            {multiline ? (
                <textarea {...shared} rows={3} maxLength={12000} />
            ) : (
                <input
                    {...shared}
                    type={number ? "number" : "text"}
                    step={number ? "any" : undefined}
                    min={min}
                    max={max}
                />
            )}
        </label>
    );
}

export function OSPenProperties({
    layer,
    onChange,
}: {
    layer?: OSCanvasObject;
    onChange: (patch: Partial<OSCanvasObject>) => void;
}) {
    const [error, setError] = useState("");
    useEffect(() => setError(""), [layer?.id]);
    if (!layer?.pen)
        return (
            <div className="os-pen-properties-content">
                <div className="os-pen-panel-heading">
                    <div>
                        <SlidersHorizontal size={15} />
                        <h2>Design</h2>
                    </div>
                </div>
                <div className="os-pen-empty">
                    <div className="os-pen-empty-icon">
                        <MousePointer2 size={24} />
                    </div>
                    <strong>Make something yours</strong>
                    <p>Select any layer to adjust its size, color, and typography.</p>
                </div>
            </div>
        );
    const pen = layer.pen;
    const update = (patch: Partial<PenLayer>) => {
        onChange({ pen: { ...pen, ...patch } });
        setError("");
    };
    const color = (property: "fill" | "stroke", value: string) => {
        if (value && !/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) {
            setError("Use a hex color, such as #6366F1.");
            return;
        }
        update({ [property]: value || undefined });
    };
    const isText = pen.type === "text" || pen.type === "note";
    const colorField = (property: "fill" | "stroke") => (
        <div className="os-pen-color-field">
            <input
                type="color"
                aria-label={`${property === "fill" ? "Fill" : "Stroke"} color picker`}
                value={/^#[\da-f]{6}$/i.test(pen[property] ?? "") ? pen[property] : "#6366f1"}
                onChange={(event) => update({ [property]: event.target.value })}
            />
            <PropertyField
                label={property === "fill" ? "Fill" : "Stroke"}
                value={pen[property] ?? ""}
                onCommit={(value) => color(property, value)}
            />
        </div>
    );
    return (
        <div className="os-pen-properties-content" onKeyDown={(event) => event.stopPropagation()}>
            <header className="os-pen-panel-heading">
                <div>
                    <SlidersHorizontal size={15} />
                    <h2>Design</h2>
                </div>
                <span className="os-pen-type-label">{pen.type}</span>
            </header>
            <section className="os-pen-property-section">
                <PropertyField
                    label="Name"
                    value={layer.name ?? pen.type}
                    onCommit={(name) => name.trim() && onChange({ name: name.trim() })}
                />
                <h3>Layout</h3>
                <div className="os-pen-field-grid">
                    {(["x", "y", "width", "height"] as const).map((key) => (
                        <PropertyField
                            key={key}
                            label={{ x: "X", y: "Y", width: "W", height: "H" }[key]}
                            value={Math.round(layer[key] * 100) / 100}
                            number
                            min={key === "width" || key === "height" ? 1 : -100000}
                            max={100000}
                            onCommit={(value) => onChange({ [key]: Number(value) })}
                        />
                    ))}
                    <PropertyField
                        label="Rotation"
                        value={pen.rotation ?? 0}
                        number
                        min={-360}
                        max={360}
                        onCommit={(value) => update({ rotation: Number(value) })}
                    />
                    <PropertyField
                        label="Radius"
                        value={pen.radius ?? 0}
                        number
                        min={0}
                        max={100000}
                        onCommit={(value) => update({ radius: Number(value) })}
                    />
                </div>
            </section>
            <section className="os-pen-property-section">
                <h3>
                    <Palette size={14} /> Appearance
                </h3>
                {colorField("fill")}
                <PropertyField
                    label="Opacity %"
                    value={Math.round((pen.opacity ?? 1) * 100)}
                    number
                    min={0}
                    max={100}
                    onCommit={(value) => update({ opacity: Number(value) / 100 })}
                />
                {colorField("stroke")}
                <PropertyField
                    label="Stroke width"
                    value={pen.strokeWidth ?? 0}
                    number
                    min={0}
                    max={1000}
                    onCommit={(value) => update({ strokeWidth: Number(value) })}
                />
            </section>
            {isText && (
                <section className="os-pen-property-section">
                    <h3>
                        <Type size={14} /> Typography
                    </h3>
                    <PropertyField
                        label="Content"
                        value={layer.text ?? ""}
                        multiline
                        onCommit={(text) => onChange({ text })}
                    />
                    <PropertyField
                        label="Font"
                        value={pen.fontFamily ?? "Inter"}
                        onCommit={(fontFamily) => update({ fontFamily })}
                    />
                    <div className="os-pen-field-grid">
                        <PropertyField
                            label="Size"
                            value={pen.fontSize ?? 16}
                            number
                            min={1}
                            max={1000}
                            onCommit={(value) => update({ fontSize: Number(value) })}
                        />
                        <PropertyField
                            label="Weight"
                            value={pen.fontWeight ?? "400"}
                            number
                            min={1}
                            max={1000}
                            onCommit={(fontWeight) => update({ fontWeight })}
                        />
                        <PropertyField
                            label="Line height"
                            value={pen.lineHeight ?? 1.2}
                            number
                            min={0.1}
                            max={20}
                            onCommit={(value) => update({ lineHeight: Number(value) })}
                        />
                        <PropertyField
                            label="Tracking"
                            value={pen.letterSpacing ?? 0}
                            number
                            min={-100}
                            max={100}
                            onCommit={(value) => update({ letterSpacing: Number(value) })}
                        />
                    </div>
                    <div className="os-pen-alignment" role="group" aria-label="Text alignment">
                        {(
                            [
                                ["left", AlignLeft],
                                ["center", AlignCenter],
                                ["right", AlignRight],
                            ] as const
                        ).map(([align, Icon]) => (
                            <button
                                key={align}
                                type="button"
                                aria-label={`Align ${align}`}
                                aria-pressed={(pen.textAlign ?? "left") === align}
                                onClick={() => update({ textAlign: align })}
                            >
                                <Icon size={15} />
                            </button>
                        ))}
                    </div>
                </section>
            )}
            {pen.type === "path" && (
                <section className="os-pen-property-section">
                    <h3>Vector</h3>
                    <PropertyField
                        label="Path data"
                        value={pen.geometry ?? ""}
                        multiline
                        onCommit={(geometry) => update({ geometry })}
                    />
                </section>
            )}
            {error && (
                <p role="alert" className="os-pen-property-error">
                    {error}
                </p>
            )}
            <footer className="os-pen-property-footer">Changes save to your workspace</footer>
        </div>
    );
}
