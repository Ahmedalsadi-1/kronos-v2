// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import path from "node:path";
import { ComfyUiClient } from "./comfyui-client";
import { listNativeHudWebContents } from "./emain-hud";
import { getWaveDataDir } from "./emain-platform";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";

export function registerComfyUiIpc(): void {
    let client: ComfyUiClient;
    ipcMain.handle("comfyui-command", (event, request) => {
        const trusted =
            getWaveTabViewByWebContentsId(event.sender.id) != null ||
            listNativeHudWebContents().some((contents) => contents.id === event.sender.id);
        if (!trusted) throw new Error("Untrusted image studio caller");
        client ??= new ComfyUiClient(path.join(getWaveDataDir(), "images", "journal.json"));
        return client.execute(request);
    });
}
