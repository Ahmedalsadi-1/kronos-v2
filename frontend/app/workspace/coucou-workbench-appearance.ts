// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { onPersistenceEvent, storedString, storedStringRecord } from "@hermes/lib/storage";
import { coucouPalette } from "@hermes/themes/coucou-palettes";
import { useEffect, useState, type CSSProperties } from "react";

export function readCoucouWorkbenchAppearance(systemDark: boolean): CSSProperties {
    const profile = storedString("hermes-desktop-active-profile-v1") || "default";
    const skin =
        storedStringRecord("hermes-desktop-profile-themes-v1")[profile] ?? storedString("hermes-desktop-theme-v2");
    const mode =
        storedStringRecord("hermes-desktop-profile-modes-v1")[profile] ?? storedString("hermes-desktop-mode-v1");
    const dark = mode === "dark" || (mode !== "light" && systemDark);
    return {
        "--coucou-accent": (coucouPalette(skin) ?? coucouPalette("coucou")).accent,
        "--coucou-surface": dark ? "#000000" : "#f5f5f7",
        "--coucou-card": dark ? "#141416" : "#ffffff",
        "--coucou-label": dark ? "#f5f5f7" : "#18181b",
        "--coucou-secondary": dark ? "#a1a1aa" : "#52525b",
        "--coucou-border": dark ? "rgb(255 255 255 / 0.15)" : "rgb(0 0 0 / 0.15)",
    } as CSSProperties;
}

export function useCoucouWorkbenchAppearance(): CSSProperties {
    const [appearance, setAppearance] = useState(() =>
        readCoucouWorkbenchAppearance(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true)
    );
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-color-scheme: dark)");
        const update = () => setAppearance(readCoucouWorkbenchAppearance(media?.matches ?? true));
        const dispose = onPersistenceEvent((event) => {
            if (event.op !== "read" && event.key.startsWith("hermes-desktop-")) update();
        });
        window.addEventListener("storage", update);
        media?.addEventListener("change", update);
        update();
        return () => {
            dispose();
            window.removeEventListener("storage", update);
            media?.removeEventListener("change", update);
        };
    }, []);
    return appearance;
}
