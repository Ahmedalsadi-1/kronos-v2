// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import type { ComputerInstanceConfig } from "../../frontend/types/linux-desktops";
import { runLinuxDesktopCommand } from "../linux-desktop/command-runner";
import { QemuLinuxDesktopRuntime } from "../linux-desktop/qemu-linux-runtime";
import { DATA_DIR } from "../linux-desktop/upstream/openmaus/kronterm-adapter";

export class QemuComputerPlugin extends QemuLinuxDesktopRuntime {
    constructor(config: ComputerInstanceConfig) {
        super(
            runLinuxDesktopCommand,
            process.platform,
            process.arch,
            config.id,
            join(DATA_DIR, config.slot === 0 ? "qemu" : `qemu-${config.slot}`),
            59622 + config.slot
        );
    }
}
