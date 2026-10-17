// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useWaveEnv } from "@/app/waveenv/waveenv";
import { shouldIncludeWidgetForWorkspace } from "@/app/workspace/widgetfilter";
import type { WidgetsEnv } from "@/app/workspace/widgets";
import { makeIconClass } from "@/util/util";
import {
    autoUpdate,
    flip,
    FloatingPortal,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
} from "@floating-ui/react";
import { useAtomValue } from "jotai";
import { memo, useEffect, useMemo, useRef, useState } from "react";

interface WidgetPickerPopoverProps {
    anchorElement: HTMLElement;
    open: boolean;
    onClose: () => void;
}

const WidgetPickerPopover = memo(({ anchorElement, open, onClose }: WidgetPickerPopoverProps) => {
    const env = useWaveEnv<WidgetsEnv>();
    const fullConfig = useAtomValue(env.atoms.fullConfigAtom);
    const workspaceId = useAtomValue(env.atoms.workspaceId);
    const searchRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const widgets = useMemo(() => {
        const widgetsMap = fullConfig?.widgets ?? {};
        return Object.entries(widgetsMap)
            .filter(([, widget]) => {
                if (widget["display:hidden"]) {
                    return false;
                }
                return shouldIncludeWidgetForWorkspace(widget, workspaceId);
            })
            .map(([key, widget]) => ({ key, widget }))
            .sort((a, b) => (a.widget["display:order"] ?? 0) - (b.widget["display:order"] ?? 0));
    }, [fullConfig?.widgets, workspaceId]);
    const visibleWidgets = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return widgets;
        }
        return widgets.filter(({ key, widget }) => {
            const label = String(widget.label ?? "Widget");
            const description = String(widget.description ?? "");
            return `${key} ${label} ${description}`.toLowerCase().includes(normalizedQuery);
        });
    }, [query, widgets]);
    const { refs, floatingStyles, context } = useFloating({
        open,
        onOpenChange: (nextOpen) => {
            if (!nextOpen) {
                onClose();
            }
        },
        placement: "bottom-start",
        middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
        elements: {
            reference: anchorElement,
        },
    });
    const dismiss = useDismiss(context);
    const { getFloatingProps } = useInteractions([dismiss]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            return;
        }
        const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [open]);

    if (!open) {
        return null;
    }

    return (
        <FloatingPortal>
            <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="widget-picker-popover"
                role="menu"
                aria-label="Add a widget"
                {...getFloatingProps()}
            >
                <div className="widget-picker-popover-header">
                    <span>Add widget</span>
                    <span>
                        {visibleWidgets.length === widgets.length
                            ? `${widgets.length} types`
                            : `${visibleWidgets.length} matches`}
                    </span>
                </div>
                <label className="widget-picker-popover-search">
                    <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search widgets"
                        aria-label="Search widgets"
                    />
                    {query && <kbd>Esc</kbd>}
                </label>
                {widgets.length === 0 ? (
                    <div className="widget-picker-popover-empty">No widgets are available for this workspace.</div>
                ) : visibleWidgets.length === 0 ? (
                    <div className="widget-picker-popover-empty">No matching widgets.</div>
                ) : (
                    <div className="widget-picker-popover-grid">
                        {visibleWidgets.map(({ key, widget }) => {
                            const label = String(widget.label ?? "Widget");
                            return (
                                <button
                                    type="button"
                                    key={key}
                                    className="widget-picker-popover-item"
                                    role="menuitem"
                                    onClick={() => {
                                        void env.createBlock(widget.blockdef, widget.magnified);
                                        onClose();
                                    }}
                                    title={widget.description || label}
                                >
                                    <span className="widget-picker-popover-icon" style={{ color: widget.color }}>
                                        <i className={makeIconClass(widget.icon, true, { defaultIcon: "browser" })} />
                                    </span>
                                    <span>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </FloatingPortal>
    );
});
WidgetPickerPopover.displayName = "WidgetPickerPopover";

export { WidgetPickerPopover };
