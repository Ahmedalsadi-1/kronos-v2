// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, useSystemAppearance } from "@/app/components/system-ui";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PickerEvents = new EventTarget();

export function WorkflowNodePickerPopup({
    open,
    label,
    title,
    actions,
    compact = false,
    onClose,
    onEscape = onClose,
    children,
}: {
    open: boolean;
    label: string;
    title: string;
    actions?: ReactNode;
    compact?: boolean;
    onClose(): void;
    onEscape?(): void;
    children: ReactNode;
}) {
    const popup = useRef<HTMLElement>(null);
    const appearance = useSystemAppearance();
    const closeButton = useRef<HTMLButtonElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useLayoutEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        const section = popup.current;
        PickerEvents.dispatchEvent(new Event("open"));
        const closeWhenAnotherOpens = () => close.current();
        PickerEvents.addEventListener("open", closeWhenAnotherOpens);
        closeButton.current?.focus();
        return () => {
            PickerEvents.removeEventListener("open", closeWhenAnotherOpens);
            const focused = document.activeElement;
            if (
                (focused === document.body || section?.contains(focused)) &&
                previous instanceof HTMLElement &&
                previous.isConnected
            ) {
                previous.focus();
            }
        };
    }, [open]);
    return createPortal(
        <section
            ref={popup}
            role="dialog"
            aria-label={label}
            hidden={!open}
            className={`kt-system-ui os-canvas-focus-frame os-workspace-picker${compact ? " is-compact" : ""}`}
            data-color-scheme={appearance.colorScheme}
            data-contrast={appearance.contrast}
            data-live-block-occluder=""
            data-workflow-panel=""
            onKeyDown={(event) => {
                if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.stopPropagation();
                onEscape();
            }}
        >
            <header className="os-canvas-tools-heading">
                <span className="mr-auto font-medium">{title}</span>
                {actions}
                <SystemButton ref={closeButton} size="small" aria-label="Close" onClick={onClose}>
                    <X />
                </SystemButton>
            </header>
            <div className="os-workspace-picker-content">{children}</div>
        </section>,
        document.body
    );
}
