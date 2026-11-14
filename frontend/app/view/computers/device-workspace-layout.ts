// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { atom } from "jotai";

const MinimumWidth = 176;
const MaximumWidth = 340;
const HeaderHeight = 208;
const BorderWidth = 16;
const HandsetAspect = 0.46;

export const CompactDeviceBlocksAtom = atom<ReadonlySet<string>>(new Set<string>());

export const SingleDeviceWorkspaceWidth = `min(100%, clamp(${MinimumWidth}px, calc((100cqh - ${HeaderHeight}px) * ${HandsetAspect} + ${BorderWidth}px), ${MaximumWidth}px))`;

export function getSingleDeviceWorkspaceWidth(width: number, height: number): number {
    return Math.min(width, MaximumWidth, Math.max(MinimumWidth, (height - HeaderHeight) * HandsetAspect + BorderWidth));
}
