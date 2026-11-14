// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useSystemAppearance } from "@/app/components/system-ui";
import { systemMaterials } from "@/types/system-materials";
import type { CSSProperties } from "react";

export function readCoucouWorkbenchAppearance(systemDark: boolean, highContrast = false): CSSProperties {
    const palette = systemMaterials({
        colorScheme: systemDark ? "dark" : "light",
        contrast: highContrast ? "high" : "normal",
    });
    return {
        "--coucou-accent": "var(--kt-focus-ring, " + palette.focus + ")",
        "--coucou-surface": palette.content,
        "--coucou-card": palette.window,
        "--coucou-label": palette.label,
        "--coucou-secondary": palette.secondary,
        "--coucou-border": palette.separator,
    } as CSSProperties;
}

export function useCoucouWorkbenchAppearance(): CSSProperties {
    const system = useSystemAppearance();
    return readCoucouWorkbenchAppearance(system.colorScheme === "dark", system.contrast === "high");
}
