// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { OSCanvasObject } from "./os-workspace-model";

export type PenLayer = {
    documentId: string;
    parentId?: string;
    type: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    radius?: number;
    rotation?: number;
    opacity?: number;
    geometry?: string;
    lineHeight?: number;
    letterSpacing?: number;
    polygonCount?: number;
    viewBox?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    textAlign?: "left" | "center" | "right" | "justify";
};

type PenNode = Record<string, unknown>;
const LayerTypes = new Set(["frame", "group", "rectangle", "ellipse", "polygon", "path", "text", "note"]);
const SvgNamespace = "http://www.w3.org/2000/svg";

function record(value: unknown): PenNode {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as PenNode) : {};
}

function number(value: unknown, fallback = 0): number {
    if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) return fallback;
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

function color(value: unknown): string | undefined {
    if (Array.isArray(value)) return value.map(color).filter(Boolean).at(-1);
    if (typeof value === "string") return /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? value : undefined;
    const fill = record(value);
    if (fill.type === "color" && fill.enabled !== false) return color(fill.color);
}

function pathViewBox(node: PenNode, geometry: string): string {
    if (Array.isArray(node.viewBox) && node.viewBox.length === 4 && node.viewBox.every(Number.isFinite)) {
        return node.viewBox.join(" ");
    }
    const svg = document.createElementNS(SvgNamespace, "svg");
    svg.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
    const path = document.createElementNS(SvgNamespace, "path");
    path.setAttribute("d", geometry);
    svg.append(path);
    document.body.append(svg);
    try {
        const { x, y, width, height } = path.getBBox();
        return `${x} ${y} ${Math.max(width, 1)} ${Math.max(height, 1)}`;
    } finally {
        svg.remove();
    }
}

export function importPenLayers(source: string): { layers: OSCanvasObject[]; skipped: number } {
    const root = record(JSON.parse(source));
    if (typeof root.version !== "string" || !Array.isArray(root.children)) {
        throw new Error("Choose a valid .pen document.");
    }
    const documentId = crypto.randomUUID();
    const layers: OSCanvasObject[] = [];
    let skipped = 0;
    let count = 0;
    const variables = record(root.variables);
    function value(input: unknown, depth = 0): unknown {
        if (typeof input !== "string" || !input.startsWith("$") || depth > 12) return input;
        const variable = record(variables[input.slice(1)]).value;
        return value(Array.isArray(variable) ? record(variable[0]).value : variable, depth + 1);
    }

    function read(raw: unknown, parentId?: string, depth = 0): HTMLDivElement | undefined {
        if (++count > 6000 || depth > 80) throw new Error("This .pen document is too large to import.");
        const node = record(raw);
        const type = typeof node.type === "string" ? node.type : "";
        if (!LayerTypes.has(type)) {
            skipped++;
            return;
        }
        if (value(node.enabled) === false) return;
        const id = `${documentId}-${count}`;
        const text = value(node.content);
        const fontSize = Math.max(1, number(value(node.fontSize), 16));
        const geometry = type === "path" && typeof node.geometry === "string" ? node.geometry : undefined;
        const pen: PenLayer = {
            documentId,
            parentId,
            type,
            fill: color(value(type === "note" ? node.color : node.fill)) ?? (type === "note" ? "#fee484" : undefined),
            stroke: color(value(node.stroke)),
            strokeWidth: number(value(node.strokeWidth)),
            radius: number(value(node.cornerRadius)),
            rotation: number(value(node.rotation)),
            opacity: Math.max(0, Math.min(1, number(value(node.opacity), 1))),
            geometry,
            viewBox: geometry ? pathViewBox(node, geometry) : undefined,
            fontFamily: typeof value(node.fontFamily) === "string" ? String(value(node.fontFamily)) : undefined,
            fontSize,
            lineHeight: number(value(node.lineHeight), 1.2),
            letterSpacing: number(value(node.letterSpacing)),
            polygonCount: Math.min(64, Math.max(3, Math.floor(number(value(node.polygonCount), 3)))),
            fontWeight: String(number(value(node.fontWeight), 400)),
            textAlign:
                node.textAlign === "center" || node.textAlign === "right" || node.textAlign === "justify"
                    ? node.textAlign
                    : "left",
        };
        const layer: OSCanvasObject = {
            id,
            kind: "pen-layer",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            pen,
            text: typeof text === "string" ? text : undefined,
            name: typeof node.name === "string" && node.name ? node.name : type,
        };
        layers.push(layer);
        const element = document.createElement("div");
        element.dataset.penLayerId = id;
        const style = element.style;
        const layout = type === "frame" && node.layout !== "none";
        const horizontal = node.layout !== "vertical";
        style.cssText = "position:relative;box-sizing:border-box;flex-shrink:0;min-width:0;min-height:0";
        const dimension = (key: "width" | "height") => {
            const size = value(node[key]);
            if (typeof size === "string" && size.startsWith("fill_container")) {
                style[key] = "100%";
                element.dataset[key] = "fill";
                return;
            }
            const fixed = number(size, NaN);
            if (Number.isFinite(fixed)) style[key] = `${Math.max(0, fixed)}px`;
            else if (type === "group" || layout || type === "text") style[key] = "max-content";
            else style[key] = "100px";
        };
        dimension("width");
        dimension("height");
        if (type === "text" || type === "note") {
            style.fontFamily = pen.fontFamily ?? "sans-serif";
            style.fontSize = `${fontSize}px`;
            style.fontWeight = pen.fontWeight;
            style.lineHeight = String(pen.lineHeight);
            style.letterSpacing = `${pen.letterSpacing}px`;
            style.whiteSpace = node.textGrowth === "auto" || node.textGrowth == null ? "pre" : "pre-wrap";
            element.textContent = layer.text ?? "";
        }
        if (layout) {
            style.display = "flex";
            style.flexDirection = horizontal ? "row" : "column";
            style.gap = `${Math.max(0, number(value(node.gap)))}px`;
            style.padding = (Array.isArray(node.padding) ? node.padding : [node.padding])
                .slice(0, 4)
                .map((size) => `${Math.max(0, number(value(size)))}px`)
                .join(" ");
            const alignment = (entry: unknown) => (typeof entry === "string" ? entry.replaceAll("_", "-") : "start");
            style.justifyContent = alignment(node.justifyContent);
            style.alignItems = alignment(node.alignItems);
        }
        for (const child of Array.isArray(node.children) ? node.children : []) {
            const childElement = read(child, id, depth + 1);
            if (!childElement) continue;
            if (!layout || record(child).layoutPosition === "absolute") place(childElement, record(child));
            else if (childElement.dataset[horizontal ? "width" : "height"] === "fill") {
                childElement.style.flex = "1 1 0px";
                childElement.style[horizontal ? "width" : "height"] = "0px";
            }
            element.append(childElement);
        }
        return element;
    }

    function place(element: HTMLDivElement, node: PenNode) {
        element.style.position = "absolute";
        element.style.left = `${number(value(node.x))}px`;
        element.style.top = `${number(value(node.y))}px`;
    }

    const staging = document.createElement("div");
    staging.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none";
    for (const node of root.children) {
        const element = read(node);
        if (!element) continue;
        place(element, record(node));
        staging.append(element);
    }
    document.body.append(staging);
    try {
        const origin = staging.getBoundingClientRect();
        const nodes = staging.querySelectorAll<HTMLElement>("[data-pen-layer-id]");
        layers.forEach((layer, index) => {
            const rect = nodes[index].getBoundingClientRect();
            layer.x = rect.x - origin.x;
            layer.y = rect.y - origin.y;
            layer.width = Math.max(1, rect.width);
            layer.height = Math.max(1, rect.height);
        });
        const byId = new Map(layers.map((layer) => [layer.id, layer]));
        for (const layer of layers.toReversed()) {
            const parent = byId.get(layer.pen.parentId);
            if (parent?.pen.type !== "group") continue;
            const right = Math.max(parent.x + parent.width, layer.x + layer.width);
            const bottom = Math.max(parent.y + parent.height, layer.y + layer.height);
            parent.x = Math.min(parent.x, layer.x);
            parent.y = Math.min(parent.y, layer.y);
            parent.width = right - parent.x;
            parent.height = bottom - parent.y;
        }
        return { layers, skipped };
    } finally {
        staging.remove();
    }
}

export const PenDrawingTools = ["frame", "rectangle", "ellipse", "text", "note", "path"] as const;
export type PenDrawingTool = (typeof PenDrawingTools)[number];

export function readPenLayerPatch(
    input: string,
    creating: boolean
): { type?: PenDrawingTool; patch: Partial<OSCanvasObject>; fill?: string; geometry?: string } {
    const raw: unknown = JSON.parse(input);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Supply design layer properties.");
    const data = record(raw);
    const patch: Partial<OSCanvasObject> = {};
    for (const key of ["x", "y", "width", "height"] as const) {
        if (data[key] == null) continue;
        const entry = data[key];
        if (
            typeof entry !== "number" ||
            !Number.isFinite(entry) ||
            Math.abs(entry) > 100000 ||
            ((key === "width" || key === "height") && entry < 1)
        ) {
            throw new Error("Design layer geometry must be finite with positive dimensions.");
        }
        patch[key] = entry;
    }
    for (const key of ["name", "text", "fill", "geometry"] as const) {
        if (data[key] != null && (typeof data[key] !== "string" || data[key].length > 12000))
            throw new Error("Design text and path data must be at most 12,000 characters.");
    }
    if (creating && !PenDrawingTools.includes(data.type as PenDrawingTool))
        throw new Error("Choose a supported layer type.");
    if (data.fill != null && !color(data.fill)) throw new Error("Fill must be a hex color.");
    if (typeof data.name === "string" && data.name.trim()) patch.name = data.name.trim();
    if (typeof data.text === "string") patch.text = data.text;
    return { type: data.type as PenDrawingTool, patch, fill: color(data.fill), geometry: data.geometry as string };
}
