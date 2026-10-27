// SPDX-License-Identifier: GPL-3.0-only
// Extracted and adapted from tinyhumansai/openhuman; see ../NOTICE.md.

import { createContext, useContext } from "react";

export interface CanvasActions {
    deleteNode: (nodeId: string) => void;

    validate: () => void;

    validating: boolean;
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions | null {
    return useContext(CanvasActionsContext);
}
