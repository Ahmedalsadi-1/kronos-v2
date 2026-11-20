// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from "electron";
import type { AccountCommand } from "../frontend/types/kronos-account";

contextBridge.exposeInMainWorld("kronosAccount", (command: AccountCommand) =>
    ipcRenderer.invoke("kronos-account", command)
);
