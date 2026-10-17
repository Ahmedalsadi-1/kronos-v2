// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function HermesHudOverlay({ children }: { children: ReactNode }) {
    return createPortal(
        <div data-hermes-overlay-layer="" style={{ position: "fixed", inset: 0, zIndex: 1100, pointerEvents: "none" }}>
            {children}
        </div>,
        document.body
    );
}
