// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
(() => {
    if (localStorage.getItem("pencil-cookie-consent") == null)
        localStorage.setItem("pencil-cookie-consent", "declined");
    const workspace = new URLSearchParams(location.search).get("workspace") || "default";
    const storageKey = `kronos.pen.document.${workspace}`;
    const fileURI = `file:///kronos/${encodeURIComponent(workspace)}/untitled.pen`;
    const frame = document.getElementById("pen-editor");
    const origin = location.protocol === "file:" ? "null" : location.origin;
    const targetOrigin = origin === "null" ? "*" : origin;
    const pending = new Map();
    let port;
    let serial = 0;
    let appearance = {};
    let latestContent;
    let persistenceError;
    let theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const applyAppearance = () => {
        const root = frame.contentDocument?.documentElement;
        if (!root) return;
        if (appearance.background) root.style.setProperty("--canvas-bg", appearance.background);
        if (appearance.accent) root.style.setProperty("--primary", appearance.accent);
        let motion = frame.contentDocument.getElementById("kronos-motion-preference");
        if (!motion) {
            motion = frame.contentDocument.createElement("style");
            motion.id = "kronos-motion-preference";
            frame.contentDocument.head.append(motion);
        }
        const reduced = appearance.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
        motion.textContent = reduced
            ? "*,*::before,*::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}"
            : "";
    };
    const emit = (message) => parent.postMessage({ source: "kronos-pen", ...message }, targetOrigin);
    const request = (method, payload) =>
        new Promise((resolve, reject) => {
            if (!port) return reject(new Error("The Pen editor is still starting"));
            const id = `kronos-${++serial}`;
            const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`Pen ${method} timed out`));
            }, 60000);
            pending.set(id, { resolve, reject, timeout });
            port.postMessage({ kind: "request", id, method, payload });
        });
    const flushSave = async () => {
        // Pen batches dirty notifications for 100ms; flush after the current edit reaches its storage host.
        await new Promise((resolve) => setTimeout(resolve, 130));
        const status = await request("save");
        if (status !== 0 && status !== 1) throw new Error(`Pen could not save this document (status ${status})`);
        return { success: true };
    };
    const database = new Promise((resolve, reject) => {
        const opening = indexedDB.open("kronos-pen-assets", 2);
        opening.onupgradeneeded = () => {
            for (const name of ["assets", "documents"]) {
                if (!opening.result.objectStoreNames.contains(name)) opening.result.createObjectStore(name);
            }
        };
        opening.onsuccess = () => {
            opening.result.onversionchange = () => opening.result.close();
            resolve(opening.result);
        };
        opening.onerror = () => reject(opening.error);
    });
    const asset = async (path, value, write = false, storeName = "assets") => {
        const db = await database;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, write ? "readwrite" : "readonly");
            const store = transaction.objectStore(storeName);
            const operation = write ? store.put(value, `${workspace}:${path}`) : store.get(`${workspace}:${path}`);
            transaction.oncomplete = () => resolve(operation.result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error("Design storage transaction aborted"));
        });
    };
    const exportAssets = async () => {
        const db = await database;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction("assets", "readonly");
            const store = transaction.objectStore("assets");
            const keys = store.getAllKeys();
            const values = store.getAll();
            transaction.oncomplete = () => {
                const prefix = `${workspace}:kronos/${workspace}/`;
                resolve(
                    keys.result.flatMap((key, index) => {
                        if (typeof key !== "string" || !key.startsWith(prefix)) return [];
                        const path = key.slice(prefix.length);
                        if (
                            !path ||
                            path.startsWith("/") ||
                            path.split("/").some((part) => part === ".." || part === ".")
                        )
                            return [];
                        return [{ path, data: values.result[index] }];
                    })
                );
            };
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error("Design asset export aborted"));
        });
    };
    const skillNames = [
        "SKILL",
        "execute",
        "pen-schema",
        "generate",
        "scripts-and-shaders",
        "whiteboard",
        "code-website",
        "competitive-research",
        "recruiting-profiles",
        "sitemap",
        "travel-plan",
        "guide/design-system",
        "guide/components",
        "guide/landing-page",
        "guide/web-app",
        "guide/code",
        "guide/add-stacked-animations",
        "guide/make-website-responsive",
        "guide/tailwind",
        "guide/mobile-app",
        "guide/slides",
        "guide/whiteboard-example",
        "guide/table",
    ];
    const readSkill = async (name = "SKILL") => {
        if (name === "index") return skillNames;
        if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").includes("..") || name.startsWith("/"))
            throw new Error("Invalid skill path");
        const response = await fetch(`../skills/${name.endsWith(".md") ? name : `${name}.md`}`);
        if (!response.ok) throw new Error(`Pen skill not available: ${name}`);
        return response.text();
    };
    const handleStorage = async (method, payload) => {
        switch (method) {
            case "storage-load":
                latestContent =
                    (await asset("document", undefined, false, "documents")) ??
                    localStorage.getItem(storageKey) ??
                    JSON.stringify({ version: "2.22", children: [] });
                return {
                    filePath: `kronos/${workspace}/untitled.pen`,
                    content: latestContent,
                };
            case "storage-write": {
                if (payload.fileURI !== fileURI || typeof payload.content !== "string")
                    throw new Error("Invalid document write");
                latestContent = payload.content;
                await asset("document", payload.content, true, "documents");
                persistenceError = undefined;
                emit({ type: "saved", savedAt: Date.now() });
                return 0;
            }
            case "storage-read-asset":
                return asset(payload.path);
            case "storage-write-asset":
                await asset(payload.path, payload.data, true);
                return;
            case "storage-has-asset":
                return (await asset(payload.path)) != null;
            case "documents-save-preview":
                return;
            default:
                throw new Error(`Unsupported embed storage request: ${method}`);
        }
    };
    window.addEventListener("message", async (event) => {
        if (event.origin !== origin) return;
        if (event.source === frame.contentWindow && event.data?.type === "pen:ready") {
            const channel = new MessageChannel();
            port?.close();
            port = channel.port1;
            port.onmessage = async ({ data }) => {
                if (data.kind === "response") {
                    const item = pending.get(data.id);
                    if (!item) return;
                    pending.delete(data.id);
                    clearTimeout(item.timeout);
                    data.error ? item.reject(new Error(data.error.message)) : item.resolve(data.payload);
                } else if (data.kind === "ready") {
                    applyAppearance();
                    const sidebar = frame.contentDocument?.querySelector("[data-left-sidebar]");
                    if (sidebar && sidebar.getBoundingClientRect().right <= 8)
                        frame.contentDocument.querySelector('button[aria-label="Sidebar"]')?.click();
                    emit({ type: "ready", workspace, engine: "pen-web-embed" });
                } else if (data.kind === "notification") {
                    emit({ type: "changed", method: data.method, payload: data.payload });
                } else if (data.kind === "request") {
                    try {
                        const payload = await handleStorage(data.method, data.payload);
                        port.postMessage({ kind: "response", id: data.id, payload });
                    } catch (error) {
                        port.postMessage({
                            kind: "response",
                            id: data.id,
                            error: { code: "STORAGE_ERROR", message: error.message },
                        });
                        persistenceError = error.message;
                        emit({
                            type: data.method === "storage-load" ? "error" : "storage-error",
                            error: error.message,
                        });
                    }
                }
            };
            frame.contentWindow.postMessage(
                {
                    type: "pen:connect",
                    fileURI,
                    theme,
                    clientName: "KronOS Agent",
                    embedder: { name: "KronOS", version: "0.14.3", analyticsConsent: "declined" },
                    capabilities: [],
                },
                targetOrigin,
                [channel.port2]
            );
            return;
        }
        if (event.source !== parent || event.data?.source !== "kronos-pen-host") return;
        const { id, method, params = {} } = event.data;
        try {
            let result;
            switch (method) {
                case "get_app_state":
                    result = await request("mcp-tool-call", { name: "get_app_state", arguments: params });
                    break;
                case "execute":
                    result = await request("mcp-tool-call", {
                        name: "execute",
                        arguments: { ...params, input: params.input ?? params.code },
                    });
                    break;
                case "get_tools":
                    result = await request("get-mcp-schema");
                    break;
                case "read_skill":
                    result = await readSkill(params.name || params.path);
                    break;
                case "save":
                    result = await flushSave();
                    break;
                case "export":
                    try {
                        await flushSave();
                    } catch (error) {
                        if (latestContent == null) throw error;
                        persistenceError = error.message;
                    }
                    result = {
                        content: latestContent ?? JSON.stringify({ version: "2.22", children: [] }),
                        fileName: "untitled.pen",
                        warning: persistenceError,
                        assets: await exportAssets(),
                    };
                    break;
                case "undo":
                case "redo":
                case "fit": {
                    const keyboard =
                        method === "fit"
                            ? { key: "1", code: "Digit1", keyCode: 49, which: 49, shiftKey: true }
                            : {
                                  key: "z",
                                  code: "KeyZ",
                                  keyCode: 90,
                                  which: 90,
                                  metaKey: /Mac/.test(navigator.platform),
                                  ctrlKey: !/Mac/.test(navigator.platform),
                                  shiftKey: method === "redo",
                              };
                    frame.contentWindow.focus();
                    frame.contentDocument.dispatchEvent(
                        new KeyboardEvent("keydown", { ...keyboard, bubbles: true, cancelable: true })
                    );
                    frame.contentDocument.dispatchEvent(
                        new KeyboardEvent("keyup", { ...keyboard, bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 30));
                    result = { success: true };
                    break;
                }
                case "set_theme":
                    appearance = params;
                    applyAppearance();
                    theme = params.theme;
                    port?.postMessage({ kind: "notification", method: "color-theme-changed", payload: { theme } });
                    result = { success: true };
                    break;
                default:
                    throw new Error(`Unsupported Pen method: ${method}`);
            }
            emit({ id, result });
        } catch (error) {
            emit({ id, error: error.message });
        }
    });
})();
