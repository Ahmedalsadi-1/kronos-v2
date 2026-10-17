// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AgentWidgetDesignSelection } from "@/app/view/agent-widget-bridge";
import { atom, type PrimitiveAtom } from "jotai";

export type BrowserAnnotationIntent = "fix" | "change" | "question" | "approve";
export type BrowserAnnotationPriority = "blocking" | "important" | "suggestion";

export interface BrowserAnnotation {
    id: string;
    blockId: string;
    url: string;
    comment: string;
    intent: BrowserAnnotationIntent;
    priority: BrowserAnnotationPriority;
    createdAt: number;
    elementLabel: string;
    selector?: string;
    payload?: import("../../../types/browser-grab").BrowserGrabPayload;
}

const annotationAtoms = new Map<string, PrimitiveAtom<BrowserAnnotation[]>>();
export function getBrowserAnnotationsAtom(blockId: string): PrimitiveAtom<BrowserAnnotation[]> {
    let value = annotationAtoms.get(blockId);
    if (!value) {
        let saved: BrowserAnnotation[] = [];
        try {
            const raw = JSON.parse(localStorage.getItem(`kronterm.browser.annotations.${blockId}`) ?? "[]");
            if (Array.isArray(raw))
                saved = raw
                    .filter(
                        (row) =>
                            row?.blockId === blockId && typeof row.comment === "string" && typeof row.url === "string"
                    )
                    .slice(-100);
        } catch {
            /* Storage may be unavailable in previews. */
        }
        value = atom(saved);
        annotationAtoms.set(blockId, value);
    }
    return value;
}

export const BrowserAnnotationCommentMaxLength = 2_000;
export const BrowserAnnotationsMaxPerPage = 20;

export function elementLabelForSelection(selection: AgentWidgetDesignSelection): string {
    const element = selection.element;
    const base = element.name?.trim() || element.value?.trim() || "";
    const tag = element.tagName?.trim() || element.role?.trim() || "element";
    const label = base ? `${tag} "${base.slice(0, 60)}"` : tag;
    const component = element.componentName?.trim();
    return component ? `${component} ${label}` : label;
}

export function makeBrowserAnnotation(
    selection: AgentWidgetDesignSelection,
    comment: string,
    intent: BrowserAnnotationIntent,
    priority: BrowserAnnotationPriority = "suggestion"
): BrowserAnnotation {
    return {
        id: `${selection.blockId}:${selection.element.ref}:${Date.now()}`,
        blockId: selection.blockId,
        url: selection.url,
        comment: comment.trim().slice(0, BrowserAnnotationCommentMaxLength),
        intent,
        priority,
        createdAt: Date.now(),
        elementLabel: elementLabelForSelection(selection),
        ...(selection.element.selector ? { selector: selection.element.selector } : {}),
        ...(selection.grabPayload ? { payload: { ...selection.grabPayload, screenshot: null } } : {}),
    };
}

export function formatAnnotationPrompt(annotation: BrowserAnnotation): string {
    const lines = [`[${annotation.intent}] ${annotation.elementLabel}`];
    if (annotation.selector) {
        lines.push(`  selector: ${annotation.selector}`);
    }
    lines.push(`  page: ${annotation.url}`);
    if (annotation.comment) {
        lines.push(`  comment: ${annotation.comment}`);
    }
    if (annotation.payload) lines.push(`  context: ${JSON.stringify(annotation.payload)}`);
    return lines.join("\n");
}

export function formatAnnotationsBundle(url: string, annotations: BrowserAnnotation[]): string {
    const header = `Browser annotations for ${url} (${annotations.length})`;
    return [header, ...annotations.map(formatAnnotationPrompt)].join("\n\n");
}

export function displayWebviewUrl(url: string, focused: boolean): string {
    if (focused || url == null || url === "") {
        return url;
    }
    return url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "").replace(/\/$/, "");
}
