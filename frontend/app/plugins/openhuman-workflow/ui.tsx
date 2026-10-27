// SPDX-License-Identifier: GPL-3.0-only
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
const Labels: Record<string, string> = {
    "flows.editor.undo": "Undo",
    "flows.editor.redo": "Redo",
    "flows.canvas.toolbar": "Canvas controls",
    "flows.canvas.zoomOut": "Zoom out",
    "flows.canvas.zoomIn": "Zoom in",
    "flows.canvas.fitView": "Fit canvas",
    "flows.canvas.openPanel": "Open step library",
    "flows.editor.validate": "Validate",
    "flows.editor.validating": "Validating…",
    "flows.editor.deleteNode": "Delete step",
};
export function useT() {
    return { t: (key: string, fallback?: string) => Labels[key] ?? fallback ?? key, locale: "en" };
}
export function describeNode(
    _kind: string,
    config: Record<string, unknown>,
    _ports: string[],
    _t: unknown,
    _locale: string
) {
    return String(config.instruction ?? "Configure this step to continue.");
}
export type BadgeVariant = "success" | "danger" | "neutral";
export function Badge({
    variant = "neutral",
    dot: _dot,
    className = "",
    ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; dot?: boolean }) {
    return <span {...props} className={`wf-badge wf-badge-${variant} ${className}`} />;
}
export function Button({
    variant = "secondary",
    size = "sm",
    iconOnly = false,
    tone,
    className = "",
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; iconOnly?: boolean; tone?: string }) {
    return (
        <button
            {...props}
            type={props.type ?? "button"}
            className={`wf-button wf-button-${variant} ${iconOnly ? "wf-icon-button" : ""} ${tone === "danger" ? "wf-danger" : ""} ${className}`}
        />
    );
}
