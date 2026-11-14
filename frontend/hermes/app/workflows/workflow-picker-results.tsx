// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

export type WorkflowPickerResult = {
    id: string;
    label: string;
    detail?: string;
    icon?: ReactNode;
    onSelect(event: MouseEvent<HTMLButtonElement>): void;
};

export function WorkflowPickerResults({
    entries,
    overflow,
    previewCount = 1,
}: {
    entries: WorkflowPickerResult[];
    overflow: HTMLElement;
    previewCount?: number;
}) {
    const row = (entry: WorkflowPickerResult) => (
        <button
            key={entry.id}
            type="button"
            className="kronterm-catalog-row"
            data-kronterm-picker-result=""
            data-kronterm-picker-label={entry.label}
            onClick={entry.onSelect}
        >
            {entry.icon && <span className="kronterm-catalog-icon">{entry.icon}</span>}
            <span className="kronterm-catalog-label">
                <span>{entry.label}</span>
                {entry.detail && <small>{entry.detail}</small>}
            </span>
        </button>
    );

    return (
        <>
            {entries.slice(0, previewCount).map(row)}
            {createPortal(entries.slice(previewCount).map(row), overflow)}
        </>
    );
}
