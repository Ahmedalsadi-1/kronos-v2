// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

if (!window.requestIdleCallback) {
    window.requestIdleCallback = (callback, options) =>
        window.setTimeout(
            () => {
                callback({ didTimeout: false, timeRemaining: () => 0 });
            },
            Math.min(options?.timeout ?? 50, 50)
        );
    window.cancelIdleCallback = (id) => window.clearTimeout(id);
}
const runtime = await fetch("/prototype/bootstrap").then((response) => response.json());
const issues = new Set<string>();
const report: Record<string, unknown> = { host: runtime.host, status: "booting", issues: [], checks: {} };
const native = (window as any).__TAURI__ ?? (window as any).prototypeNative;
const invoke = native?.core?.invoke ?? native?.invoke;
const persist = () => {
    report.issues = [...issues];
    void fetch("/prototype/report", { method: "POST", body: JSON.stringify(report) });
};
const originalError = console.error;
console.error = (...args: any[]) => {
    issues.add(
        args
            .map((value) => (value instanceof Error ? value.message : String(value)))
            .join(" ")
            .slice(0, 2000)
    );
    originalError(...args);
    persist();
};
function unsupported(name: string): never {
    issues.add(name);
    persist();
    throw new Error(`Tauri OS prototype has not ported ${name}`);
}
window.addEventListener("error", (event) => {
    issues.add(event.message);
    persist();
});
window.addEventListener("unhandledrejection", (event) => {
    issues.add(String(event.reason));
    persist();
});
const eventListeners = new Map<string, Set<(...args: any[]) => void>>();
function subscribe(name: string, callback: (...args: any[]) => void) {
    const listeners = eventListeners.get(name) ?? new Set();
    listeners.add(callback);
    eventListeners.set(name, listeners);
    return () => listeners.delete(callback);
}
const appearance = () => ({
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    contrast: matchMedia("(prefers-contrast: more)").matches ? "more" : "normal",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    reducedTransparency: matchMedia("(prefers-reduced-transparency: reduce)").matches,
});
persist();
let initCallback: (value: unknown) => void;
const api: Record<string, any> = {
    getAuthKey: () => "",
    getIsDev: () => false,
    getPlatform: () => runtime.platform,
    getEnv: (name: string) =>
        ["WAVE_SERVER_WEB_ENDPOINT", "WAVE_SERVER_WS_ENDPOINT"].includes(name) ? location.host : "",
    getUserName: () => runtime.user,
    getHostName: () => runtime.hostname,
    getHomeDir: () => runtime.home,
    getDataDir: () => runtime.data,
    getConfigDir: () => runtime.config,
    getWebviewPreload: () => "",
    getZoomFactor: () => 1,
    getSystemAppearance: appearance,
    getAboutModalDetails: () => ({ version: "Tauri OS prototype" }),
    getUpdaterStatus: () => "up-to-date",
    getUpdaterChannel: () => "prototype",
    sendLog: (message: string) => console.log(message),
    onWaveInit: (callback: (value: unknown) => void) => {
        initCallback = callback;
    },
    setWindowInitStatus: (status: string) => {
        if (status === "ready") initCallback(runtime.init);
        if (status === "wave-ready") {
            report.status = "ready";
            persist();
            void import("./smoke").then(({ runSmoke }) => runSmoke(runtime, report, persist));
        }
    },
    setIsActive: () => {},
    updateWindowControlsOverlay: () => {},
    registerGlobalWebviewKeys: () => {},
    setKeyboardChordMode: () => {},
    setWebviewFocus: () => {},
    incrementTermCommands: () => {},
    syncNativeNotch: () => {},
    setHudWindowMode: () => {},
    setWindowIgnoreMouse: () => {},
    browserNavigationHistory: async () => null,
    onSystemAppearanceChange: (callback: () => void) => {
        const queries = [
            "prefers-color-scheme: dark",
            "prefers-contrast: more",
            "prefers-reduced-motion: reduce",
            "prefers-reduced-transparency: reduce",
        ].map((q) => matchMedia(`(${q})`));
        const update = () => callback.call(null, appearance());
        queries.forEach((q) => q.addEventListener("change", update));
        return () => queries.forEach((q) => q.removeEventListener("change", update));
    },
};
(window as any).api = new Proxy(api, {
    get(target, name: string) {
        if (name in target) return target[name];
        if (name === "getKronTermAccountStatus") return undefined;
        if (name.startsWith("on")) return (callback: (...args: any[]) => void) => subscribe(name, callback);
        return async () => unsupported(name);
    },
});
(window as any).__krontermLayoutMode = "os";
localStorage.setItem("kronterm:layoutmode", "os");

class PrototypeBrowser extends HTMLElement {
    guestId = crypto.randomUUID();
    ready: Promise<unknown>;
    resize: ResizeObserver;
    frame = 0;
    currentUrl = "";
    zoom = 1;
    navigationHistory = {
        canGoBack: () => false,
        canGoForward: () => false,
        getAllEntries: () => [],
        getActiveIndex: () => 0,
    };
    connectedCallback() {
        this.style.display = "block";
        this.currentUrl = this.getAttribute("src") || "https://example.com";
        this.ready = invoke("browser", { id: this.guestId, action: "create", url: this.currentUrl });
        this.resize = new ResizeObserver(() => this.syncBounds());
        this.resize.observe(this);
        const track = () => {
            this.syncBounds();
            this.frame = requestAnimationFrame(track);
        };
        this.ready.then(track).catch((error) => {
            issues.add(String(error));
            persist();
        });
    }
    disconnectedCallback() {
        cancelAnimationFrame(this.frame);
        this.resize?.disconnect();
        void this.ready?.then(() => this.command("close"));
    }
    command(action: string, extra = {}) {
        return invoke("browser", { id: this.guestId, action, ...extra });
    }
    lastBounds = "";
    syncBounds() {
        const rect = this.getBoundingClientRect();
        const hidden = !this.checkVisibility() || rect.width < 1 || rect.height < 1;
        const bounds = [rect.x, rect.y, rect.width, rect.height];
        const key = hidden ? "hidden" : JSON.stringify(bounds);
        if (key === this.lastBounds) return;
        this.lastBounds = key;
        void (hidden ? this.command("hide") : this.command("bounds", { bounds }).then(() => this.command("show")));
    }
    loadURL(url: string) {
        this.currentUrl = url;
        return this.ready.then(() => this.command("navigate", { url }));
    }
    getURL() {
        return this.currentUrl;
    }
    getTitle() {
        return this.currentUrl;
    }
    getWebContentsId() {
        return this.guestId;
    }
    getZoomFactor() {
        return this.zoom;
    }
    setZoomFactor(zoom: number) {
        this.zoom = zoom;
        void this.executeJavaScript(`document.documentElement.style.zoom=${JSON.stringify(zoom)}`);
    }
    executeJavaScript(script: string) {
        return this.ready.then(() => this.command("eval", { script }));
    }
    insertCSS(css: string) {
        return this.executeJavaScript(
            `{ const s=document.createElement('style'); s.textContent=${JSON.stringify(css)}; document.head.append(s); }`
        );
    }
    reload() {
        void this.executeJavaScript("location.reload()");
    }
    reloadIgnoringCache() {
        this.reload();
    }
    stop() {
        void this.executeJavaScript("window.stop()");
    }
    goBack() {
        void this.executeJavaScript("history.back()");
    }
    goForward() {
        void this.executeJavaScript("history.forward()");
    }
    canGoBack() {
        return false;
    }
    canGoForward() {
        return false;
    }
    isLoading() {
        return false;
    }
    setUserAgent() {
        unsupported("browser user-agent override");
    }
    focus() {
        void this.ready.then(() => this.command("focus"));
    }
    isDevToolsOpened() {
        return false;
    }
    setAudioMuted() {
        unsupported("browser audio mute");
    }
}
customElements.define("kronterm-webview", PrototypeBrowser);
function browserEvent(payload: any) {
    for (const element of document.querySelectorAll<PrototypeBrowser>("kronterm-webview")) {
        if (payload.label !== `browser-${element.guestId}`) continue;
        element.currentUrl = payload.url;
        const names =
            payload.event === "Started" ? ["did-start-loading"] : ["dom-ready", "did-navigate", "did-stop-loading"];
        for (const name of names) {
            element.dispatchEvent(Object.assign(new Event(name), { url: payload.url, isMainFrame: true }));
        }
        report.browser = payload;
        persist();
    }
}
report.stage = "subscribing-native-events";
persist();
if (native?.event?.listen)
    await native.event.listen("prototype-browser-load", (event: any) => browserEvent(event.payload));
else native?.onBrowserLoad?.(browserEvent);
report.stage = "loading-production-renderer";
persist();
await import("../../frontend/wave");
report.stage = "renderer-imported";
persist();

export {};
