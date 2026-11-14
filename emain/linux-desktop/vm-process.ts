// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { app } from "electron";
import { createRequire } from "node:module";
import { join } from "node:path";

type VmProcess = { isManagedQemu(pid: number, drive: string): boolean };
let native: VmProcess;

export function isManagedQemu(pid: number, drive: string): boolean {
    if (!native) {
        const path = app.isPackaged
            ? join(process.resourcesPath, "native/vm-process.node")
            : join(app.getAppPath(), "dist/native/vm-process.node");
        native = createRequire(import.meta.url)(path);
    }
    return native.isManagedQemu(pid, drive);
}
