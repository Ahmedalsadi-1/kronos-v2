// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atoms, getApi } from "@/store/global";
import { useAtomValue } from "jotai";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const DefaultSystemAppearance: SystemAppearanceSnapshot = {
    colorScheme: "light",
    contrast: "normal",
    reducedTransparency: false,
    reducedMotion: false,
};

function readSystemAppearance(): SystemAppearanceSnapshot {
    try {
        return getApi().getSystemAppearance();
    } catch {
        if (typeof window === "undefined") {
            return DefaultSystemAppearance;
        }
        return {
            ...DefaultSystemAppearance,
            colorScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
            reducedTransparency: window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches ?? false,
            reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
        };
    }
}

const SystemAppearanceContext = createContext<SystemAppearanceSnapshot>(DefaultSystemAppearance);

function SystemUIProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
    const reducedMotion = useAtomValue(atoms.prefersReducedMotionAtom);
    const [nativeAppearance, setNativeAppearance] = useState(readSystemAppearance);
    const appearance = useMemo(
        () => ({ ...nativeAppearance, reducedMotion: nativeAppearance.reducedMotion || reducedMotion }),
        [nativeAppearance, reducedMotion]
    );

    useEffect(() => {
        try {
            return getApi().onSystemAppearanceChange(setNativeAppearance);
        } catch {
            return undefined;
        }
    }, []);

    return (
        <SystemAppearanceContext.Provider value={appearance}>
            <div
                className={enabled ? "kt-system-host kt-system-ui" : "kt-system-host"}
                data-color-scheme={appearance.colorScheme}
                data-contrast={appearance.contrast}
                data-reduced-motion={appearance.reducedMotion || undefined}
                data-reduced-transparency={appearance.reducedTransparency || undefined}
            >
                {children}
            </div>
        </SystemAppearanceContext.Provider>
    );
}

function useSystemAppearance(): SystemAppearanceSnapshot {
    return useContext(SystemAppearanceContext);
}

export { SystemAppearanceContext, DefaultSystemAppearance, readSystemAppearance, SystemUIProvider, useSystemAppearance };
