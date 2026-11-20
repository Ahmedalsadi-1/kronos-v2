// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
(() => {
    if (localStorage.getItem("pencil-cookie-consent") == null)
        localStorage.setItem("pencil-cookie-consent", "declined");
    const workspace = new URLSearchParams(location.search).get("workspace") || "default";
    const includeWidgetSlides = workspace.startsWith("kronos-v2:");
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
    let scene;
    const agentReplies = new Map();
    let historyReply;
    let historyOpen;
    let historySerial = 0;
    let editorReady = false;
    let announcedScene;
    let disposeScene;
    let widgets;
    let commands;
    let settings;
    let shell;
    let navigationMode = "sessions";
    let workspaceContext = { workspaceId: workspace };
    let applyingCamera = false;
    let lastCamera;
    let cameraSequence = 0;
    let presentationSlide;
    let theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const cameraSnapshot = () => {
        if (!scene || scene.destroyed) throw new Error("The Pen canvas is still starting");
        const camera = scene.camera;
        const translation = camera.toScreen(0, 0);
        const bounds = scene.containerBounds;
        const [top, right, bottom, left] = camera.screenInsets;
        const outer = frame.getBoundingClientRect();
        return {
            camera: {
                x: translation.x + bounds.x + outer.x,
                y: translation.y + bounds.y + outer.y,
                zoom: camera.zoom,
            },
            viewport: {
                x: bounds.x + outer.x + left,
                y: bounds.y + outer.y + top,
                width: Math.max(0, camera.screenWidth - left - right),
                height: Math.max(0, camera.screenHeight - top - bottom),
            },
        };
    };
    const emitSurface = (message) => {
        const hostFrame = window.frameElement;
        if (hostFrame) {
            const event = new CustomEvent("kronos-pen-surface", { detail: message, cancelable: true });
            if (!hostFrame.dispatchEvent(event)) return;
        }
        emit(message);
    };
    const emitCamera = () => {
        if (applyingCamera || !scene || scene.destroyed) return;
        emitPresentation();
        const snapshot = cameraSnapshot();
        const serialized = JSON.stringify(snapshot);
        if (serialized === lastCamera) return;
        lastCamera = serialized;
        // Deliver geometry before Pen and the live widget layer can paint different camera positions.
        emitSurface({ type: "camera", sequence: ++cameraSequence, ...snapshot });
    };
    const emitPresentation = (force = false) => {
        const slide = scene.stateManager?.state?.currentSlide;
        if (!force && slide === presentationSlide) return;
        presentationSlide = slide;
        const metadata = slide?.properties?.resolved?.metadata;
        const blockId = includeWidgetSlides && metadata?.type === "kronos-live-widget" ? metadata.blockId : undefined;
        emitSurface({ type: "presentation", active: slide != null, blockId });
    };
    const announceReady = (force = false) => {
        if (!editorReady || !scene || scene.destroyed || !widgets) return false;
        if (!force && announcedScene === scene) return true;
        announcedScene = scene;
        emit({ type: "ready", workspace, engine: "pen-web-embed" });
        lastCamera = undefined;
        emitCamera();
        if (presentationSlide) emitPresentation(true);
        return true;
    };
    const imageReviews = new Map();
    const connectScene = () => {
        const next = frame.contentWindow?.__kronosPenScene;
        if (!next || next === scene) return;
        disposeScene?.();
        scene = next;
        frame.contentWindow.__kronosV2 = includeWidgetSlides;
        frame.contentWindow.__kronosSubmitAgent = ({ prompt, files, conversationId, ...options }, reply) => {
            const id = crypto.randomUUID();
            const review = imageReviews.get(conversationId);
            agentReplies.set(id, { reply, conversationId, review });
            shell?.setAgentWorkers(conversationId, []);
            const agent = [...frame.contentDocument.querySelectorAll("[data-kronos-pen-composer-controls]")]
                .find((slot) => slot.dataset.kronosPenComposerControls === conversationId && slot.getClientRects().length)
                ?.dataset.kronosPenAgent;
            emit({ type: "agent-prompt", requestId: id, prompt, files, options, conversationId, agent, imageReview: review?.payload, hermesSessionId: conversationId?.startsWith("hermes:") ? conversationId.slice(7) : undefined });
        };
        frame.contentWindow.__kronosStopAgent = (conversationId) => {
            for (const [requestId, pending] of agentReplies) {
                if (pending.conversationId !== conversationId) continue;
                emit({ type: "agent-stop", requestId });
                return true;
            }
            return false;
        };
        frame.contentWindow.__kronosSearchSessions = (query, reply) => {
            const requestId = ++historySerial;
            historyReply = { requestId, reply };
            emit({ type: "hermes-history-search", requestId, query });
            return () => {
                if (historyReply?.requestId === requestId) historyReply = undefined;
            };
        };
        frame.contentWindow.__kronosOpenHistoryTool = (tool) => emit({ type: "history-tool-open", tool });
        frame.contentWindow.__kronosOpenSession = (sessionId, reply) => {
            const requestId = ++historySerial;
            historyOpen = { requestId, reply };
            emit({ type: "hermes-history-open", requestId, sessionId });
            return () => {
                if (historyOpen?.requestId === requestId) historyOpen = undefined;
            };
        };
        widgets = window.createKronosPenWidgets(scene, emitSurface, frame.contentDocument);
        commands = window.createKronosPenCommands?.(scene, frame.contentWindow, emit);
        settings = window.createKronosPenSettings?.(scene, emit);
        shell = window.createKronosPenShell?.(scene, emit, frame.contentDocument, {
            workspaceId: workspace,
            openTelegram(sessionId, reply) {
                const requestId = ++historySerial;
                historyOpen = { requestId, reply };
                emit({ type: "history-telegram-open", requestId, sessionId });
            },
            openBot(botId, reply) {
                const requestId = ++historySerial;
                historyOpen = { requestId, reply };
                emit({ type: "bot-roster-open", requestId, botId });
            },
        });
        shell?.setContext(workspaceContext);
        shell?.setNavigation(navigationMode);
        const originalBackground = scene.getBackgroundColor.bind(scene);
        scene.getBackgroundColor = () => scene.kronosBackground ?? originalBackground();
        scene.camera.on("change", emitCamera);
        const slides = scene.slidesManager;
        const originalIsSlide = slides?.isSlideFrame;
        if (includeWidgetSlides && originalIsSlide) {
            slides.isSlideFrame = function (node) {
                return originalIsSlide.call(this, node) || (
                    node.type === "frame" &&
                    node.parent === next.scenegraph.getViewportNode() &&
                    node.properties.resolved.metadata?.type === "kronos-live-widget"
                );
            };
        }
        const onStateChange = () => emitPresentation();
        scene.eventEmitter?.on("stateChange", onStateChange);
        onStateChange();
        const pointerDown = (event) => {
            if (event.target?.closest?.("[data-kronos-pen-tools]")) return;
            const { viewport } = cameraSnapshot();
            const outer = frame.getBoundingClientRect();
            const x = event.clientX + outer.x;
            const y = event.clientY + outer.y;
            if (
                x >= viewport.x &&
                y >= viewport.y &&
                x <= viewport.x + viewport.width &&
                y <= viewport.y + viewport.height
            )
                emit({ type: "canvas-interaction" });
        };
        frame.contentDocument.addEventListener("pointerdown", pointerDown, true);
        disposeScene = () => {
            if (includeWidgetSlides && originalIsSlide) slides.isSlideFrame = originalIsSlide;
            historyReply = undefined;
            historyOpen = undefined;
            shell?.dispose();
            widgets?.dispose();
            commands?.dispose();
            settings?.dispose();
            next.camera.off("change", emitCamera);
            next.eventEmitter?.off("stateChange", onStateChange);
            next.getBackgroundColor = originalBackground;
            frame.contentDocument?.removeEventListener("pointerdown", pointerDown, true);
        };
        lastCamera = undefined;
        applyAppearance();
        announceReady();
        emitCamera();
    };
    frame.addEventListener("load", () => {
        agentReplies.clear();
        frame.contentWindow.addEventListener("kronos-pen-scene-ready", connectScene);
        connectScene();
    });
    const applyAppearance = () => {
        const root = frame.contentDocument?.documentElement;
        if (!root) return;
        if (shell) {
            workspaceContext = {
                ...workspaceContext,
                appearance: { background: appearance.background, accent: appearance.accent },
            };
            shell.setContext(workspaceContext);
        }
        if (appearance.background) root.style.setProperty("--canvas-bg", appearance.background);
        if (appearance.accent) root.style.setProperty("--primary", appearance.accent);
        if (scene && appearance.background) {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.fillStyle = appearance.background;
            context.fillRect(0, 0, 1, 1);
            scene.kronosBackground = Array.from(context.getImageData(0, 0, 1, 1).data, (channel) => channel / 255);
            scene.requestFrame();
        }
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
    const bundledLibrary = (path) => {
        if (typeof path !== "string") return;
        return /(?:^pencil:|^|\/)(shadcn|lunaris|halo|nitro)\.lib\.pen$/.exec(path)?.[1];
    };
    const readBundledLibrary = async (name) => {
        const response = await fetch(`../libraries/${name}.lib.pen`);
        if (!response.ok) throw new Error("The bundled design library could not be loaded.");
        return new Uint8Array(await response.arrayBuffer());
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
            case "find-libraries":
                return [];
            case "storage-read-asset": {
                const name = bundledLibrary(payload.path);
                return (await asset(payload.path)) ?? (name ? readBundledLibrary(name) : undefined);
            }
            case "storage-write-asset":
                await asset(payload.path, payload.data, true);
                return;
            case "storage-has-asset":
                return (await asset(payload.path)) != null || !!bundledLibrary(payload.path);
            case "documents-save-preview":
                return;
            default: {
                const result = await shell?.handleRequest(method, payload);
                if (result !== undefined) return result;
                throw new Error(`Unsupported embed storage request: ${method}`);
            }
        }
    };
    window.addEventListener("message", async (event) => {
        if (event.origin !== origin) return;
        if (event.source === frame.contentWindow && event.data?.type === "pen:ready") {
            editorReady = false;
            announcedScene = undefined;
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
                    editorReady = true;
                    connectScene();
                    applyAppearance();
                    announceReady();
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
                    clientName: "Kron Agent",
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
                case "connect":
                    result = { ready: announceReady(true) };
                    break;
                case "show_workspaces": {
                    const editor = frame.contentWindow;
                    const deadline = Date.now() + 5000;
                    while (!editor.__kronosOpenWorkspaces && Date.now() < deadline) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                    }
                    if (!editor.__kronosOpenWorkspaces) throw new Error("The Pen dashboard is still starting.");
                    editor.__kronosOpenWorkspaces();
                    result = { success: true };
                    break;
                }
                case "show_chat": {
                    const button = frame.contentDocument.querySelector('button[aria-label="Chat"]');
                    if (!button) throw new Error("The Pen chat is still starting.");
                    if (button.getAttribute("aria-pressed") !== "true") button.click();
                    frame.contentDocument.querySelector('[contenteditable="true"][role="textbox"]')?.focus();
                    result = { success: true };
                    break;
                }
                case "show_full_chat": {
                    const show = frame.contentWindow.__kronosShowFullChat;
                    if (!show) throw new Error("Pen chat is still starting.");
                    show();
                    result = { success: true };
                    break;
                }
                case "stage_chat_selection": {
                    const doc = frame.contentDocument;
                    const slot = [...doc.querySelectorAll("[data-kronos-pen-composer-controls]")]
                        .find(element => element.getClientRects().length && element.kronosControls?.addFiles);
                    if (!slot?.kronosControls?.insert) throw new Error("Open the chat before adding browser context.");
                    if (typeof params.text !== "string" || !params.text.trim()) throw new Error("Browser context is empty.");
                    const files = await Promise.all((params.images ?? []).map(async ({ filename, dataUrl }) => {
                        if (typeof dataUrl !== "string" || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl))
                            throw new Error("Invalid browser screenshot.");
                        const blob = await (await fetch(dataUrl)).blob();
                        return new frame.contentWindow.File([blob], filename || "browser-selection.png", { type: blob.type });
                    }));
                    if (!slot.isConnected) throw new Error("The chat closed while adding browser context.");
                    if (files.length) await slot.kronosControls.addFiles(files);
                    slot.kronosControls.insert("\n\n" + params.text);
                    result = { success: true };
                    break;
                }
                case "stage_image_review": {
                    const doc = frame.contentDocument;
                    const slots = [...doc.querySelectorAll("[data-kronos-pen-composer-controls]")]
                        .filter((slot) => slot.getClientRects().length);
                    if (slots.length !== 1) throw new Error("Open the current chat before adding image comments.");
                    const slot = slots[0];
                    const id = slot.dataset.kronosPenComposerControls;
                    if (!id) throw new Error("The chat composer is still starting.");
                    const { filename, dataUrl, comments } = params;
                    if (typeof filename !== "string" || typeof dataUrl !== "string" ||
                        !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl) || !Array.isArray(comments))
                        throw new Error("Invalid image review.");
                    const existing = imageReviews.get(id);
                    if (!comments.length && existing?.payload.dataUrl === dataUrl) {
                        result = { success: true };
                        break;
                    }
                    existing?.element.remove();
                    const element = doc.createElement("div");
                    element.style.cssText = "display:flex;align-items:end;gap:8px;padding:6px;color:inherit";
                    const thumbnail = doc.createElement("img");
                    thumbnail.src = dataUrl;
                    thumbnail.alt = filename;
                    thumbnail.style.cssText = "width:48px;height:48px;object-fit:cover;border-radius:8px";
                    const chip = doc.createElement("button");
                    chip.type = "button";
                    chip.textContent = comments.length + (comments.length === 1 ? " comment" : " comments");
                    chip.style.cssText = "border:1px solid #ad668c;border-radius:12px;padding:4px 8px";
                    const preview = doc.createElement("div");
                    preview.hidden = true;
                    preview.style.cssText = "position:absolute;bottom:100%;left:0;width:min(280px,65vw);max-height:45vh;overflow:auto;padding:10px;border-radius:12px;background:#303030;color:#fff;z-index:10;white-space:pre-wrap;overflow-wrap:anywhere";
                    preview.textContent = filename + "\n" + comments.map(({ number, text }) => number + ". " + text).join("\n");
                    const chipGroup = doc.createElement("div");
                    chipGroup.style.position = "relative";
                    chipGroup.append(chip, preview);
                    chipGroup.onmouseenter = chip.onfocus = () => { preview.hidden = false; };
                    chipGroup.onmouseleave = chip.onblur = () => { preview.hidden = true; };
                    const remove = doc.createElement("button");
                    remove.type = "button";
                    remove.textContent = "×";
                    remove.setAttribute("aria-label", "Remove image review");
                    remove.onclick = () => { imageReviews.delete(id); element.remove(); };
                    element.append(thumbnail);
                    if (comments.length) element.append(chipGroup);
                    element.append(remove);
                    slot.parentElement.before(element);
                    imageReviews.set(id, { element, payload: { filename, dataUrl, comments } });
                    result = { success: true };
                    break;
                }
                case "resume_hermes_chat": {
                    if (params.error) throw new Error(params.error);
                    const slot = [...frame.contentDocument.querySelectorAll("[data-kronos-pen-composer-controls]")]
                        .find((element) => element.dataset.kronosPenComposerControls === params.conversationId);
                    if (!slot?.kronosControls?.resume) throw new Error("The Pen chat has closed.");
                    slot.kronosControls.resume(params);
                    result = { success: true };
                    break;
                }
                case "hermes_history_opened": {
                    if (historyOpen?.requestId === params.requestId) {
                        const { reply } = historyOpen;
                        historyOpen = undefined;
                        reply(params);
                    }
                    break;
                }
                case "hermes_history_results": {
                    if (historyReply?.requestId === params.requestId) {
                        const { reply } = historyReply;
                        historyReply = undefined;
                        reply(params.rows, params.error);
                    }
                    break;
                }
                case "agent_workers": {
                    const pending = agentReplies.get(params.requestId);
                    if (pending) shell?.setAgentWorkers(pending.conversationId, params.rows);
                    result = { success: true };
                    break;
                }
                case "agent_reply": {
                    const pending = agentReplies.get(params.requestId);
                    if (!pending) break;
                    const label = { Pi: "KronOS Side Agent (Pi)", Hermes: "Hermes", OpenCode: "OpenCode", "Codex CLI": "Codex CLI", "Local voice": "Local voice" }[params.agent];
                    const author = (text) => label && text ? `**${label}**\n\n${text}` : text;
                    for (const update of params.updates ?? [params]) {
                        if (update.tool) {
                            const { id, name, done, failed, input, output } = update.tool;
                            pending.reply(done
                                ? { type: "tool-result", id, output, success: !failed }
                                : { type: "tool-use", id, name, input });
                            continue;
                        }
                        if (update.done) {
                            agentReplies.delete(params.requestId);
                            if (!update.error && pending.review && imageReviews.get(pending.conversationId) === pending.review) {
                                imageReviews.delete(pending.conversationId);
                                pending.review.element.remove();
                            }
                        }
                        pending.reply(
                            update.done
                                ? {
                                      type: "end",
                                      content: update.error
                                          ? { reason: "failed", message: label && update.error !== "Stopped." ? `${label}: ${update.error}` : update.error }
                                          : { reason: "finished", response: author(update.text) },
                                  }
                                : { type: update.start ? "message-start" : "message", source: "assistant", text: author(update.text) }
                        );
                        if (update.done) {
                            shell?.advanceComparison(pending.conversationId, params.agent);
                            break;
                        }
                    }
                    result = { success: true };
                    break;
                }
                case "composer_agent_timing":
                    shell?.updateComposerAgentTiming(params);
                    break;
                case "composer_voice_update":
                    result = shell?.updateComposerVoice(params);
                    break;
                case "composer_completions":
                    shell?.setComposerCompletions(params);
                    result = { success: true };
                    break;
                case "composer_sandbox_update":
                    shell?.setComposerSandbox(params);
                    result = { success: true };
                    break;
                case "set_workspace_inspector":
                    shell?.setWorkspaceInspector(params.open === true);
                    result = { success: true };
                    break;
                case "set_file_panel":
                    shell?.setFilePanel(params);
                    result = { success: true };
                    break;
                case "set_history_extras":
                    shell?.setHistoryExtras(params);
                    result = { success: true };
                    break;
                case "set_bot_roster":
                    shell?.setBotRoster(params);
                    result = { success: true };
                    break;
                case "set_workflow_library":
                    shell?.setWorkflowLibrary(params);
                    result = { success: true };
                    break;
                case "set_workspace_navigation":
                    navigationMode = params.mode;
                    shell?.setNavigation(navigationMode);
                    result = { success: true };
                    break;
                case "set_context":
                    workspaceContext = { ...workspaceContext, ...params, workspaceId: workspace };
                    shell?.setContext(workspaceContext);
                    result = { success: true };
                    break;
                case "get_commands":
                    result = commands.get();
                    break;
                case "run_command":
                    result = commands.run(params);
                    break;
                case "get_settings":
                    result = settings.read();
                    break;
                case "set_settings":
                    result = settings.update(params.patch);
                    break;
                case "update_widget_previews":
                    result = await widgets.updatePreviews(params);
                    break;
                case "sync_widgets":
                    if (!widgets) throw new Error("The Pen canvas is still starting");
                    result = widgets.sync(params);
                    break;
                case "focus_canvas": {
                    frame.contentWindow.focus();
                    const canvas = frame.contentDocument.querySelector("canvas");
                    if (canvas) {
                        canvas.tabIndex = -1;
                        canvas.focus({ preventScroll: true });
                    }
                    result = { success: true };
                    break;
                }
                case "get_camera":
                    result = { ...cameraSnapshot(), sequence: ++cameraSequence };
                    break;
                case "set_camera": {
                    const { x, y, zoom } = params;
                    if (![x, y, zoom].every(Number.isFinite) || zoom < 0.02 || zoom > 256)
                        throw new Error("Invalid canvas camera");
                    cameraSnapshot();
                    const bounds = scene.containerBounds;
                    const outer = frame.getBoundingClientRect();
                    const camera = scene.camera;
                    applyingCamera = true;
                    try {
                        camera.endAnimation();
                        camera.setView(
                            (bounds.x + outer.x - x) / zoom + camera.centerOffsetX(zoom),
                            (bounds.y + outer.y - y) / zoom + camera.centerOffsetY(zoom),
                            zoom
                        );
                        const snapshot = cameraSnapshot();
                        lastCamera = JSON.stringify(snapshot);
                        result = { ...snapshot, sequence: ++cameraSequence };
                    } finally {
                        applyingCamera = false;
                    }
                    break;
                }
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
            if (id != null) emit({ id, result });
        } catch (error) {
            emit({ id, error: error.message });
        }
    });
})();
