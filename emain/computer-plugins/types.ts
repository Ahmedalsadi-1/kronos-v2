// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { LinuxDesktop, LinuxDesktopAction, LinuxDesktopActionResult } from "../../frontend/types/linux-desktops";
import type { PrivateBrowserInput, PrivateBrowserResult } from "../guest-login";

export interface ComputerProviderRuntime {
    list(): Promise<LinuxDesktop[]>;
    perform(action: LinuxDesktopAction): Promise<LinuxDesktopActionResult>;
    performAgent(action: LinuxDesktopAction): Promise<LinuxDesktopActionResult>;
    assign(id: string, agentId: string, generation: number): Promise<LinuxDesktop>;
    takeover(id: string, expected?: { agentId: string; generation: number }): Promise<LinuxDesktop>;
    resume(id: string, generation: number): Promise<LinuxDesktop>;
    privateBrowser?(id: string, generation: number, input: PrivateBrowserInput): Promise<PrivateBrowserResult>;
}
