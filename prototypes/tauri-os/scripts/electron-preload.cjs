const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("prototypeNative", {
    invoke: (command, input) => {
        if (command !== "browser") return Promise.reject(new Error("Unsupported command"));
        return ipcRenderer.invoke("prototype-browser", input);
    },
    onBrowserLoad: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("prototype-browser-load", listener);
        return () => ipcRenderer.removeListener("prototype-browser-load", listener);
    },
});
