import { app, BrowserWindow, webContents } from "electron";

export const backgroundLaunch = process.env.ORCA_BACKGROUND_LAUNCH === "1";

export function installBackgroundLaunchPolicy(): void {
    if (!backgroundLaunch) return;
    if (process.platform === "darwin") app.setActivationPolicy("prohibited");
    // Validation windows stay hidden even when recovery and HUD paths try to reveal them.
    for (const method of ["show", "showInactive", "focus", "moveTop", "restore"] as const) {
        BrowserWindow.prototype[method] = function () {};
    }
    app.focus = () => {};
    app.on("web-contents-created", (_event, contents) => {
        contents.openDevTools = () => {};
        contents.focus = () => {};
    });
    for (const contents of webContents.getAllWebContents()) {
        contents.openDevTools = () => {};
        contents.focus = () => {};
    }
}
