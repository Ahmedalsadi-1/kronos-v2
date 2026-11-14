// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    ChevronRight,
    Circle,
    Copy,
    Frame,
    Group,
    Layers,
    Maximize,
    PenTool,
    Search,
    Square,
    StickyNote,
    Trash2,
    Type,
} from "lucide-react";
import { useMemo, useState } from "react";
import "./os-pen-ui.css";
import type { OSCanvasObject } from "./os-workspace-model";

const LayerIcons = {
    frame: Frame,
    group: Group,
    rectangle: Square,
    ellipse: Circle,
    text: Type,
    note: StickyNote,
    path: PenTool,
};

export function penLayerTree(
    objects: OSCanvasObject[]
): Array<{ layer: OSCanvasObject; depth: number; children: boolean }> {
    const layers = objects.filter((object) => object.pen);
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    const children = new Map<string, OSCanvasObject[]>();
    const roots: OSCanvasObject[] = [];
    for (const layer of layers) {
        const parent = layer.pen.parentId;
        if (!parent || parent === layer.id || !byId.has(parent)) roots.push(layer);
        else children.set(parent, [...(children.get(parent) ?? []), layer]);
    }
    const result: ReturnType<typeof penLayerTree> = [];
    const visited = new Set<string>();
    const visit = (layer: OSCanvasObject, depth: number) => {
        if (visited.has(layer.id)) return;
        visited.add(layer.id);
        result.push({ layer, depth, children: !!children.get(layer.id)?.length });
        for (const child of children.get(layer.id) ?? []) visit(child, depth + 1);
    };
    for (const root of roots) visit(root, 0);
    // A damaged parent cycle must not make layers inaccessible.
    for (const layer of layers) if (!visited.has(layer.id)) visit(layer, 0);
    return result;
}

export function OSPenPanel({
    objects,
    selectedId,
    status,
    onSelect,
    onChange,
    onDelete,
    onDuplicate,
    onFit,
}: {
    objects: OSCanvasObject[];
    selectedId?: string;
    status: string;
    onSelect: (id: string) => void;
    onChange?: (id: string, patch: Partial<OSCanvasObject>) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onFit?: (id: string) => void;
}) {
    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState(new Set<string>());
    const [renaming, setRenaming] = useState<string>();
    const tree = useMemo(() => penLayerTree(objects), [objects]);
    const selected = tree.find(({ layer }) => layer.id === selectedId)?.layer;
    let hiddenDepth = Infinity;
    const visible = tree.filter(({ layer, depth }) => {
        if (query.trim()) return `${layer.name} ${layer.pen.type}`.toLowerCase().includes(query.trim().toLowerCase());
        if (depth > hiddenDepth) return false;
        hiddenDepth = collapsed.has(layer.id) ? depth : Infinity;
        return true;
    });
    const rename = (id: string, value: string) => {
        const name = value.trim();
        if (name) onChange?.(id, { name });
        setRenaming(undefined);
    };
    return (
        <div className="os-pen-layer-panel" onWheel={(event) => event.stopPropagation()}>
            <header className="os-pen-panel-heading">
                <div>
                    <Layers size={15} />
                    <h2>Layers</h2>
                    <span className="os-pen-layer-count">{tree.length}</span>
                </div>
            </header>
            <label className="os-pen-search">
                <Search size={14} />
                <input
                    aria-label="Find layers"
                    placeholder="Find a layer…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </label>
            {status && (
                <p role="status" className="os-pen-status">
                    {status}
                </p>
            )}
            <div role="group" aria-label="Design layers" className="os-pen-layer-list">
                {!tree.length && (
                    <div className="os-pen-empty">
                        <div className="os-pen-empty-icon">
                            <Frame size={24} />
                        </div>
                        <strong>Your canvas is ready</strong>
                        <p>Draw a frame, add a shape, or start with text.</p>
                    </div>
                )}
                {!!tree.length && !visible.length && <p className="os-pen-status">No matching layers.</p>}
                {visible.map(({ layer, depth, children }) => {
                    const Icon = LayerIcons[layer.pen.type as keyof typeof LayerIcons] ?? Square;
                    return (
                        <div
                            key={layer.id}
                            className="os-pen-layer-row"
                            data-selected={layer.id === selectedId}
                            style={{ paddingLeft: 4 + Math.min(depth, 8) * 14 }}
                        >
                            {children ? (
                                <button
                                    type="button"
                                    className="os-pen-disclosure"
                                    aria-label={`${collapsed.has(layer.id) ? "Expand" : "Collapse"} ${layer.name}`}
                                    aria-expanded={!collapsed.has(layer.id)}
                                    onClick={() =>
                                        setCollapsed((current) => {
                                            const next = new Set(current);
                                            if (next.has(layer.id)) next.delete(layer.id);
                                            else next.add(layer.id);
                                            return next;
                                        })
                                    }
                                >
                                    <ChevronRight size={12} />
                                </button>
                            ) : (
                                <span className="os-pen-disclosure-spacer" />
                            )}
                            {renaming === layer.id ? (
                                <input
                                    className="os-pen-layer-rename"
                                    aria-label="Layer name"
                                    autoFocus
                                    defaultValue={layer.name}
                                    onFocus={(event) => event.target.select()}
                                    onBlur={(event) => rename(layer.id, event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") setRenaming(undefined);
                                        event.stopPropagation();
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="os-pen-layer-select"
                                    aria-pressed={layer.id === selectedId}
                                    onClick={() => onSelect(layer.id)}
                                    onDoubleClick={() => onChange && setRenaming(layer.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "F2" && onChange) {
                                            event.preventDefault();
                                            setRenaming(layer.id);
                                        }
                                    }}
                                    title={layer.name}
                                >
                                    <Icon size={14} />
                                    <span>{layer.name ?? layer.pen.type}</span>
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {selected && (onFit || onDuplicate || onDelete) && (
                <footer className="os-pen-layer-actions">
                    <span>{selected.pen.type}</span>
                    <div>
                        {onFit && (
                            <button
                                type="button"
                                title="Zoom to selection"
                                aria-label="Zoom to selection"
                                onClick={() => onFit(selected.id)}
                            >
                                <Maximize size={15} />
                            </button>
                        )}
                        {onDuplicate && (
                            <button
                                type="button"
                                title="Duplicate layer"
                                aria-label="Duplicate layer"
                                onClick={() => onDuplicate(selected.id)}
                            >
                                <Copy size={15} />
                            </button>
                        )}
                        {onDelete && (
                            <button
                                type="button"
                                title="Delete layer"
                                aria-label="Delete layer"
                                onClick={() => onDelete(selected.id)}
                            >
                                <Trash2 size={15} />
                            </button>
                        )}
                    </div>
                </footer>
            )}
        </div>
    );
}
