// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { LinuxDesktop, LinuxDesktopAction, LinuxDesktopActionResult } from "../../frontend/types/linux-desktops";

export interface ComputerProviderRuntime {
    list(): Promise<LinuxDesktop[]>;
    perform(action: LinuxDesktopAction): Promise<LinuxDesktopActionResult>;
    performAgent(action: LinuxDesktopAction): Promise<LinuxDesktopActionResult>;
    assign(id: string, agentId: string, generation: number): Promise<LinuxDesktop>;
    takeover(id: string): Promise<LinuxDesktop>;
    resume(id: string, generation: number): Promise<LinuxDesktop>;
}
