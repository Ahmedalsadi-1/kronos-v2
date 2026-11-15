// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { N8nWorkspaceState } from "../../../types/n8n-workspace";

export type N8nRuntimeState = N8nWorkspaceState & { running?: boolean; occupiedGeneration?: number };

export function runN8nWorkspaceCommand<T>(operation: string, input: Record<string, unknown> = {}) {
    return window.hermesDesktop.api<T>({
        path: "/api/kronterm/n8n/command",
        method: "POST",
        body: { ...input, operation },
        timeoutMs: 100000,
    });
}
