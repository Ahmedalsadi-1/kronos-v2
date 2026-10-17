// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atoms } from "@/app/store/global-atoms";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

export function useReducedAgentMotion(): boolean {
    const config = useAtomValue(atoms.fullConfigAtom);
    const [systemReduced, setSystemReduced] = useState(
        () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
    useEffect(() => {
        const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!preference) return;
        const update = () => setSystemReduced(preference.matches);
        update();
        preference.addEventListener("change", update);
        return () => preference.removeEventListener("change", update);
    }, []);
    return config?.settings?.["window:reducedmotion"] === true || systemReduced;
}
