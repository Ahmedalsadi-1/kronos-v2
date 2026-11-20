const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("liveBrowser", {
    command: (command, input) => ipcRenderer.invoke("live-browser:command", command, input),
    subscribe: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("live-browser:event", listener);
        return () => ipcRenderer.removeListener("live-browser:event", listener);
    },
});
