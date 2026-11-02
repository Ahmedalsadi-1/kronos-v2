const { app, BrowserWindow, WebContentsView, ipcMain } = require("electron");
const path = require("node:path");
app.setPath("userData", path.resolve(__dirname, "../.runtime/electron"));
const guests = new Map();
app.setName("KronTerm Electron Prototype");
function isHttpUrl(value) {
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}
app.whenReady().then(async () => {
    const url = new URL(process.env.KRONTERM_PROTOTYPE_URL);
    const main = new BrowserWindow({
        width: 1440,
        height: 900,
        title: "KronTerm OS — Electron Prototype",
        webPreferences: {
            preload: path.join(__dirname, "electron-preload.cjs"),
            contextIsolation: true,
            sandbox: true,
        },
    });
    main.webContents.on("page-title-updated", (event) => event.preventDefault());
    main.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (!isMainFrame || isInPlace) return;
        for (const view of guests.values()) {
            main.contentView.removeChildView(view);
            view.webContents.close();
        }
        guests.clear();
    });
    main.webContents.on("will-navigate", (event, target) => {
        if (new URL(target).origin !== url.origin) event.preventDefault();
    });
    main.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    ipcMain.handle("prototype-browser", async (event, { id, action, url: target, bounds, script }) => {
        if (event.sender.id !== main.webContents.id || event.senderFrame !== main.webContents.mainFrame)
            throw new Error("Workspace required");
        if (!/^[a-z0-9-]{1,100}$/i.test(id)) throw new Error("Invalid guest identity");
        if (action === "create") {
            if (guests.has(id)) return;
            if (!isHttpUrl(target)) throw new Error("HTTP(S) required");
            const view = new WebContentsView({
                webPreferences: {
                    contextIsolation: true,
                    sandbox: true,
                    nodeIntegration: false,
                    partition: "prototype-browser",
                },
            });
            guests.set(id, view);
            main.contentView.addChildView(view);
            const notify = (type) =>
                main.webContents.send("prototype-browser-load", {
                    label: `browser-${id}`,
                    url: view.webContents.getURL(),
                    event: type,
                });
            view.webContents.on("did-start-loading", () => notify("Started"));
            view.webContents.on("did-finish-load", () => notify("Finished"));
            view.webContents.on("will-navigate", (e, next) => {
                if (!isHttpUrl(next)) e.preventDefault();
            });
            view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
            void view.webContents.loadURL(target).catch(() => {});
            return;
        }
        const view = guests.get(id);
        if (!view) throw new Error("Guest not found");
        if (action === "bounds") {
            if (!bounds.every(Number.isFinite)) throw new Error("Invalid bounds");
            view.setBounds({
                x: Math.round(bounds[0]),
                y: Math.round(bounds[1]),
                width: Math.round(bounds[2]),
                height: Math.round(bounds[3]),
            });
        } else if (action === "navigate") {
            if (!isHttpUrl(target)) throw new Error("HTTP(S) required");
            await view.webContents.loadURL(target);
        } else if (action === "eval") {
            await view.webContents.executeJavaScript(script);
        } else if (action === "hide") view.setVisible(false);
        else if (action === "show") view.setVisible(true);
        else if (action === "focus") view.webContents.focus();
        else if (action === "close") {
            main.contentView.removeChildView(view);
            view.webContents.close();
            guests.delete(id);
        } else throw new Error("Unsupported operation");
    });
    main.on("closed", () => {
        for (const view of guests.values()) view.webContents.close();
        guests.clear();
        app.quit();
    });
    await main.loadURL(url.href);
});
app.on("window-all-closed", () => app.quit());
