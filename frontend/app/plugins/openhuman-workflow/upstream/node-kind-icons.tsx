// SPDX-License-Identifier: GPL-3.0-only
// Extracted and adapted from tinyhumansai/openhuman; see ../NOTICE.md.

import type { LucideIcon as IconType } from "lucide-react";
import {
    Binary as LuBinary,
    Bot as LuBot,
    Braces as LuBraces,
    Brain as LuBrain,
    Code as LuCode,
    Filter as LuFilter,
    GitBranch as LuGitBranch,
    GitFork as LuGitFork,
    GitMerge as LuGitMerge,
    Globe as LuGlobe,
    Layers as LuLayers,
    Repeat as LuRepeat,
    Split as LuSplit,
    Wand as LuWand,
    Wrench as LuWrench,
    Zap as LuZap,
} from "lucide-react";
import { createElement } from "react";

import type { NodeKind } from "./types";

export const NODE_KIND_ICON: Record<NodeKind, IconType> = {
    trigger: LuZap,
    agent: LuBot,
    tool_call: LuWrench,
    http_request: LuGlobe,
    code: LuCode,
    condition: LuGitBranch,
    switch: LuGitFork,
    merge: LuGitMerge,
    split_out: LuSplit,
    transform: LuWand,
    output_parser: LuBraces,
    sub_workflow: LuLayers,
    memory: LuBrain,
    dedup: LuFilter,
    loop: LuRepeat,
};

export function nodeKindIcon(kind: NodeKind | string): IconType {
    return NODE_KIND_ICON[kind as NodeKind] ?? LuBinary;
}

export function NodeKindGlyph({
    kind,
    icon,
    className,
}: {
    kind: NodeKind | string;
    icon?: IconType;
    className?: string;
}) {
    return createElement(icon ?? nodeKindIcon(kind), { className, "aria-hidden": true });
}

export const NODE_KIND_TILE: Record<NodeKind, string> = {
    trigger: "bg-linear-to-br from-amber-400 to-amber-600",
    agent: "bg-linear-to-br from-accent-lavender to-primary-600",
    memory: "bg-linear-to-br from-accent-lavender to-primary-700",
    tool_call: "bg-linear-to-br from-primary-400 to-primary-600",
    http_request: "bg-linear-to-br from-accent-sky to-primary-500",
    sub_workflow: "bg-linear-to-br from-primary-500 to-primary-700",
    condition: "bg-linear-to-br from-amber-400 to-coral-500",
    switch: "bg-linear-to-br from-amber-500 to-coral-600",
    merge: "bg-linear-to-br from-sage-400 to-sage-600",
    split_out: "bg-linear-to-br from-sage-500 to-sage-700",
    code: "bg-linear-to-br from-slate-500 to-slate-700",
    transform: "bg-linear-to-br from-accent-lavender to-accent-rose",
    output_parser: "bg-linear-to-br from-slate-400 to-slate-600",
    dedup: "bg-linear-to-br from-slate-500 to-slate-600",
    loop: "bg-linear-to-br from-sage-400 to-sage-700",
};

const UNKNOWN_KIND_TILE = "bg-linear-to-br from-stone-400 to-stone-600";

export function nodeKindTile(kind: NodeKind | string): string {
    return NODE_KIND_TILE[kind as NodeKind] ?? UNKNOWN_KIND_TILE;
}

const TILE_SIZES = {
    sm: { tile: "h-5 w-5 rounded-md", glyph: "h-3 w-3" },

    md: { tile: "h-8 w-8 rounded-lg", glyph: "h-[18px] w-[18px]" },
} as const;

export type NodeKindTileSize = keyof typeof TILE_SIZES;

export function NodeKindTile({
    kind,
    icon,
    size = "md",
    className = "",
    testId,
}: {
    kind: NodeKind | string;

    icon?: IconType;
    size?: NodeKindTileSize;

    className?: string;
    testId?: string;
}) {
    const { tile, glyph } = TILE_SIZES[size];
    return (
        <span
            aria-hidden="true"
            data-testid={testId}
            data-node-kind={kind}
            className={`wf-kind-tile flex shrink-0 items-center justify-center text-white shadow-xs ring-1 ring-inset ring-white/15 ${tile} ${nodeKindTile(kind)} ${className}`}
        >
            <NodeKindGlyph kind={kind} icon={icon} className={glyph} />
        </span>
    );
}
