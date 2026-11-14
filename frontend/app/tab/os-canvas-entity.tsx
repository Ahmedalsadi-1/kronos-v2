// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { FileText, FolderOpen, GitBranch, Link2, PackageOpen, X } from "@/app/components/system-ui/os-icons";
import { cn } from "@/util/util";
import React, { memo, useEffect, useRef, useState } from "react";
import { OSCanvasFilePreview } from "./os-canvas-file-preview";
import { OSPenLayerArtwork, penLayerStyle } from "./os-pen-layer";
import type { OSCanvasObject } from "./os-workspace-model";

export const OSCanvasEntity = memo(
    ({
        object,
        localFile,
        selected,
        zIndex,
        zoom,
        onSelect,
        onMove,
        onResize,
        onDelete,
        onOpenResource,
        onTextChange,
    }: {
        object: OSCanvasObject;
        localFile?: File;
        selected: boolean;
        zIndex: number;
        onSelect: (id: string) => void;
        zoom: number;
        onMove: (id: string, x: number, y: number) => void;
        onResize: (id: string, width: number, height: number) => void;
        onDelete: (id: string) => void;
        onOpenResource: (object: OSCanvasObject) => void;
        onTextChange?: (id: string, text: string) => void;
    }) => {
        const startRef = useRef<
            { pointerId: number; clientX: number; clientY: number; x: number; y: number } | undefined
        >(undefined);
        const resizeRef = useRef<
            { pointerId: number; clientX: number; clientY: number; width: number; height: number } | undefined
        >(undefined);
        const [editing, setEditing] = useState(false);
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
        if (object.kind === "connector") return null;
        const penText = object.pen?.type === "text" || object.pen?.type === "note";
        const editableText = object.kind === "note" || penText;
        const isResource = ["file", "folder", "repository", "url", "generated-artifact"].includes(object.kind);
        const previewPath =
            object.kind === "file" || object.kind === "generated-artifact" ? object.resource : undefined;
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
                tabIndex={editableText && onTextChange ? 0 : -1}
                aria-label={object.name}
                className={cn(
                    "os-canvas-object",
                    `is-${object.kind}`,
                    `color-${object.color ?? "amber"}`,
                    previewPath && "has-file-preview",
                    selected && "is-selected"
                )}
                style={{
                    left: object.x,
                    top: object.y,
                    width: object.width,
                    height: object.height,
                    zIndex,
                    ...penLayerStyle(object),
                }}
                onKeyDown={(event) => {
                    if (event.target === event.currentTarget && event.key === "Enter" && editableText) {
                        event.preventDefault();
                        if (onTextChange) setEditing(true);
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
                    onDoubleClick={() => penText && onTextChange && setEditing(true)}
                    onPointerDown={(event) => {
                        if (
                            event.button !== 0 ||
                            event.isPrimary === false ||
                            startRef.current ||
                            resizeRef.current ||
                            (event.target as HTMLElement).closest("button, input, textarea")
                        )
                            return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.closest("article")?.focus({ preventScroll: true });
                        onSelect(object.id);
                        startRef.current = {
                            pointerId: event.pointerId,
                            clientX: event.clientX,
                            clientY: event.clientY,
                            x: object.x,
                            y: object.y,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (
                            startRef.current?.pointerId !== event.pointerId ||
                            !event.currentTarget.hasPointerCapture(event.pointerId)
                        )
                            return;
                        onMove(
                            object.id,
                            startRef.current.x + (event.clientX - startRef.current.clientX) / zoom,
                            startRef.current.y + (event.clientY - startRef.current.clientY) / zoom
                        );
                    }}
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
                {previewPath && (
                    <OSCanvasFilePreview
                        key={previewPath}
                        path={previewPath}
                        localFile={localFile}
                        onOpen={() => onOpenResource(object)}
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
                <button
                    type="button"
                    className="os-canvas-object-resize"
                    aria-label="Resize canvas object"
                    onPointerDown={(event) => {
                        if (event.button !== 0 || event.isPrimary === false || startRef.current || resizeRef.current)
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
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (
                            resizeRef.current?.pointerId !== event.pointerId ||
                            !event.currentTarget.hasPointerCapture(event.pointerId)
                        )
                            return;
                        onResize(
                            object.id,
                            Math.max(
                                object.pen ? 1 : 96,
                                resizeRef.current.width + (event.clientX - resizeRef.current.clientX) / zoom
                            ),
                            Math.max(
                                object.pen ? 1 : 72,
                                resizeRef.current.height + (event.clientY - resizeRef.current.clientY) / zoom
                            )
                        );
                    }}
                    onPointerUp={release}
                    onPointerCancel={release}
                    onLostPointerCapture={release}
                />
            </article>
        );
    }
);
OSCanvasEntity.displayName = "OSCanvasEntity";
