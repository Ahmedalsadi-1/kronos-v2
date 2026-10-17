// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { QemuLinuxDesktopRuntime } from "./linux-desktop/qemu-linux-runtime";

export class LinuxDesktopFleetRuntime extends QemuLinuxDesktopRuntime {}

let instance: LinuxDesktopFleetRuntime;
export function getLinuxDesktopsRuntime(): LinuxDesktopFleetRuntime {
    return (instance ??= new LinuxDesktopFleetRuntime());
}
