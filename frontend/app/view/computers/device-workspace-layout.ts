// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { ComputerTarget } from "@/types/computer-targets";
import { atom } from "jotai";
import { createContext } from "react";

export const DeviceWorkspaceSelectionContext = createContext<(target: ComputerTarget | null) => void>(null);

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
