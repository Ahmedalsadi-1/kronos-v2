// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { N8nWorkflows } from "./n8n-workflows";

export function WorkflowsView({ api: _api, active = true }: { api?: ElectronApi; active?: boolean } = {}) {
    return (
        <main className="h-full min-h-0 text-foreground" aria-label="Workflows">
            <N8nWorkflows active={active} />
        </main>
    );
}
