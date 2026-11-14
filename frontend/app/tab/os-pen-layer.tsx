// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties } from "react";
import type { OSCanvasObject } from "./os-workspace-model";

export function penLayerStyle(object: OSCanvasObject): CSSProperties {
    const { pen } = object;
    if (!pen) return {};
    const isText = pen.type === "text" || pen.type === "note";
    const isVector = pen.type === "path" || pen.type === "polygon";
    return {
        background: isVector || pen.type === "text" ? "transparent" : (pen.fill ?? "transparent"),
        boxShadow:
            !isVector && pen.stroke && pen.strokeWidth > 0 ? `inset 0 0 0 ${pen.strokeWidth}px ${pen.stroke}` : "none",
        borderRadius: pen.type === "ellipse" ? "50%" : (pen.radius ?? 0),
        transform: pen.rotation ? `rotate(${-pen.rotation}deg)` : undefined,
        transformOrigin: "top left",
        opacity: pen.opacity,
        color: pen.type === "text" ? (pen.fill ?? "var(--kt-label, white)") : "#222",
        fontFamily: isText ? pen.fontFamily : undefined,
        fontSize: isText ? pen.fontSize : undefined,
        fontWeight: isText ? pen.fontWeight : undefined,
        lineHeight: isText ? pen.lineHeight : undefined,
        letterSpacing: isText ? pen.letterSpacing : undefined,
        textAlign: isText ? pen.textAlign : undefined,
        whiteSpace: isText ? "pre-wrap" : undefined,
    };
}

export function OSPenLayerArtwork({ layer }: { layer: OSCanvasObject }) {
    const pen = layer.pen;
    if (pen?.type === "polygon") {
        const sides = pen.polygonCount ?? 3;
        const points = Array.from({ length: sides }, (_, index) => {
            const angle = (index * Math.PI * 2) / sides - Math.PI / 2;
            return `${50 + Math.cos(angle) * 50},${50 + Math.sin(angle) * 50}`;
        }).join(" ");
        return (
            <svg
                className="pointer-events-none block size-full overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <polygon
                    points={points}
                    fill={pen.fill ?? "none"}
                    stroke={pen.stroke}
                    strokeWidth={pen.strokeWidth}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        );
    }
    if (pen?.geometry) {
        return (
            <svg
                className="pointer-events-none block size-full overflow-visible"
                viewBox={pen.viewBox}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path
                    d={pen.geometry}
                    fill={pen.fill ?? "none"}
                    stroke={pen.stroke}
                    strokeWidth={pen.strokeWidth}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        );
    }
    return layer.text;
}
