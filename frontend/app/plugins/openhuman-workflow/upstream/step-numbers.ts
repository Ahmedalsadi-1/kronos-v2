// SPDX-License-Identifier: GPL-3.0-only
// Extracted and adapted from tinyhumansai/openhuman; see ../NOTICE.md.

import { createContext, useContext } from "react";

export const StepNumberContext = createContext<ReadonlyMap<string, number> | null>(null);

export function useStepNumber(nodeId: string): number | undefined {
    return useContext(StepNumberContext)?.get(nodeId);
}
