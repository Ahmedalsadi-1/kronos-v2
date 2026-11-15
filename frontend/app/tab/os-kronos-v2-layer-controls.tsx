// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Maximize2, Minimize2, SquarePlus, X } from "lucide-react";
import type { PenLiveWidget } from "./os-pen-widgets";

export function KronOSV2LayerControls({
    widgets,
    selectedBlockId,
    focusedBlockId,
    onToggleVisibility,
    onToggleFocus,
    onClose,
}: {
    widgets: PenLiveWidget[];
    selectedBlockId?: string;
    focusedBlockId?: string;
    onToggleVisibility: (blockId: string, visible: boolean) => void;
    onToggleFocus: (blockId: string) => void;
    onClose: (blockId: string) => void;
}) {
    const controlledWidgets = widgets.filter((widget) => widget.blockId === selectedBlockId || !widget.visible);
    if (!controlledWidgets.length) return null;

    return (
        <div
            className="kronos-v2-layer-controls"
            role="group"
            aria-label="Widget window controls"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
        >
            <style>{`
                .kronos-v2-layer-controls { display: grid; gap: 2px; padding: 4px 8px; }
                .kronos-v2-layer-controls > div { display: flex; align-items: center; gap: 2px; padding: 0 4px 0 8px; }
                .kronos-v2-layer-controls span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
                .kronos-v2-layer-controls button { display: grid; place-items: center; width: 32px; height: 32px; flex: none; background: transparent; color: inherit; border: 0; border-radius: 6px; cursor: pointer; }
                .kronos-v2-layer-controls button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
                .kronos-v2-layer-controls button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
            `}</style>
            {controlledWidgets.map(({ blockId, title, visible }) => {
                const focused = focusedBlockId === blockId;
                const visibilityLabel = `${visible ? "Minimize" : "Restore"} ${title}`;
                const focusLabel = `${focused ? "Return to canvas from" : "Maximize"} ${title}`;
                return (
                    <div key={blockId}>
                        <span title={title}>{title}</span>
                        <button
                            type="button"
                            aria-label={visibilityLabel}
                            title={visibilityLabel}
                            onClick={() => onToggleVisibility(blockId, !visible)}
                        >
                            {visible ? <Minimize2 size={14} /> : <SquarePlus size={14} />}
                        </button>
                        <button
                            type="button"
                            aria-label={focusLabel}
                            title={focusLabel}
                            onClick={() => {
                                if (!visible) onToggleVisibility(blockId, true);
                                onToggleFocus(blockId);
                            }}
                        >
                            {focused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button
                            type="button"
                            aria-label={`Close ${title}`}
                            title={`Close ${title}`}
                            onClick={() => onClose(blockId)}
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
