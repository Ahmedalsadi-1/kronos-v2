const { ipcMain, Menu, WebContentsView } = require("electron");
const { compareWithPi, discoverSources, chatWithPi } = require("./comparison.cjs");

function webAddress(value) {
    try {
        const url = new URL(value);
        if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
    } catch {
        return null;
    }
    return null;
}

const commands = ["show", "hide", "back", "forward", "reload", "close", "navigate", "compare", "chat"];

function registerLiveBrowser() {
    const hosts = new Map();
    ipcMain.handle("live-browser:command", (event, command, input = {}) => {
        const host = hosts.get(event.sender.id);
        if (!host || event.senderFrame !== event.sender.mainFrame || !commands.includes(command)) return;
        return host(command, input);
    });
    return function bind(window, webSession) {
        const views = new Map();
        const shell = window.webContents;
        let visibleId = null;

        function notify(data) {
            if (!shell.isDestroyed()) shell.send("live-browser:event", data);
        }

        function show(id, bounds, href) {
            const { x, y, width, height } = bounds ?? {};
            if (![x, y, width, height].every(Number.isFinite)) return;
            const [maxWidth, maxHeight] = window.getContentSize();
            const left = Math.max(0, Math.min(maxWidth, Math.round(x)));
            const top = Math.max(48, Math.min(maxHeight, Math.round(y)));
            const w = Math.max(0, Math.min(maxWidth - left, Math.floor(width)));
            const h = Math.max(0, Math.min(maxHeight - top, Math.floor(height)));
            const old = views.get(visibleId);
            if (old && visibleId !== id) old.setVisible(false);
            let view = views.get(id);
            if (!view) {
                const url = webAddress(href);
                if (!url) return;
                if (views.size >= 32) {
                    notify({ id, type: "error", description: "Close an existing live tab to open another." });
                    return;
                }
                view = new WebContentsView({ webPreferences: {
                    session: webSession, sandbox: true, contextIsolation: true, nodeIntegration: false,
                } });
                views.set(id, view);
                window.contentView.addChildView(view);
                const contents = view.webContents;
                const publish = () => notify({
                    id, type: "state", address: webAddress(contents.getURL()), title: contents.getTitle(),
                    canBack: contents.navigationHistory.canGoBack(), canForward: contents.navigationHistory.canGoForward(),
                    loading: contents.isLoadingMainFrame(),
                });
                for (const event of ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-start-loading", "did-stop-loading"]) {
                    contents.on(event, publish);
                }
                contents.on("did-start-loading", () => notify({ id, type: "clear-error" }));
                contents.on("did-fail-load", (_event, code, description, url, mainFrame) => {
                    if (mainFrame && code !== -3) notify({ id, type: "error", description, address: webAddress(url) });
                });
                contents.on("render-process-gone", () => notify({ id, type: "error", description: "This page stopped responding." }));
                for (const event of ["will-navigate", "will-redirect"]) {
                    contents.on(event, (navigation) => { if (!webAddress(navigation.url)) navigation.preventDefault(); });
                }
                contents.setWindowOpenHandler(({ url }) => {
                    if (webAddress(url)) notify({ id, type: "new-tab", address: webAddress(url) });
                    return { action: "deny" };
                });
                contents.on("context-menu", (_event, params) => {
                    const address = webAddress(contents.getURL());
                    if (!address) return;
                    Menu.buildFromTemplate([
                        { label: params.selectionText ? "Send Selection to Canvas" : "Send Page to Canvas",
                            click: () => notify({ id, type: "source", address, title: contents.getTitle(), summary: params.selectionText.slice(0, 8000) }) },
                        { label: "Copy", role: "copy", enabled: !!params.selectionText },
                    ]).popup({ window });
                });
                void contents.loadURL(url).catch(() => {});
            }
            visibleId = id;
            view.setBounds({ x: left, y: top, width: w, height: h });
            view.setVisible(w > 0 && h > 0);
        }

        let comparing = false;

        async function readTab({ id, address }) {
            const contents = views.get(id)?.webContents;
            const expected = webAddress(address);
            if (!contents || contents.isDestroyed() || !expected || webAddress(contents.getURL()) !== expected || contents.isLoadingMainFrame()) {
                return { error: "A selected tab changed or is still loading. Check the two tabs and try again.", tabId: id };
            }
            const title = contents.getTitle();
            const challengeTitle = /^(just a moment|attention required|security check|verify you are human|access denied|robot check)/i;
            if (challengeTitle.test(title.trim())) return { error: "This site is asking for verification. Complete it in the tab and retry.", tabId: id };
            let captured;
            try {
                captured = await contents.executeJavaScriptInIsolatedWorld(999, [{ code: `(() => {
                    const body = (document.querySelector("main, article, [role=main]") ?? document.body)?.innerText ?? "";
                    return { text: body.trim().slice(0, 14000), address: location.href };
                })()` }]);
            } catch {
                return { error: "This tab could not be read. Check that the page has loaded and try again.", tabId: id };
            }
            if (contents.isDestroyed() || webAddress(captured?.address) !== expected || webAddress(contents.getURL()) !== expected) {
                return { error: "A selected tab navigated during capture. Check the two tabs and try again.", tabId: id };
            }
            const text = captured.text;
            if (!text || (text.length < 1200 && /verify (that )?you are human|checking your browser|unusual traffic|enable javascript and cookies to continue/i.test(text))) {
                return { error: "No readable article text is available. If the page requests verification or sign-in, complete it in the tab and retry.", tabId: id };
            }
            return { title: title.slice(0, 300) || expected, address: expected, text };
        }

        function readHistory(history) {
            return Array.isArray(history) ? history.slice(-8).filter((turn) =>
                typeof turn?.question === "string" && typeof turn?.summary === "string").map((turn) => ({
                question: turn.question.slice(0, 600), summary: turn.summary.slice(0, 1200),
            })) : [];
        }

        async function respond({ question, history }) {
            if (comparing) return { error: "Pi is already running a request." };
            if (typeof question !== "string" || !question.trim() || question.length > 2000) return { error: "Enter a message." };
            comparing = true;
            try {
                return await chatWithPi(question.trim(), readHistory(history));
            } finally {
                comparing = false;
            }
        }

        async function compare(input) {
            if (comparing) return { error: "Pi is already running a request." };
            const { selected, question, runId } = input;
            const automatic = input.search === true;
            const history = readHistory(input.history);
            if (typeof question !== "string" || !question.trim() || question.length > 2000 ||
                (!automatic && (!Array.isArray(selected) || selected.length !== 2 || selected[0]?.id === selected[1]?.id ||
                selected.some((item) => typeof item?.id !== "string" || !webAddress(item.address))))) {
                return { error: "Select two live tabs and enter a question." };
            }
            const progress = (step) => {
                if (typeof runId === "string" && runId.length <= 64) notify({ type: "research-progress", runId, step });
            };
            comparing = true;
            try {
                progress(0);
                let sources;
                if (automatic) {
                    const found = await discoverSources(question.trim(), history, () => progress(1));
                    if (found.error) return found;
                    sources = found.sources;
                } else {
                    sources = await Promise.all(selected.map(readTab));
                    const failure = sources.find((source) => source.error);
                    if (failure) return failure;
                }
                const records = sources.map(({ title, address }, index) => ({ title, address, liveId: automatic ? undefined : selected[index].id, kind: "live" }));
                if (automatic) notify({ type: "research-sources", sources: records });
                progress(automatic ? 2 : 1);
                const result = await compareWithPi(question.trim(), sources, history);
                if (result.error) return result;
                return { ...result, sources: records };
            } finally {
                comparing = false;
            }
        }

        const shellId = shell.id;
        hosts.set(shellId, (command, input) => {
            if (command === "compare") return compare(input);
            if (command === "chat") return respond(input);
            const { id, bounds, address } = input;
            if (typeof id !== "string" || id.length > 64) return;
            const view = views.get(id);
            if (command === "show") return show(id, bounds, address);
            if (!view) return;
            if (command === "hide") {
                view.setVisible(false);
                if (visibleId === id) visibleId = null;
            }
            if (command === "close") {
                window.contentView.removeChildView(view);
                view.webContents.close();
                views.delete(id);
                if (visibleId === id) visibleId = null;
            }
            if (command === "back" || command === "forward") {
                const history = view.webContents.navigationHistory;
                if (command === "back" && history.canGoBack()) { history.goBack(); return true; }
                if (command === "forward" && history.canGoForward()) { history.goForward(); return true; }
                return false;
            }
            if (command === "reload") view.webContents.reload();
            if (command === "navigate" && webAddress(address)) void view.webContents.loadURL(webAddress(address)).catch(() => {});
        });
        shell.on("did-start-navigation", (event) => {
            if (!event.isMainFrame || event.isSameDocument || !views.size) return;
            for (const view of views.values()) {
                window.contentView.removeChildView(view);
                view.webContents.close();
            }
            views.clear();
            visibleId = null;
        });
        window.on("closed", () => {
            hosts.delete(shellId);
            for (const view of views.values()) if (!view.webContents.isDestroyed()) view.webContents.close();
            views.clear();
        });
    };
}

module.exports = { registerLiveBrowser };
