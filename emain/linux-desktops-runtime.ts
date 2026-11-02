// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { ComputerPluginRegistry } from "./computer-plugins/registry";

export class LinuxDesktopFleetRuntime extends ComputerPluginRegistry {}

let instance: LinuxDesktopFleetRuntime;
export function getLinuxDesktopsRuntime(): LinuxDesktopFleetRuntime {
    return (instance ??= new LinuxDesktopFleetRuntime());
}
