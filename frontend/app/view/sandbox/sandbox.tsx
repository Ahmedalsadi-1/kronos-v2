// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { ManagedComputerWidget } from "@/app/view/linux-vms/managed-computer-widget";

export function SandboxView() {
    return <ManagedComputerWidget />;
}

export function SandboxDesktopPane(_props: { sessionId: string }) {
    return <ManagedComputerWidget />;
}
