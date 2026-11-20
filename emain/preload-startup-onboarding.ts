// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kronosSetup", {
    signIn: (provider: "google" | "github" | "email") => ipcRenderer.invoke("startup-onboarding:signin", provider),
});

window.addEventListener("hashchange", () => {
    if (window.location.hash !== "#finished") return;
    void ipcRenderer.invoke("startup-onboarding:complete").catch(() => {
        window.location.hash = "complete";
    });
});
