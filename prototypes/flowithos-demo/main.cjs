const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const { registerLiveBrowser } = require("./live-browser.cjs");
const bindLiveBrowser = registerLiveBrowser();

app.setName("FlowithOS Local Demo");
app.setPath("userData", path.join(app.getPath("appData"), "FlowithOS Local Demo"));

function openWindow() {
    const localSession = session.fromPartition("persist:flowithos-demo");
    localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    localSession.setPermissionCheckHandler(() => false);
    localSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
        (_details, callback) => callback({ cancel: true }));
    const webSession = session.fromPartition("persist:flowithos-live-web");
    webSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    webSession.setPermissionCheckHandler(() => false);
    const window = new BrowserWindow({
        title: "FlowithOS Local Demo", width: 1440, height: 920, minWidth: 780, minHeight: 600,
        titleBarStyle: "hidden", trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: "#f5f6f8",
        webPreferences: { session: localSession, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    bindLiveBrowser(window, webSession);
    window.loadFile(path.join(__dirname, "dist", "index.html"));
}

app.whenReady().then(() => {
    openWindow();
    app.on("activate", () => {
        if (!BrowserWindow.getAllWindows().length) openWindow();
    });
});
app.on("window-all-closed", () => app.quit());
