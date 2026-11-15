// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
(() => {
    window.createKronosPenShell = (scene, emit, document, options = {}) => {
        const view = document.defaultView;
        let context = {
            workspaceId: options.workspaceId || "default",
            workspaceName: "KronOS workspace",
            spaces: [],
            widgets: [],
            appearance: {},
        };
        let disposed = false;
        let scheduled;
        let overlayOpen = false;
        let toolsSlot;
        let navigation;
        let libraries;
        let workflowContent;
        let workflowSnapshot;
        let inspector;
        let inspectorOpen = false;
        let inspectorTab = "files";
        let filePanel;
        let fileSnapshot;
        const renderFiles = () => {
            if (!filePanel) return;
            filePanel.replaceChildren();
            const action = (action, index = -1) => emit({ type: "files-panel-action", action, index });
            if (fileSnapshot?.preview) {
                const { title, text } = fileSnapshot.preview;
                filePanel.append(libraryButton("Back to files", () => action("list")));
                const heading = document.createElement("h3");
                heading.textContent = title;
                const preview = document.createElement("pre");
                preview.textContent = text;
                filePanel.append(heading, preview);
                return;
            }
            const { path, canGoUp, rows = [], error } = fileSnapshot ?? {};
            const bar = document.createElement("div");
            bar.dataset.kronosPenFileBar = "";
            if (canGoUp) bar.append(libraryButton("Up", () => action("up")));
            bar.append(libraryButton("Refresh", () => action("list")));
            filePanel.append(bar);
            const status = document.createElement("p");
            status.textContent = error || path || "Loading workspace files…";
            status.title = path || "";
            filePanel.append(status);
            rows.forEach(({ name, isDirectory }, index) => {
                const row = libraryButton((isDirectory ? "▸ " : "") + name, () => action("open", index));
                row.title = name;
                filePanel.append(row);
            });
            if (path && !rows.length && !error) {
                const empty = document.createElement("p");
                empty.textContent = "This folder is empty.";
                filePanel.append(empty);
            }
        };
        const mountInspector = () => {
            inspector = document.createElement("aside");
            inspector.dataset.kronosPenInspector = "";
            inspector.id = "kronos-pen-workspace-inspector";
            inspector.setAttribute("aria-label", "Workspace inspector");
            const tabs = document.createElement("div");
            tabs.dataset.kronosPenInspectorTabs = "";
            tabs.setAttribute("role", "group");
            tabs.setAttribute("aria-label", "Inspector sections");
            filePanel = document.createElement("div");
            filePanel.dataset.kronosPenFilePanel = "";
            const render = document.createElement("div");
            const select = (tab) => {
                inspectorTab = tab;
                filePanel.hidden = tab !== "files";
                render.hidden = tab !== "render";
                for (const button of tabs.querySelectorAll("button"))
                    button.setAttribute("aria-pressed", String(button.dataset.tab === tab));
                if (tab === "render") render.dataset.kronosPenRenderControls = "";
                else delete render.dataset.kronosPenRenderControls;
                emit({ type: "render-controls-slot" });
                if (tab === "files") emit({ type: "files-panel-action", action: "list" });
            };
            for (const [id, label] of [["files", "Files"], ["render", "KronRender"]]) {
                const button = libraryButton(label, () => select(id));
                button.dataset.tab = id;
                tabs.append(button);
            }
            inspector.append(tabs, filePanel, render);
            return select;
        };
        let floatingChat;
        let chatDrag;
        const positionChat = (panel, offset) => {
            panel.toggleAttribute("data-kronos-floating-chat", Boolean(offset));
            if (offset) panel.style.setProperty("--kronos-chat-offset", `${offset.x}px ${offset.y}px`);
            else panel.style.removeProperty("--kronos-chat-offset");
        };
        const fitChat = (panel, offset, next) => {
            const rect = panel.getBoundingClientRect();
            const mini = panel.querySelector("[data-kronos-mini-chat]");
            const top = mini ? Math.min(rect.top, mini.getBoundingClientRect().top) : rect.top;
            const clamp = (value, from, to) => Math.max(from, Math.min(to, value));
            return {
                x: clamp(next.x, offset.x + 8 - rect.left, offset.x + view.innerWidth - 8 - rect.right),
                y: clamp(next.y, offset.y + 8 - top, offset.y + view.innerHeight - 8 - rect.bottom),
            };
        };
        const dockChat = (event) => {
            if (!event.target?.closest?.("[data-kronos-pen-drag-chat]") || !floatingChat) return;
            if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            const { panel } = floatingChat;
            floatingChat = undefined;
            positionChat(panel);
        };
        const isChatDockTarget = ({ x, y }) => Math.abs(x) <= 96 && Math.abs(y) <= 32;
        const startChatDrag = (event) => {
            const target = event.target;
            const grip = target?.closest?.("[data-kronos-pen-drag-chat]");
            const panel = target?.closest?.("[data-agent-spotlight]");
            if (!panel || event.button !== 0 || chatDrag) return;
            if (!grip && (target !== panel || !panel.querySelector("[data-kronos-pen-drag-chat]"))) return;
            const handle = grip ?? panel;
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            const start = floatingChat?.panel === panel ? floatingChat.offset : undefined;
            chatDrag = {
                handle, panel, id: event.pointerId, start, current: start ?? { x: 0, y: 0 },
                x: event.clientX, y: event.clientY, moved: false,
            };
        };
        const moveChatDrag = (event) => {
            const drag = chatDrag;
            if (!drag || drag.id !== event.pointerId) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 6) return;
            drag.moved = true;
            event.preventDefault();
            drag.current = fitChat(drag.panel, drag.current, {
                x: (drag.start?.x ?? 0) + dx, y: (drag.start?.y ?? 0) + dy,
            });
            positionChat(drag.panel, drag.current);
            drag.panel.toggleAttribute("data-kronos-chat-dock-target", isChatDockTarget(drag.current));
        };
        const finishChatDrag = (event) => {
            const drag = chatDrag;
            if (!drag || drag.id !== event.pointerId) return;
            chatDrag = undefined;
            drag.panel.removeAttribute("data-kronos-chat-dock-target");
            if (!drag.moved) return;
            const offset = event.type === "pointerup"
                ? isChatDockTarget(drag.current) ? undefined : drag.current
                : drag.start;
            floatingChat = offset ? { panel: drag.panel, offset } : undefined;
            positionChat(drag.panel, offset);
        };
        const fitFloatingChat = () => {
            if (!floatingChat || chatDrag) return;
            const { panel, offset } = floatingChat;
            floatingChat.offset = fitChat(panel, offset, offset);
            positionChat(panel, floatingChat.offset);
        };
        const composerPanels = new WeakMap();
        let completionId = 0;
        let activeCompletion;
        const readTrigger = (slot) => {
            const draft = slot.kronosControls?.draft?.();
            if (!draft) return;
            const match = (draft.first && draft.before.match(/^(\/)([^\n]*)$/)) ||
                draft.before.match(/(?:^|\s)(@)([^\s@]*)$/);
            if (!match || match[2].length > 512) return;
            return { trigger: match[1], query: match[2], to: draft.end, from: draft.end - match[2].length - 1 };
        };
        const closeCompletion = () => {
            if (!activeCompletion) return;
            const { panel, timer } = activeCompletion;
            clearTimeout(timer);
            activeCompletion = undefined;
            if (panel.picker.matches(":popover-open")) panel.picker.hidePopover();
        };
        const showCompletion = (panel) => {
            const rect = panel.tools.getBoundingClientRect();
            let composer = panel.tools.parentElement;
            while (composer.parentElement && !composer.querySelector('textarea, [contenteditable="true"]')) {
                composer = composer.parentElement;
            }
            const width = panel.picker.offsetWidth;
            const right = Math.min(composer.getBoundingClientRect().right, view.innerWidth - 8);
            panel.picker.style.left = Math.max(8, right - width) + "px";
            if (rect.top > view.innerHeight / 2) {
                panel.picker.style.bottom = view.innerHeight - rect.top + 6 + "px";
                panel.picker.style.top = "auto";
            } else {
                panel.picker.style.top = rect.bottom + 6 + "px";
                panel.picker.style.bottom = "auto";
            }
        };
        const renderCompletions = (items) => {
            const state = activeCompletion;
            if (!state) return;
            const { slot, panel } = state;
            state.items = items;
            state.index = -1;
            panel.picker.replaceChildren(...items.map(({ text, display, meta }) => {
                const row = document.createElement("button");
                row.type = "button";
                const title = document.createElement("span");
                title.textContent = display || text;
                row.append(title);
                if (meta) {
                    const description = document.createElement("small");
                    description.textContent = meta;
                    row.append(description);
                }
                row.addEventListener("mousedown", (event) => event.preventDefault());
                row.addEventListener("click", () => {
                    const range = state.range;
                    const current = readTrigger(slot);
                    if (range && (!current || JSON.stringify(current) !== JSON.stringify(range))) {
                        closeCompletion();
                        return;
                    }
                    closeCompletion();
                    if (range) {
                        const suffix = text.endsWith(":") || text.endsWith("/") || text.endsWith(" ") ? "" : " ";
                        slot.kronosControls.replace(range.from, range.to, text + suffix);
                    } else {
                        slot.kronosControls.insert(text);
                    }
                    scheduleCompletion();
                });
                return row;
            }));
            if (!items.length) {
                closeCompletion();
                return;
            }
            if (!panel.picker.matches(":popover-open")) panel.picker.showPopover();
            showCompletion(panel);
        };
        const scheduleCompletion = () => {
            if (disposed) return;
            for (const slot of composerSlots()) {
                const panel = composerPanels.get(slot);
                const range = readTrigger(slot);
                if (!panel || !range) continue;
                if (activeCompletion?.slot === slot && JSON.stringify(activeCompletion.range) === JSON.stringify(range)) return;
                closeCompletion();
                const requestId = ++completionId;
                const timer = setTimeout(() => emit({
                    type: "composer-complete", conversationId: panel.id, requestId,
                    trigger: range.trigger, query: range.query,
                }), 90);
                activeCompletion = { slot, panel, range, requestId, timer };
                return;
            }
            closeCompletion();
        };
        const completionInput = () => queueMicrotask(scheduleCompletion);
        const completionKeyUp = (event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) scheduleCompletion();
        };
        const completionKeyDown = (event) => {
            const state = activeCompletion;
            if (!state?.panel.picker.matches(":popover-open") || event.isComposing) return;
            if (event.key === "Escape") closeCompletion();
            else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                const rows = [...state.panel.picker.querySelectorAll("button")];
                rows[state.index]?.removeAttribute("aria-pressed");
                const direction = event.key === "ArrowDown" ? 1 : -1;
                state.index = state.index < 0 ? (direction > 0 ? 0 : rows.length - 1) :
                    (state.index + direction + rows.length) % rows.length;
                rows[state.index]?.setAttribute("aria-pressed", "true");
                rows[state.index]?.scrollIntoView({ block: "nearest" });
            } else if ((event.key === "Enter" || event.key === "Tab") && state.index >= 0) {
                state.panel.picker.querySelectorAll("button")[state.index]?.click();
            } else {
                if (event.key === "Tab" || event.key === "Enter") closeCompletion();
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        document.addEventListener("input", completionInput);
        document.addEventListener("keyup", completionKeyUp);
        document.addEventListener("keydown", completionKeyDown, true);
        const closeInspector = () => emit({ type: "close-workspace-inspector" });
        view.__kronosCloseInspector = closeInspector;
        let voiceId;
        let voiceStatus = {};
        const composerSlots = () => [...document.querySelectorAll("[data-kronos-pen-composer-controls]")]
            .filter((slot) => slot.dataset && slot.getClientRects().length);
        const icon = (path) => {
            const ns = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(ns, "svg");
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("fill", "none");
            svg.setAttribute("stroke", "currentColor");
            svg.setAttribute("stroke-linecap", "round");
            svg.setAttribute("stroke-linejoin", "round");
            const shape = document.createElementNS(ns, "path");
            shape.setAttribute("d", path);
            svg.append(shape);
            return svg;
        };
        const refreshVoiceButtons = () => {
            for (const slot of composerSlots()) {
                const panel = composerPanels.get(slot);
                if (!panel) continue;
                const status = slot.dataset.kronosPenComposerControls === voiceId ? voiceStatus : {};
                panel.speech.setAttribute("aria-pressed", String(Boolean(status.active)));
                panel.speech.setAttribute("aria-label", status.active ? "End voice conversation" : "Start voice conversation");
                panel.speech.title = panel.speech.getAttribute("aria-label");
                panel.speech.disabled = Boolean(status.dictation && status.dictation !== "idle");
                panel.mic.setAttribute("aria-pressed", String(status.dictation === "recording"));
                panel.mic.setAttribute("aria-label", status.dictation === "recording" ? "Stop dictation" :
                    status.dictation === "transcribing" ? "Transcribing dictation" : "Voice dictation");
                panel.mic.title = panel.mic.getAttribute("aria-label");
                panel.mic.disabled = Boolean(status.active || status.dictation === "transcribing");
                const notice = status.error || "";
                if (panel.notice.textContent !== notice) panel.notice.textContent = notice;
            }
        };
        const mountComposerControls = (slot) => {
            const id = slot.dataset.kronosPenComposerControls;
            const voice = (action) => {
                if (voiceId && voiceId !== id) emit({ type: "composer-voice", conversationId: voiceId, action: "cancel" });
                voiceId = id;
                voiceStatus = { ...voiceStatus, error: "" };
                refreshVoiceButtons();
                emit({ type: "composer-voice", conversationId: id, action });
            };
            const button = (label, path, activate) => {
                const control = document.createElement("button");
                control.type = "button";
                control.title = label;
                control.setAttribute("aria-label", label);
                control.append(icon(path));
                control.addEventListener("click", activate);
                return control;
            };
            const speech = button("Start voice conversation", "M2 6v4 M5 3v10 M8 5v6 M11 2v12 M14 6v4", () => voice("conversation"));
            const mic = button("Voice dictation", "M6 4a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0z M4 7v1a4 4 0 0 0 8 0V7 M8 12v2", () => voice("dictation"));
            speech.setAttribute("aria-pressed", "false");
            mic.setAttribute("aria-pressed", "false");
            const sandbox = document.createElement("div");
            sandbox.popover = "auto";
            sandbox.dataset.kronosPenSandbox = "";
            sandbox.setAttribute("role", "dialog");
            sandbox.setAttribute("aria-label", "Sandbox computer");
            const requestSandbox = (action, desktopId, mode) => {
                sandbox.textContent = action === "list" ? "Loading computers…" : "Updating computer…";
                emit({ type: "composer-sandbox", conversationId: id, action, desktopId, mode });
            };
            const computer = button("Choose sandbox computer", "M2 3h12v8H2z M6 14h4 M8 11v3", () => {
                if (sandbox.matches(":popover-open")) {
                    sandbox.hidePopover();
                    return;
                }
                const rect = computer.getBoundingClientRect();
                sandbox.style.right = Math.max(8, view.innerWidth - rect.right) + "px";
                const above = rect.top > view.innerHeight / 2;
                sandbox.style.top = above ? "auto" : rect.bottom + 6 + "px";
                sandbox.style.bottom = above ? view.innerHeight - rect.top + 6 + "px" : "auto";
                sandbox.showPopover();
                requestSandbox("list");
            });
            computer.setAttribute("aria-haspopup", "dialog");
            computer.setAttribute("aria-expanded", "false");
            sandbox.addEventListener("toggle", (event) => computer.setAttribute("aria-expanded", String(event.newState === "open")));
            const notice = document.createElement("span");
            notice.dataset.kronosPenVoiceNotice = "";
            notice.setAttribute("role", "status");
            const picker = document.createElement("div");
            picker.popover = "auto";
            picker.dataset.kronosPenSandbox = "";
            picker.dataset.kronosPenCompletions = "";
            picker.setAttribute("role", "dialog");
            picker.setAttribute("aria-label", "Hermes chat tools and suggestions");
            picker.addEventListener("toggle", () => {
                tools.setAttribute("aria-expanded", String(picker.matches(":popover-open")));
                if (activeCompletion?.panel.picker === picker && !picker.matches(":popover-open")) closeCompletion();
            });
            const tools = button("Hermes chat tools", "M2 4h12 M2 8h12 M2 12h12 M5 2v4 M10 6v4 M7 10v4", () => {
                const wasOpen = picker.matches(":popover-open");
                closeCompletion();
                if (wasOpen) return;
                activeCompletion = { slot, panel: composerPanels.get(slot) };
                renderCompletions([
                    { text: "/", display: "Hermes commands" },
                    { text: "@tool:", display: "Tools" },
                    { text: "@file:", display: "Files" },
                    { text: "@folder:", display: "Folders" },
                    { text: "@widget:", display: "Workspace widgets" },
                    { text: "@app:", display: "Apps" },
                    { text: "@url:", display: "URLs" },
                    { text: "@image:", display: "Images" },
                    { text: "@git:", display: "Git references" },
                    { text: "@diff ", display: "Git diff" },
                ]);
            });
            tools.setAttribute("aria-haspopup", "dialog");
            tools.setAttribute("aria-expanded", "false");
            tools.addEventListener("mousedown", (event) => event.preventDefault());
            slot.replaceChildren(tools, computer, mic, speech, picker, sandbox, notice);
            composerPanels.set(slot, { id, speech, mic, computer, sandbox, notice, requestSandbox, tools, picker });
        };
        const refreshComposerControls = () => {
            const slots = composerSlots();
            for (const slot of slots) {
                if (composerPanels.get(slot)?.id !== slot.dataset.kronosPenComposerControls)
                    mountComposerControls(slot);
            }
            if (voiceId && !slots.some((slot) => slot.dataset.kronosPenComposerControls === voiceId)) {
                emit({ type: "composer-voice", conversationId: voiceId, action: "cancel" });
                voiceId = undefined;
                voiceStatus = {};
            }
            refreshVoiceButtons();
        };
        let systemControls;
        let historyExtras;
        const renderedHistory = new WeakMap();
        const announcedHistory = new WeakSet();
        const renderHistoryExtras = () => {
            if (!historyExtras) return;
            const { telegram = [], jobs = [], profiles = [], activeProfile } = historyExtras;
            for (const slot of document.querySelectorAll("[data-kronos-pen-history-extras]")) {
                if (!slot.dataset || renderedHistory.get(slot) === historyExtras) continue;
                renderedHistory.set(slot, historyExtras);
                const open = new Set([...slot.querySelectorAll("details[open]")].map((item) => item.dataset.section));
                slot.replaceChildren();
                const section = (label, rows, activate) => {
                    if (!rows.length) return;
                    const details = document.createElement("details");
                    details.dataset.section = label;
                    details.open = open.has(label);
                    const summary = document.createElement("summary");
                    summary.textContent = label;
                    details.append(summary);
                    for (const row of rows) {
                        const button = libraryButton(row.title, () => activate(row));
                        if (row.nextRun && row.enabled) {
                            const next = new Date(row.nextRun);
                            if (Number.isFinite(next.getTime())) {
                                const time = document.createElement("span");
                                time.textContent = next.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
                                button.append(time);
                            }
                        }
                        details.append(button);
                    }
                    slot.append(details);
                };
                section("Telegram", telegram, ({ id }) => {
                    options.openTelegram?.(id, (result) => {
                        if (!slot.isConnected) return;
                        if (!result.error) slot.kronosOpenTelegram?.(result);
                        else {
                            const status = document.createElement("p");
                            status.setAttribute("role", "status");
                            status.textContent = result.error;
                            slot.append(status);
                        }
                    });
                });
                section("Cron jobs", jobs, ({ id }) => emit({ type: "history-cron-open", jobId: id }));
            }
            for (const slot of document.querySelectorAll("[data-kronos-pen-profile-footer]")) {
                if (!slot.dataset || renderedHistory.get(slot) === historyExtras) continue;
                renderedHistory.set(slot, historyExtras);
                slot.replaceChildren();
                if (!profiles.length) continue;
                const label = document.createElement("label");
                label.textContent = "Profile";
                const select = document.createElement("select");
                select.setAttribute("aria-label", "Hermes profile");
                for (const { id, title } of profiles) {
                    const option = document.createElement("option");
                    option.value = id;
                    option.textContent = title;
                    select.append(option);
                }
                select.value = activeProfile;
                select.addEventListener("change", () => emit({ type: "history-profile-select", profile: select.value }));
                label.append(select);
                slot.append(label);
            }
        };
        const workerRows = new Map();
        const renderedWorkers = new WeakMap();
        const refreshWorkers = () => {
            for (const slot of document.querySelectorAll("[data-kronos-pen-workers]")) {
                if (!slot.dataset) continue;
                const rows = workerRows.get(slot.dataset.kronosPenWorkers);
                if (renderedWorkers.get(slot) === rows) continue;
                renderedWorkers.set(slot, rows);
                slot.replaceChildren();
                for (const { id, goal, status, detail } of rows ?? []) {
                    const card = document.createElement("button");
                    card.type = "button";
                    card.title = detail || "View subagent activity";
                    card.setAttribute("aria-haspopup", "dialog");
                    card.addEventListener("click", () => emit({
                        type: "subagent-theater", conversationId: slot.dataset.kronosPenWorkers, workerId: id,
                    }));
                    const title = document.createElement("span");
                    title.textContent = goal || "Subagent";
                    const state = document.createElement("span");
                    state.textContent = status;
                    card.append(title, state);
                    slot.append(card);
                }
            }
        };
        const renderLibraries = {
            assets: "Media Assets",
            workflows: "Workflows",
            apps: "Apps",
            "job-history": "Job History",
            nodes: "Nodes",
            models: "Model Library",
        };
        const libraryButton = (label, activate) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", activate);
            return button;
        };
        const renderWorkflows = () => {
            if (!workflowContent) return;
            const { folders = [], workflows = [], running, error } = workflowSnapshot ?? {};
            workflowContent.replaceChildren();
            const message = error || (!workflowSnapshot ? "Loading workflows…" :
                !running && !workflows.length ? "Open KronFlow to connect the workflow runtime." :
                !workflows.length ? "No workflows yet." : "");
            if (message) {
                const status = document.createElement("p");
                status.setAttribute("role", "status");
                status.textContent = message;
                workflowContent.append(status);
            }
            const addWorkflow = (parent, workflow) => parent.append(libraryButton(workflow.name, () =>
                emit({ type: "workflow-library-open", workflowId: workflow.id })
            ));
            const filed = new Set();
            for (const folder of folders) {
                const group = document.createElement("details");
                const summary = document.createElement("summary");
                summary.textContent = folder.name;
                group.append(summary);
                const ids = new Set(folder.workflowIds);
                for (const workflow of workflows) {
                    if (!ids.has(workflow.id)) continue;
                    addWorkflow(group, workflow);
                    filed.add(workflow.id);
                }
                workflowContent.append(group);
            }
            for (const workflow of workflows) {
                if (!filed.has(workflow.id)) addWorkflow(workflowContent, workflow);
            }
            workflowContent.append(
                libraryButton("Open KronFlow", () => emit({ type: "workspace-navigation", mode: "workflows" })),
                libraryButton("Refresh workflows", () => emit({ type: "workflow-library-load" }))
            );
        };
        let botSnapshot;
        let botPanel;
        const renderBots = () => {
            if (!botPanel) return;
            const { input, list, status, slot } = botPanel;
            const query = input.value.trim().toLowerCase().replace(/^@/, "");
            const rows = (botSnapshot?.rows ?? []).filter(({ title, handle }) =>
                title.toLowerCase().includes(query) || handle.toLowerCase().includes(query)
            );
            list.replaceChildren();
            status.textContent = botSnapshot?.error || (!botSnapshot ? "Loading bots…" :
                !rows.length ? query ? "No matching bots." : "No bots yet." : "");
            for (const { id, title, handle, preview } of rows) {
                const button = libraryButton(title, () => {
                    if (botPanel.opening) return;
                    const panel = botPanel;
                    panel.opening = true;
                    status.textContent = "Opening chat…";
                    options.openBot?.(id, (result) => {
                        if (botPanel !== panel || !slot.isConnected) return;
                        panel.opening = false;
                        if (result.error) status.textContent = result.error;
                        else slot.kronosOpenBotChat?.(result);
                    });
                });
                button.dataset.kronosPenBot = "";
                const handleLabel = document.createElement("span");
                handleLabel.textContent = "@" + handle;
                const caption = document.createElement("span");
                caption.textContent = preview;
                button.append(handleLabel, caption);
                list.append(button);
            }
        };
        const mountBots = (slot) => {
            const input = document.createElement("input");
            input.type = "search";
            input.placeholder = "Search bots…";
            input.setAttribute("aria-label", "Search bots");
            input.addEventListener("input", renderBots);
            const status = document.createElement("p");
            status.setAttribute("role", "status");
            const list = document.createElement("div");
            botPanel = { slot, input, status, list };
            libraries.append(input, status, list, libraryButton("Refresh bots", () => emit({ type: "bot-roster-load" })));
            renderBots();
            emit({ type: "bot-roster-load" });
        };
        const mountLibrary = (slot) => {
            libraries?.remove();
            workflowContent = undefined;
            botPanel = undefined;
            libraries = document.createElement("div");
            libraries.dataset.kronosPenLibraries = "";
            slot.append(libraries);
            if (slot.dataset.kronosPenLibraryPanel === "Bots") {
                mountBots(slot);
                return;
            }
            if (slot.dataset.kronosPenLibraryPanel === "KronFlow") {
                workflowContent = libraries;
                renderWorkflows();
                emit({ type: "workflow-library-load" });
                return;
            }
            for (const [library, label] of Object.entries(renderLibraries)) {
                libraries.append(libraryButton(label, () => emit({ type: "render-library-open", library })));
            }
        };
        let selectedMode = "sessions";
        const navigationLabels = {
            sessions: "Sessions",
            workflows: "KronFlow",
            comfy: "KronRender",
        };
        const selectNavigation = (mode) => {
            selectedMode = mode;
            navigation?.querySelectorAll("button").forEach((button) => {
                button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
            });
        };
        const createdAt = Date.now();
        const style = document.createElement("style");
        style.id = "kronos-pen-shell-layout";
        style.textContent = `
            button[aria-label="pen.dev menu"], button[aria-label="Goodies"] { display: none !important; }
            [data-kronos-pen-action] {
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
            }
            [data-kronos-pen-action]:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
            :is([data-titlebar-left="true"], [data-titlebar-right="true"], [data-kronos-pen-navigation]) {
                translate: 0 -6px;
            }
            ${view.navigator?.platform?.startsWith("Mac") ? `
                [data-titlebar-left="true"] { margin-inline-start: 72px; }
            ` : ""}
            [data-titlebar-left="true"]:has(+ [data-kronos-pen-navigation]) {
                max-inline-size: min(168px, 24%);
                min-inline-size: 0;
                padding-inline: 7px;
            }
            [data-titlebar-left="true"]:has(+ [data-kronos-pen-navigation]) > .mx-2 { margin-inline: 4px; }
            [data-titlebar-left="true"]:has(+ [data-kronos-pen-navigation]) span.text-muted-foreground { display: none; }
            [data-kronos-pen-navigation] {
                margin-inline-end: auto; padding-inline: 5px; gap: 2px;
                min-width: 0; flex-shrink: 1; overflow-x: auto; scrollbar-width: none;
            }
            [data-kronos-pen-navigation] button {
                flex: none; border-radius: 999px; padding: 4px 8px; white-space: nowrap;
                font-size: 12px; cursor: pointer; color: var(--foreground);
            }
            [data-kronos-pen-navigation] button:hover,
            [data-kronos-pen-navigation] button[aria-pressed="true"] {
                background: color-mix(in srgb, currentColor 10%, transparent);
            }
            [data-kronos-pen-composer-controls] { position: relative; display: flex; align-items: center; gap: 1px; flex: none; }
            [data-kronos-pen-composer-controls] > button {
                display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px;
                color: var(--muted-foreground); cursor: pointer;
            }
            [data-kronos-pen-composer-controls] > button svg { width: 15px; height: 15px; }
            [data-kronos-pen-composer-controls] > button:hover,
            [data-kronos-pen-composer-controls] > button[aria-pressed="true"] {
                color: var(--foreground); background: var(--control-hover, color-mix(in srgb, currentColor 10%, transparent));
            }
            [data-kronos-pen-composer-controls] > button:disabled { opacity: .45; cursor: default; }
            [data-kronos-pen-sandbox] {
                position: fixed; inset: auto; margin: 0; width: min(250px, calc(100vw - 16px)); max-height: 50vh;
                padding: 7px; border-radius: 10px; border: 1px solid var(--border); font-size: 12px; overflow: auto;
                background: var(--island, var(--background)); color: var(--foreground); box-shadow: var(--shadow-island);
            }
            [data-kronos-pen-sandbox] button {
                display: block; padding: 5px 6px; width: 100%; text-align: start; border-radius: 5px; cursor: pointer;
            }
            [data-kronos-pen-completions] { width: min(320px, calc(100vw - 16px)); }
            [data-kronos-pen-completions] button span,
            [data-kronos-pen-completions] button small { display: block; overflow-wrap: anywhere; }
            [data-kronos-pen-completions] button small { opacity: .7; }
            [data-kronos-pen-sandbox] button:hover,
            [data-kronos-pen-sandbox] button[aria-pressed="true"] { background: color-mix(in srgb, currentColor 10%, transparent); }
            [data-kronos-pen-voice-notice]:not(:empty) {
                position: absolute; bottom: 100%; right: 0; width: 210px; z-index: 10; padding: 6px;
                border: 1px solid var(--border); border-radius: 6px; background: var(--island); font-size: 11px;
            }
            [data-kronos-floating-chat] { translate: var(--kronos-chat-offset); }
            [data-kronos-pen-drag-chat] {
                position: absolute; z-index: 3; left: 50%; top: 0; translate: -50% 0;
                width: 68px; height: 18px; display: grid; place-items: center; cursor: grab !important;
                touch-action: none; border-radius: 8px;
            }
            [data-kronos-pen-drag-chat]:active { cursor: grabbing !important; }
            [data-kronos-chat-dock-target] [data-kronos-pen-drag-chat] {
                outline: 1px solid var(--ring, currentColor);
                outline-offset: -2px;
            }
            [data-kronos-pen-drag-chat] span {
                width: 24px; height: 2px; border-radius: 3px; background: currentColor; opacity: .3;
            }
            [data-kronos-pen-drag-chat]:hover span,
            [data-kronos-pen-drag-chat]:focus-visible span { opacity: .8; }
            [data-kronos-pen-inspector] {
                border: 1px solid var(--border); border-radius: 12px;
                background: var(--island, var(--background)); color: var(--foreground);
                pointer-events: auto; overflow: hidden; margin: 4px;
                font-size: 12px;
            }
            .kronos-pen-empty-inspector div:has([data-kronos-pen-inspector-slot]) {
                height: 100%; min-height: 0;
            }
            .kronos-pen-empty-inspector [data-slot="card-content"] > .text-xxs,
            .kronos-pen-empty-inspector [data-kronos-pen-inspector-slot],
            .kronos-pen-empty-inspector [data-kronos-pen-inspector] {
                display: flex; flex-direction: column; flex: 1; min-height: 0;
            }
            .kronos-pen-empty-inspector [data-slot="card-content"] > .text-xxs > :first-child,
            .kronos-pen-empty-inspector [data-kronos-pen-inspector-tabs] { flex: none; }
            .kronos-pen-empty-inspector [data-kronos-pen-inspector] > :not([hidden]):not([data-kronos-pen-inspector-tabs]) {
                flex: 1; min-height: 0; max-height: none;
            }
            [data-kronos-pen-inspector-tabs], [data-kronos-pen-file-bar] {
                display: flex; gap: 4px; padding: 4px;
            }
            [data-kronos-pen-inspector-tabs] { border-bottom: 1px solid var(--border); }
            [data-kronos-pen-inspector] button {
                text-align: start; padding: 4px 6px; border-radius: 5px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
            }
            [data-kronos-pen-inspector] button:hover,
            [data-kronos-pen-inspector] button[aria-pressed="true"] {
                background: color-mix(in srgb, currentColor 10%, transparent);
            }
            [data-kronos-pen-file-panel], [data-kronos-pen-render-controls] { max-height: min(420px, 48vh); overflow: auto; padding: 5px; }
            [data-kronos-pen-file-panel] > button { display: block; width: 100%; }
            [data-kronos-pen-file-panel] :is(h3, p) { overflow-wrap: anywhere; padding: 4px; }
            [data-kronos-pen-file-panel] pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 4px; }
            [data-kronos-pen-render-controls] section { display: flex; flex-wrap: wrap; gap: 4px; }
            [data-kronos-pen-render-controls] input:not([hidden]) { border: 1px solid var(--border); max-width: 100%; padding: 4px; }
            [data-kronos-pen-history-extras]:not(:empty),
            [data-kronos-pen-profile-footer]:not(:empty) {
                border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
                padding: 5px 6px; font-size: 12px;
            }
            [data-kronos-pen-history-extras] summary,
            [data-kronos-pen-history-extras] button {
                width: 100%; padding: 4px 6px; border-radius: 5px; text-align: start; cursor: pointer;
            }
            [data-kronos-pen-history-extras] button { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
            [data-kronos-pen-history-extras] button span { flex: none; opacity: .65; font-size: 10px; }
            [data-kronos-pen-history-extras] button:hover,
            [data-kronos-pen-history-extras] summary:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
            [data-kronos-pen-profile-footer] { flex-shrink: 0; }
            [data-kronos-pen-profile-footer] label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            [data-kronos-pen-profile-footer] select {
                max-width: 65%; border: 1px solid var(--border); border-radius: 5px; padding: 3px 6px;
                color: var(--foreground); background: var(--island, var(--background)); cursor: pointer;
            }
            [data-titlebar-right="true"]:has(> [data-kronos-pen-system-controls]) {
                min-width: 0; flex-shrink: 1; max-width: 64%; gap: 4px;
            }
            [data-kronos-pen-system-controls] { min-width: 0; overflow-x: auto; scrollbar-width: none; }
            [data-kronos-pen-system-controls] :is([role="toolbar"], nav, [role="group"], [role="group"] span) {
                display: flex; align-items: center; gap: 3px; white-space: nowrap;
            }
            [data-kronos-pen-system-controls] button {
                display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 4px;
                height: 28px; min-width: 26px; padding-inline: 5px; border-radius: 6px; cursor: pointer; font-size: 12px;
            }
            [data-kronos-pen-system-controls] button:hover,
            [data-kronos-pen-system-controls] button[aria-pressed="true"] {
                background: color-mix(in srgb, currentColor 10%, transparent);
            }
            [data-kronos-pen-system-controls] svg { height: 15px; width: 15px; flex: none; }
            [data-kronos-pen-system-controls] :is(kbd, .os-shell-status-value) { font-size: 10px; }
            [data-kronos-pen-workers]:not(:empty) {
                display: grid; gap: 3px; padding: 4px 10px; max-height: 100px; overflow: auto; font-size: 11px;
            }
            [data-kronos-pen-workers] button { border-radius: 6px; background: color-mix(in srgb, currentColor 5%, transparent); }
            [data-kronos-pen-workers] button {
                display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 6px; cursor: pointer;
            }
            [data-kronos-pen-workers] button span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            [data-kronos-pen-workers] button span:last-child { opacity: .65; text-transform: capitalize; }
            [data-kronos-pen-libraries] {
                padding: 4px 6px; font-size: 12px;
                color: var(--foreground);
            }
            [data-kronos-pen-libraries] summary,
            [data-kronos-pen-libraries] button {
                display: block; width: 100%; padding: 4px 6px; border-radius: 4px;
                text-align: start; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            [data-kronos-pen-libraries] summary::before { content: "›"; margin-inline-end: 6px; }
            [data-kronos-pen-libraries] details[open] > summary::before { content: "⌄"; }
            [data-kronos-pen-libraries] summary:hover,
            [data-kronos-pen-libraries] button:hover {
                background: color-mix(in srgb, currentColor 10%, transparent);
            }
            [data-kronos-pen-libraries] details button { padding-inline-start: 18px; }
            [data-kronos-pen-libraries] p:not(:empty) { padding: 4px 6px; opacity: .7; }
            .sidebar-tab-switcher:has(button[aria-label="Bots"]) {
                overflow-x: auto; scrollbar-width: none;
            }
            [data-kronos-pen-libraries] input {
                width: 100%; margin-block: 4px; border: 1px solid var(--border);
                border-radius: 5px; padding: 5px 7px; background: transparent;
            }
            [data-kronos-pen-bot] span { margin-inline-start: 5px; opacity: .65; }
            [data-kronos-pen-bot] span:last-child { display: block; margin-inline-start: 0; overflow: hidden; text-overflow: ellipsis; }
            [data-kronos-pen-tools] { position: relative; display: grid; justify-items: center; }
            [data-kronos-pen-tools]:empty { display: none; }
            [data-kronos-v2-workflow-tools] { position: relative; }
            [data-kronos-v2-workflow-tools] > summary {
                display: grid; place-items: center; list-style: none; width: 32px; height: 32px;
                cursor: pointer; border-radius: 7px;
            }
            [data-kronos-v2-workflow-tools] > summary::-webkit-details-marker { display: none; }
            [data-kronos-v2-workflow-tools] > summary:hover,
            [data-kronos-v2-workflow-tools][open] > summary {
                background: color-mix(in srgb, currentColor 12%, transparent);
            }
            [data-kronos-v2-workflow-tools] > summary:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
            .kronos-v2-workflow-tool-popover {
                position: absolute; left: calc(100% + 8px); bottom: 0; z-index: 3;
                padding: 6px; width: max-content; max-width: min(368px, 54vw);
                border: 1px solid var(--border); border-radius: 10px; background: var(--island, var(--background));
                color: var(--foreground); pointer-events: auto;
            }
            [data-kronos-pen-tools] .os-canvas-tool-rail {
                position: absolute; left: calc(100% + 6px); top: 0; z-index: 2;
                display: flex; flex-direction: column; gap: 4px; padding: 4px;
                border-radius: 8px; background: var(--island, var(--background)); color: var(--foreground);
                max-height: min(420px, 50vh); overflow: auto; width: max-content;
            }
            [data-kronos-pen-tools] .os-canvas-tool-rail.is-closed { visibility: hidden; pointer-events: none; }
            [data-kronos-pen-tools] [role="toolbar"] { display: grid; gap: 2px; }
            [data-kronos-pen-tools] button {
                display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px;
                cursor: pointer;
            }
            [data-kronos-pen-tools] button:hover, [data-kronos-pen-tools] button[aria-pressed="true"] {
                background: color-mix(in srgb, currentColor 12%, transparent);
            }
            [data-kronos-pen-tools] button svg { width: 16px; height: 16px; }
        `;
        document.head.append(style);
        const refresh = () => {
            scheduled = undefined;
            if (disposed) return;
            if (floatingChat && !floatingChat.panel.querySelector("[data-kronos-pen-drag-chat]")) {
                positionChat(floatingChat.panel);
                floatingChat = undefined;
            }
            refreshComposerControls();
            refreshWorkers();
            const historyFooter = document.querySelector("[data-kronos-pen-profile-footer]");
            if (historyFooter && !announcedHistory.has(historyFooter)) {
                announcedHistory.add(historyFooter);
                emit({ type: "history-extras-ready" });
            }
            renderHistoryExtras();
            const titlebarRight = document.querySelector('[data-titlebar-right="true"]');
            if (titlebarRight && systemControls?.parentElement !== titlebarRight) {
                systemControls?.remove();
                systemControls = document.createElement("div");
                systemControls.dataset.kronosPenSystemControls = "";
                titlebarRight.prepend(systemControls);
                emit({ type: "system-controls-slot" });
            } else if (!titlebarRight && systemControls) {
                systemControls.remove();
                systemControls = undefined;
                emit({ type: "system-controls-slot" });
            }
            const inspectorSlot = inspectorOpen && document.querySelector("[data-kronos-pen-inspector-slot]");
            if (inspectorSlot) {
                const activate = inspector ? null : mountInspector();
                if (inspector.parentElement !== inspectorSlot) inspectorSlot.append(inspector);
                activate?.(inspectorTab);
            } else if (!inspectorOpen && inspector) {
                inspector.remove();
                inspector = undefined;
                filePanel = undefined;
                emit({ type: "render-controls-slot" });
            }
            const titlebarLeft = document.querySelector('[data-titlebar-left="true"]');
            if (titlebarLeft && titlebarLeft.nextElementSibling !== navigation) {
                navigation?.remove();
                navigation = document.createElement("div");
                navigation.dataset.kronosPenNavigation = "";
                navigation.className = titlebarLeft.className.split(/\s+/).filter((name) => !/^p[lr]-/.test(name)).join(" ");
                navigation.setAttribute("role", "group");
                navigation.setAttribute("aria-label", "Workspace navigation");
                for (const [mode, label] of Object.entries(navigationLabels)) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.dataset.mode = mode;
                    button.textContent = label;
                    button.addEventListener("click", () => emit({ type: "workspace-navigation", mode }));
                    navigation.append(button);
                }
                selectNavigation(selectedMode);
                titlebarLeft.after(navigation);
            }
            const librarySlot = document.querySelector("[data-kronos-pen-library-panel]");
            if (librarySlot && (libraries?.parentElement !== librarySlot ||
                libraries.dataset.panel !== librarySlot.dataset.kronosPenLibraryPanel)) {
                mountLibrary(librarySlot);
                libraries.dataset.panel = librarySlot.dataset.kronosPenLibraryPanel;
            } else if (!librarySlot && libraries) {
                libraries.remove();
                libraries = undefined;
                workflowContent = undefined;
                botPanel = undefined;
            }
            const toolbar =
                document.querySelector("[data-kronos-pen-primary-tools]") ??
                document.querySelector(".tools-panel.relative > [data-kronos-pen-tools]")?.parentElement ??
                document.querySelector('button[aria-label="Move"]')?.closest(".tools-panel.relative");
            if (toolbar && toolsSlot?.parentElement !== toolbar) {
                toolsSlot?.remove();
                toolsSlot = document.createElement("div");
                toolsSlot.dataset.kronosPenTools = "";
                toolbar.append(toolsSlot);
                emit({ type: "tools-slot" });
            }
            if (!toolbar && toolsSlot) {
                toolsSlot.remove();
                toolsSlot = undefined;
                emit({ type: "tools-slot" });
            }
            const components = document.querySelector('input[placeholder="Search components…"]');
            const panel = components?.parentElement.parentElement.parentElement;
            if (panel && !panel.querySelector('[data-kronos-pen-action="kit"]')) {
                const kit = document.createElement("button");
                kit.type = "button";
                kit.dataset.kronosPenAction = "kit";
                kit.textContent = "Add KronOS components";
                components.parentElement.parentElement.after(kit);
            }
            const open = [
                ...document.querySelectorAll(
                    '[role="dialog"],[role="menu"],[role="listbox"],[data-slot="popover-content"]'
                ),
            ].some((element) => {
                if (element.getAttribute("data-state") === "closed") return false;
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && view.getComputedStyle(element).visibility !== "hidden";
            });
            if (open !== overlayOpen) {
                overlayOpen = open;
                emit({ type: "native-overlay", open });
            }
        };
        const schedule = () => {
            if (scheduled == null && !disposed) scheduled = view.requestAnimationFrame(refresh);
        };
        const chatEvents = [
            ["pointerdown", startChatDrag], ["pointermove", moveChatDrag], ["pointerup", finishChatDrag],
            ["pointercancel", finishChatDrag], ["lostpointercapture", finishChatDrag],
            ["dblclick", dockChat], ["keydown", dockChat],
        ];
        for (const [name, listener] of chatEvents) document.addEventListener(name, listener, true);
        view.addEventListener?.("resize", fitFloatingChat);
        scene.eventEmitter?.on("selectionChangeDebounced", schedule);
        const mutations = new view.MutationObserver(schedule);
        mutations.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "data-state", "data-kronos-pen-library-panel", "data-kronos-pen-composer-controls"],
        });
        const click = (event) => {
            const button = event.target?.closest?.("button");
            if (!button) return;
            let type;
            if (button.getAttribute("aria-label") === "Settings") type = "open-settings";
            if (button.dataset.kronosPenAction === "kit") {
                event.preventDefault();
                event.stopImmediatePropagation();
                try {
                    openKit();
                } catch (error) {
                    emit({ type: "storage-error", error: error.message });
                }
                return;
            }
            if (!type) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            emit({ type });
        };
        document.addEventListener("click", click, true);
        const uri = (id) => `file:///kronos/${encodeURIComponent(id)}/untitled.pen`;
        const kitURI = () => `kronos://design-system/${encodeURIComponent(context.workspaceId)}`;
        const escape = (value) =>
            String(value).replace(
                /[&<>"']/g,
                (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]
            );
        const color = (value, fallback) => {
            if (!value || !view.CSS.supports("color", value)) return fallback;
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const paint = canvas.getContext("2d", { willReadFrequently: true });
            paint.fillStyle = value;
            paint.fillRect(0, 0, 1, 1);
            return `#${Array.from(paint.getImageData(0, 0, 1, 1).data.slice(0, 3), (channel) => channel.toString(16).padStart(2, "0")).join("")}`;
        };
        const colors = () => ({
            background: color(context.appearance.background, "#181818"),
            accent: color(context.appearance.accent, "#8875ff"),
        });
        const preview = (name, description) => {
            const palette = colors();
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${palette.background}"/><rect x="36" y="36" width="568" height="44" rx="8" fill="#000"/><rect x="36" y="104" width="172" height="256" rx="12" fill="${palette.accent}"/><rect x="232" y="104" width="372" height="256" rx="12" fill="#ffffff" fill-opacity=".08"/><text x="256" y="158" fill="#fff" font-family="system-ui,sans-serif" font-size="24">${escape(name).slice(0, 160)}</text><text x="256" y="194" fill="#b6b6b6" font-family="system-ui,sans-serif" font-size="15">${escape(description).slice(0, 180)}</text></svg>`;
            return { kind: 1, url: `data:image/svg+xml,${encodeURIComponent(svg)}` };
        };
        const documents = () => {
            const spaces = context.spaces.length
                ? context.spaces
                : [{ id: context.workspaceId, title: context.workspaceName }];
            return [
                ...spaces.map((space, index) => ({
                    uri: uri(space.id),
                    kronosWorkspace: true,
                    kind: 0,
                    name: space.title || "KronOS workspace",
                    description:
                        space.id === context.workspaceId
                            ? `${context.widgets.length} live apps - Current workspace`
                            : "KronOS workspace",
                    preview: /^data:image\/(?:png|jpeg|webp);base64,/.test(space.previewUrl)
                        ? { kind: 1, url: space.previewUrl }
                        : preview(space.title || "KronOS", "Live workspace canvas"),
                    timestamps: { createdAt, lastEditedAt: createdAt, lastOpenedAt: createdAt - index },
                })),
                {
                    uri: kitURI(),
                    kind: 2,
                    name: "KronOS design system",
                    description: "Workspace colors, components, and live app references",
                    preview: preview("KronOS", "Your workspace design system"),
                },
            ];
        };
        const closeDashboard = () => {
            for (const dialog of document.querySelectorAll('[role="dialog"]')) {
                if (!dialog.querySelector("[data-dashboard-actions]")) continue;
                [...dialog.querySelectorAll("button")]
                    .find((button) => button.textContent?.trim() === "Close")
                    ?.click();
            }
        };
        const openKit = () => {
            const graph = scene.scenegraph;
            let frame = [...graph.nodes].find(
                (node) => node.properties.resolved.metadata?.type === "kronos-design-system"
            );
            if (!frame) {
                const palette = colors();
                const position = graph.findEmptySpaceOnCanvas(undefined, 760, 440, 100, "right");
                const update = graph.beginUpdate();
                if (!update) throw new Error("The canvas is not ready to add the design system.");
                const text = (name, content, x, y, width, fontSize = 16) => ({
                    type: "text",
                    name,
                    content,
                    x,
                    y,
                    width,
                    height: 28,
                    fontSize,
                    fontFamily: "Inter",
                    fill: "#eeeeee",
                });
                try {
                    frame = graph.deserializePastedNode(
                        (name) => name,
                        (pair) => pair,
                        update,
                        {
                            type: "frame",
                            name: "KronOS design system",
                            x: position.x,
                            y: position.y,
                            width: 760,
                            height: 440,
                            layout: "none",
                            fill: palette.background,
                            metadata: { type: "kronos-design-system", workspaceId: context.workspaceId },
                            children: [
                                text("Title", "KronOS", 32, 28, 696, 28),
                                text("Workspace", context.workspaceName, 32, 66, 696, 14),
                                {
                                    type: "frame",
                                    name: "KronOS / Accent",
                                    reusable: true,
                                    x: 32,
                                    y: 120,
                                    width: 220,
                                    height: 100,
                                    layout: "none",
                                    fill: palette.accent,
                                    cornerRadius: 12,
                                },
                                {
                                    type: "frame",
                                    name: "KronOS / Surface",
                                    reusable: true,
                                    x: 276,
                                    y: 120,
                                    width: 220,
                                    height: 100,
                                    layout: "none",
                                    fill: palette.background,
                                    stroke: "#555555",
                                    strokeWidth: 1,
                                    cornerRadius: 12,
                                },
                                text("Accent label", `Accent ${palette.accent}`, 32, 234, 220, 13),
                                text("Surface label", `Surface ${palette.background}`, 276, 234, 220, 13),
                                ...context.widgets.slice(0, 3).map((widget, index) => ({
                                    type: "frame",
                                    name: `KronOS / ${widget.title || "Live app"}`,
                                    reusable: true,
                                    x: 32 + index * 244,
                                    y: 294,
                                    width: 220,
                                    height: 112,
                                    layout: "none",
                                    fill: "#000000",
                                    cornerRadius: 8,
                                    metadata: { type: "kronos-widget-reference", blockId: widget.blockId },
                                    children: [
                                        text("App name", widget.title || "Live app", 16, 16, 188, 14),
                                        text("App type", widget.view || "Workspace app", 16, 52, 188, 12),
                                    ],
                                })),
                            ],
                        },
                        graph.getViewportNode()
                    );
                    graph.commitBlock(update, { undo: true });
                } catch (error) {
                    graph.rollbackBlock(update);
                    throw error;
                }
            }
            closeDashboard();
            scene.selectionManager.selectNode(frame);
            graph.updateLayout();
            scene.camera.ensureVisible(frame.getWorldBounds(), { animate: true, padding: 40 });
            return { success: true, nodeId: frame.id };
        };
        refresh();
        schedule();
        return {
            updateComposerVoice(update) {
                const { conversationId, active, dictation, text, prompt, stop, error } = update;
                if (conversationId !== voiceId) return { success: false };
                const slot = composerSlots().find((slot) => slot.dataset.kronosPenComposerControls === conversationId);
                if (!slot?.kronosControls) return { success: false };
                voiceStatus = { ...voiceStatus, ...(active !== undefined && { active }),
                    ...(dictation !== undefined && { dictation }), ...(error !== undefined && { error }) };
                if (text) slot.kronosControls.insert(text);
                if (prompt) slot.kronosControls.send(prompt);
                if (stop) slot.kronosControls.stop?.();
                refreshVoiceButtons();
                return { success: true };
            },
            setComposerCompletions({ conversationId, requestId, items }) {
                if (activeCompletion?.requestId !== requestId || activeCompletion.panel.id !== conversationId) return;
                const current = readTrigger(activeCompletion.slot);
                if (JSON.stringify(current) !== JSON.stringify(activeCompletion.range)) {
                    closeCompletion();
                    return;
                }
                renderCompletions(items);
            },
            setComposerSandbox({ conversationId, desktops = [], access, error }) {
                for (const slot of composerSlots()) {
                    const panel = composerPanels.get(slot);
                    if (panel?.id !== conversationId) continue;
                    panel.computer.setAttribute("aria-pressed", String(Boolean(access?.enabled)));
                    const { sandbox, requestSandbox } = panel;
                    sandbox.replaceChildren();
                    const heading = document.createElement("p");
                    heading.textContent = error || (desktops.length ? "Sandbox computer" : "No sandbox computers available.");
                    sandbox.append(heading);
                    for (const desktop of desktops) {
                        if (desktop.status === "unavailable") continue;
                        const ready = desktop.imagePrepared || desktop.status === "running";
                        for (const mode of ready ? ["sandbox", "hybrid"] : ["sandbox"]) {
                            const label = !ready ? "Set up" : mode === "hybrid" ? "Hybrid" : "Sandbox";
                            const row = libraryButton(label + " · " + desktop.name, () => requestSandbox("select", desktop.id, mode));
                            row.setAttribute("aria-pressed", String(Boolean(access?.enabled &&
                                access.desktopId === desktop.id && (access.mode || "sandbox") === mode)));
                            sandbox.append(row);
                        }
                    }
                    if (access?.enabled) sandbox.append(libraryButton("Disable Computer mode", () => requestSandbox("disable")));
                    if (error) sandbox.append(libraryButton("Refresh computers", () => requestSandbox("list")));
                }
            },
            setAgentWorkers(conversationId, rows) {
                workerRows.delete(conversationId);
                if (Array.isArray(rows) && rows.length) {
                    workerRows.set(conversationId, rows);
                    if (workerRows.size > 20) workerRows.delete(workerRows.keys().next().value);
                }
                refreshWorkers();
            },
            setWorkspaceInspector(open) {
                if (view.__kronosInspectorOpen === open) return;
                inspectorOpen = open;
                view.__kronosInspectorOpen = open;
                view.dispatchEvent(new view.Event("kronos-pen-inspector"));
                schedule();
            },
            setFilePanel(snapshot) {
                fileSnapshot = snapshot;
                renderFiles();
            },
            setHistoryExtras(snapshot) {
                if (JSON.stringify(historyExtras) === JSON.stringify(snapshot)) return;
                historyExtras = snapshot;
                renderHistoryExtras();
            },
            setBotRoster(snapshot) {
                botSnapshot = snapshot;
                renderBots();
            },
            setWorkflowLibrary(snapshot) {
                workflowSnapshot = snapshot;
                renderWorkflows();
            },
            setNavigation(mode) {
                if (mode === "design" || Object.hasOwn(navigationLabels, mode)) selectNavigation(mode);
            },
            setContext(next) {
                if (!next || typeof next.workspaceId !== "string") throw new Error("Expected KronOS workspace context");
                context = {
                    ...context,
                    ...next,
                    spaces: Array.isArray(next.spaces)
                        ? next.spaces.filter((space) => typeof space.id === "string")
                        : context.spaces,
                    widgets: Array.isArray(next.widgets)
                        ? next.widgets.filter((widget) => typeof widget.blockId === "string")
                        : context.widgets,
                    appearance: { ...context.appearance, ...next.appearance },
                };
                scene.ipc.handleNotification({ method: "dashboard:documents-changed", payload: documents() });
                return { success: true };
            },
            handleRequest(method, payload = {}) {
                switch (method) {
                    case "documents-list":
                        return documents();
                    case "documents-previews": {
                        const currentURI = uri(context.workspaceId);
                        if (!payload.uris?.includes(currentURI)) return {};
                        const image = scene.skiaRenderer?.surface?.makeImageSnapshot();
                        if (!image) return {};
                        try {
                            return { [currentURI]: image.encodeToBytes() };
                        } finally {
                            image.delete();
                        }
                    }
                    case "documents-open": {
                        if (payload.uri === kitURI()) return openKit();
                        const space = (context.spaces.length ? context.spaces : [{ id: context.workspaceId }]).find(
                            (space) => uri(space.id) === payload.uri
                        );
                        if (!space) throw new Error("This workspace is no longer available in KronOS.");
                        closeDashboard();
                        emit({ type: "open-workspace", workspaceId: space.id });
                        return { success: true };
                    }
                    case "documents-new":
                        closeDashboard();
                        emit({ type: "new-workspace" });
                        return { success: true };
                    case "documents-remove":
                        throw new Error("Manage workspaces from the KronOS workspace menu.");
                }
            },
            dispose() {
                disposed = true;
                closeCompletion();
                document.removeEventListener("input", completionInput);
                document.removeEventListener("keyup", completionKeyUp);
                document.removeEventListener("keydown", completionKeyDown, true);
                if (view.__kronosCloseInspector === closeInspector) delete view.__kronosCloseInspector;
                if (scheduled != null) view.cancelAnimationFrame(scheduled);
                for (const [name, listener] of chatEvents) document.removeEventListener(name, listener, true);
                view.removeEventListener?.("resize", fitFloatingChat);
                scene.eventEmitter?.off("selectionChangeDebounced", schedule);
                if (voiceId) emit({ type: "composer-voice", conversationId: voiceId, action: "cancel" });
                if (chatDrag) positionChat(chatDrag.panel);
                if (floatingChat) positionChat(floatingChat.panel);
                mutations.disconnect();
                style.remove();
                toolsSlot?.remove();
                navigation?.remove();
                systemControls?.remove();
                inspector?.remove();
                if (view.__kronosInspectorOpen !== undefined) {
                    delete view.__kronosInspectorOpen;
                    view.dispatchEvent(new view.Event("kronos-pen-inspector"));
                }
                libraries?.remove();
                document.querySelectorAll("[data-kronos-pen-workers]").forEach((slot) => slot.replaceChildren?.());
                document.querySelectorAll("[data-kronos-pen-action]").forEach((button) => button.remove());
                document.removeEventListener("click", click, true);
                if (overlayOpen) emit({ type: "native-overlay", open: false });
            },
        };
    };
})();
