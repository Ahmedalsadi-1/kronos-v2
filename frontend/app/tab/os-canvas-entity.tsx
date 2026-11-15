// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import {
    FileText,
    FolderOpen,
    GitBranch,
    Link2,
    Maximize2,
    Minimize2,
    PackageOpen,
    X,
} from "@/app/components/system-ui/os-icons";
import { cn } from "@/util/util";
import React, { memo, useEffect, useRef, useState } from "react";
import { CanvasFolderPreview, OSCanvasFilePreview } from "./os-canvas-file-preview";
import { OSPenLayerArtwork, penLayerStyle } from "./os-pen-layer";
import type { OSCanvasObject } from "./os-workspace-model";

export const OSCanvasEntity = memo(
    ({
        object,
        localFile,
        selected,
        zIndex,
        zoom,
        getZoom,
        onSelect,
        onGroupDragStart,
        onMove,
        onResize,
        onDelete,
        onOpenResource,
        onOpenCanvasEntry,
        browseFolderOnClick,
        onTextChange,
    }: {
        object: OSCanvasObject;
        localFile?: File;
        selected: boolean;
        zIndex: number;
        onSelect: (id: string) => void;
        onGroupDragStart?: (event: React.PointerEvent<HTMLDivElement>) => void;
        zoom: number;
        getZoom?: () => number;
        onMove: (id: string, x: number, y: number) => void;
        onResize: (id: string, width: number, height: number, position?: { x: number; y: number }) => void;
        onDelete: (id: string) => void;
        onOpenResource: (object: OSCanvasObject) => void;
        browseFolderOnClick?: boolean;
        onOpenCanvasEntry?: (object: OSCanvasObject, path: string, name: string) => void;
        onTextChange?: (id: string, text: string) => void;
    }) => {
        const startRef = useRef<
            { pointerId: number; clientX: number; clientY: number; x: number; y: number } | undefined
        >(undefined);
        const resizeRef = useRef<
            | {
                  pointerId: number;
                  clientX: number;
                  clientY: number;
                  width: number;
                  height: number;
                  x: number;
                  y: number;
              }
            | undefined
        >(undefined);
        const [editing, setEditing] = useState(false);
        const [minimized, setMinimized] = useState(false);
        const [restoreSize, setRestoreSize] = useState<{ width: number; height: number }>();
        const [draft, setDraft] = useState(object.text ?? "");
        useEffect(() => {
            if (!editing) setDraft(object.text ?? "");
        }, [object.text, editing]);
        const release = (event: React.PointerEvent<HTMLElement>) => {
            if (startRef.current?.pointerId === event.pointerId) startRef.current = undefined;
            if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = undefined;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
        };
        const beginMove = (event: React.PointerEvent<HTMLElement>) => {
            const folder = event.currentTarget.matches(".canvas-folder-preview");
            if (
                event.button !== 0 ||
                event.isPrimary === false ||
                startRef.current ||
                resizeRef.current ||
                (!folder && (event.target as HTMLElement).closest("button, input, textarea"))
            )
                return;
            if (onGroupDragStart) {
                onGroupDragStart(event as React.PointerEvent<HTMLDivElement>);
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            (folder ? event.currentTarget : event.currentTarget.closest("article"))?.focus({ preventScroll: true });
            onSelect(object.id);
            startRef.current = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                x: object.x,
                y: object.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        };
        const move = (event: React.PointerEvent<HTMLElement>) => {
            if (
                startRef.current?.pointerId !== event.pointerId ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
            )
                return;
            const scale = getZoom?.() ?? zoom;
            onMove(
                object.id,
                startRef.current.x + (event.clientX - startRef.current.clientX) / scale,
                startRef.current.y + (event.clientY - startRef.current.clientY) / scale
            );
        };
        const folderDrag = {
            onPointerDown: beginMove,
            onPointerMove: move,
            onPointerUp: release,
            onPointerCancel: release,
            onLostPointerCapture: release,
        };
        if (object.kind === "connector") return null;
        const penText = object.pen?.type === "text" || object.pen?.type === "note";
        const editableText = object.kind === "note" || penText;
        const isResource = ["file", "folder", "repository", "url", "generated-artifact"].includes(object.kind);
        const previewPath =
            object.kind === "file" || object.kind === "generated-artifact" ? object.resource : undefined;
        const showFileControls = Boolean(previewPath && (selected || minimized) && !onGroupDragStart);
        const resizeCorners = previewPath ? (showFileControls && !minimized ? ["se", "ne", "sw", "nw"] : []) : ["se"];
        const resizeBy = (factor: number) =>
            onResize(
                object.id,
                Math.max(96, Math.round(object.width * factor)),
                Math.max(72, Math.round(object.height * factor))
            );
        const toggleExpanded = () => {
            if (minimized) {
                setMinimized(false);
                onSelect(object.id);
            } else if (restoreSize) {
                onResize(object.id, restoreSize.width, restoreSize.height);
                setRestoreSize(undefined);
            } else {
                setRestoreSize({ width: object.width, height: object.height });
                resizeBy(1.25);
            }
        };
        const openChild = (path: string, name: string, directory: boolean) => {
            if (!directory && onOpenCanvasEntry) {
                onOpenCanvasEntry(object, path, name);
                return;
            }
            onOpenResource({ ...object, kind: directory ? "folder" : "file", resource: path, text: name });
        };
        const ResourceIcon =
            object.kind === "repository"
                ? GitBranch
                : object.kind === "folder"
                  ? FolderOpen
                  : object.kind === "url"
                    ? Link2
                    : object.kind === "generated-artifact"
                      ? PackageOpen
                      : FileText;
        return (
            <article
                data-live-block-occluder={browseFolderOnClick ? "" : undefined}
                tabIndex={editableText && onTextChange ? 0 : -1}
                aria-label={object.name || (isResource ? object.text : undefined)}
                className={cn(
                    "os-canvas-object",
                    `is-${object.kind}`,
                    `color-${object.color ?? "amber"}`,
                    (previewPath || object.kind === "folder") && "has-file-preview",
                    showFileControls && "has-canvas-file-controls",
                    minimized && "is-canvas-file-minimized",
                    selected && "is-selected",
                    onGroupDragStart && "is-multi-selected"
                )}
                style={{
                    left: object.x,
                    top: object.y,
                    width: object.width,
                    height: minimized ? 0 : object.height,
                    zIndex,
                    ...penLayerStyle(object),
                }}
                onKeyDown={(event) => {
                    if (event.target === event.currentTarget && event.key === "Enter" && editableText) {
                        event.preventDefault();
                        if (onTextChange) setEditing(true);
                    }
                }}
                onPointerDownCapture={(event) => {
                    if (previewPath && event.button === 0 && (event.target as Element).closest(".canvas-text-editor")) {
                        onSelect(object.id);
                    }
                }}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    if (event.button !== 0 || event.isPrimary === false) return;
                    if (!(event.target as HTMLElement).closest("button, input, textarea, a, audio, video"))
                        event.currentTarget.focus({ preventScroll: true });
                    onSelect(object.id);
                }}
            >
                <div
                    className="os-canvas-object-handle"
                    onDoubleClick={(event) => {
                        if (penText && onTextChange) setEditing(true);
                        if (
                            event.currentTarget.parentElement?.querySelector(
                                ":scope > .os-canvas-file-preview.is-image"
                            )
                        ) {
                            onOpenResource(object);
                        }
                    }}
                    onPointerDown={beginMove}
                    onPointerMove={move}
                    onPointerUp={release}
                    onPointerCancel={release}
                    onLostPointerCapture={release}
                >
                    {!object.pen && (
                        <>
                            <span>
                                {object.kind === "note"
                                    ? "Note"
                                    : object.kind === "generated-artifact"
                                      ? "Artifact"
                                      : object.kind}
                            </span>
                            <button type="button" onClick={() => onDelete(object.id)} aria-label="Delete canvas object">
                                <X />
                            </button>
                        </>
                    )}
                </div>
                {object.pen && <OSPenLayerArtwork layer={object} />}
                {editableText &&
                    (editing ? (
                        <textarea
                            aria-label="Note text"
                            autoFocus
                            className="os-canvas-note-editor h-full w-full resize-none bg-transparent p-3 outline-none"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onPointerDown={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Escape") {
                                    setDraft(object.text ?? "");
                                    setEditing(false);
                                }
                            }}
                            onBlur={() => {
                                if (draft !== (object.text ?? "")) onTextChange?.(object.id, draft);
                                setEditing(false);
                            }}
                        />
                    ) : (
                        !object.pen && (
                            <p onDoubleClick={() => onTextChange && setEditing(true)}>{object.text || "New note"}</p>
                        )
                    ))}
                {object.kind === "folder" && (
                    <CanvasFolderPreview
                        browseOnClick={browseFolderOnClick}
                        drag={folderDrag}
                        onSelect={() => onSelect(object.id)}
                        name={object.text}
                        path={object.resource}
                        onOpen={() => onOpenResource(object)}
                        onOpenEntry={openChild}
                    />
                )}
                {previewPath && (
                    <OSCanvasFilePreview
                        key={previewPath}
                        path={previewPath}
                        objectId={object.id}
                        localFile={localFile}
                        browseFolderOnClick={browseFolderOnClick}
                        folderDrag={folderDrag}
                        onSelectFolder={() => onSelect(object.id)}
                        displayMode={onOpenCanvasEntry ? "canvas" : undefined}
                        onOpen={() => onOpenResource(object)}
                        onOpenEntry={openChild}
                        onOpenFolder={() => onOpenResource({ ...object, kind: "folder" })}
                    />
                )}
                {isResource && (
                    <button
                        type="button"
                        className="os-canvas-reference"
                        onClick={(event) => {
                            event.stopPropagation();
                            if (event.detail === 0) {
                                onOpenResource(object);
                                return;
                            }
                            onSelect(object.id);
                        }}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            onOpenResource(object);
                        }}
                        title={object.resource ? `Open ${object.resource}` : undefined}
                    >
                        <ResourceIcon aria-hidden="true" />
                        <span>
                            <strong>{object.text || previewPath?.split(/[\\/]/).pop() || object.kind}</strong>
                            <small>{object.resource}</small>
                        </span>
                    </button>
                )}
                {showFileControls && (
                    <div
                        className="os-canvas-file-toolbar"
                        role="group"
                        aria-label="Canvas file controls"
                        onPointerDown={beginMove}
                        onPointerMove={move}
                        onPointerUp={release}
                        onPointerCancel={release}
                        onLostPointerCapture={release}
                    >
                        <span>{object.text || previewPath.split(/[\\/]/).pop()}</span>
                        <div className="os-window-lights">
                            <button
                                type="button"
                                className="is-close"
                                aria-label="Close"
                                title="Close"
                                onClick={() => onDelete(object.id)}
                            >
                                <X />
                            </button>
                            <button
                                type="button"
                                className="is-minimize"
                                aria-label={minimized ? "Restore minimized file" : "Minimize"}
                                title={minimized ? "Restore minimized file" : "Minimize"}
                                onClick={() => setMinimized(!minimized)}
                            >
                                <Minimize2 />
                            </button>
                            <button
                                type="button"
                                className="is-zoom"
                                aria-label={minimized || restoreSize ? "Restore file" : "Expand"}
                                title={minimized || restoreSize ? "Restore file" : "Expand"}
                                onClick={toggleExpanded}
                            >
                                <Maximize2 />
                            </button>
                        </div>
                    </div>
                )}
                {resizeCorners.map((corner) => (
                    <button
                        key={corner}
                        type="button"
                        className="os-canvas-object-resize"
                        data-corner={corner}
                        aria-label={
                            corner === "se"
                                ? "Resize canvas object"
                                : `Resize from ${
                                      {
                                          ne: "top right",
                                          sw: "bottom left",
                                          nw: "top left",
                                      }[corner]
                                  }`
                        }
                        onPointerDown={(event) => {
                            if (
                                event.button !== 0 ||
                                event.isPrimary === false ||
                                startRef.current ||
                                resizeRef.current
                            )
                                return;
                            event.preventDefault();
                            event.stopPropagation();
                            onSelect(object.id);
                            resizeRef.current = {
                                pointerId: event.pointerId,
                                clientX: event.clientX,
                                clientY: event.clientY,
                                width: object.width,
                                height: object.height,
                                x: object.x,
                                y: object.y,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            const start = resizeRef.current;
                            if (
                                start?.pointerId !== event.pointerId ||
                                !event.currentTarget.hasPointerCapture(event.pointerId)
                            )
                                return;
                            const west = corner.endsWith("w");
                            const north = corner.startsWith("n");
                            const scale = getZoom?.() ?? zoom;
                            const dx = (event.clientX - start.clientX) / scale;
                            const dy = (event.clientY - start.clientY) / scale;
                            const width = Math.max(object.pen ? 1 : 96, start.width + (west ? -dx : dx));
                            const height = Math.max(object.pen ? 1 : 72, start.height + (north ? -dy : dy));
                            if (north || west) {
                                onResize(object.id, width, height, {
                                    x: west ? start.x + start.width - width : start.x,
                                    y: north ? start.y + start.height - height : start.y,
                                });
                            } else onResize(object.id, width, height);
                        }}
                        onPointerUp={release}
                        onPointerCancel={release}
                        onLostPointerCapture={release}
                    />
                ))}
            </article>
        );
    }
);
OSCanvasEntity.displayName = "OSCanvasEntity";
