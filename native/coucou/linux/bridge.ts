import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { onEvent } from "./core/bridge";
import { VIEW_LAYOUTS } from "./core/layout";
import { State } from "./core/state";
import type { Island } from "./island/island";
import { h } from "./views/dom";

type Widget = { id: string; title: string; view?: string };
type Workspace = { id: string; name: string; selected: boolean };
type HudState = {
    widgets?: Widget[];
    workspaces?: Workspace[];
    activity?: { detail?: string; phase?: string; steps?: string[] };
    caption?: string;
    controlTarget?: string;
    title?: string;
    followAgent?: boolean;
    widgetDocked?: boolean;
    showChat?: boolean;
    chatExpanded?: boolean;
    chatLayout?: string;
};

let connected = false;
let state: HudState = {};
const subscribers = new Set<() => void>();
let island: Island;
let hudChat = false;
let layoutRevision = 0;
let lastLayout = "";
let measuring = false;
let surface: HTMLElement;
let chat: HTMLElement;
let preview: HTMLElement;
let screenBounds = { x: 0, y: 0, width: 1920, height: 1080 };

async function event(name: string, extra: Record<string, unknown> = {}): Promise<void> {
    await invoke("kronterm_event", {
        payload: {
            event: name,
            ...screenBounds,
            inset: 24,
            ...extra,
        },
    });
}

function action(name: string, route?: string): void {
    if (name === "chat") {
        hudChat = !hudChat;
        VIEW_LAYOUTS.prompt.height = hudChat ? 650 : 160;
        State.isPinned = true;
        island.setView(hudChat ? "prompt" : "overview");
        syncSurface();
    }
    void event("action", { action: name, ...(route ? { route } : {}) }).catch(console.error);
}

export async function bootKronTerm(host: Island): Promise<void> {
    const enabled = await invoke<boolean>("kronterm_enabled");
    if (!enabled) return;
    island = host;
    const monitor = await currentMonitor();
    if (monitor) {
        screenBounds = {
            x: monitor.position.x / monitor.scaleFactor,
            y: monitor.position.y / monitor.scaleFactor,
            width: monitor.size.width / monitor.scaleFactor,
            height: monitor.size.height / monitor.scaleFactor,
        };
    }
    connected = true;
    surface = h("div", { class: "kronterm-surface" });
    chat = h("div", { class: "kronterm-chat-space" });
    preview = h("div", { class: "kronterm-preview-space" });
    surface.append(chat, preview);
    document.getElementById("views")?.append(surface);
    await onEvent<HudState>("kronterm-state", (value) => {
        state = { ...state, ...value };
        if (value.showChat || value.chatLayout === "toggle") {
            hudChat = true;
            VIEW_LAYOUTS.prompt.height = 650;
            island.setView("prompt");
        }
        if (value.widgetDocked) {
            VIEW_LAYOUTS.overview.height = 650;
            island.setView("overview");
        }
        for (const sync of subscribers) sync();
        syncSurface();
    });
    State.subscribe(syncSurface);
    window.setInterval(() => void reportLayout(), 150);
    for (const sync of subscribers) sync();
    await event("ready");
}

function syncSurface(): void {
    if (!surface) return;
    const expanded = State.mode === "expanded";
    const docked = expanded && state.widgetDocked && ["overview", "empty"].includes(State.view);
    const showChat = expanded && ((hudChat && State.view === "prompt") || (docked && state.chatExpanded !== false));
    VIEW_LAYOUTS.overview.height = docked ? 650 : 160;
    VIEW_LAYOUTS.empty.height = docked ? 650 : 160;
    VIEW_LAYOUTS.prompt.height = hudChat ? 650 : 160;
    surface.hidden = !docked && !showChat;
    chat.hidden = !showChat;
    preview.hidden = !docked;
    surface.classList.toggle("split", !!docked);
    document.getElementById("views")?.classList.toggle("kronterm-surface-active", !surface.hidden);
    void reportLayout();
}

async function reportLayout(): Promise<void> {
    if (!connected || !surface || measuring) return;
    measuring = true;
    try {
        const win = getCurrentWindow();
        const [position, scale] = await Promise.all([win.innerPosition(), win.scaleFactor()]);
        const bounds = (el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            return {
                x: position.x / scale + rect.x,
                y: position.y / scale + rect.y,
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height),
            };
        };
        const c = bounds(chat);
        const p = bounds(preview);
        const showChat = !surface.hidden && !chat.hidden;
        const showPreview = !surface.hidden && !preview.hidden;
        const key = JSON.stringify([c, p, showChat, showPreview]);
        if (key === lastLayout) return;
        lastLayout = key;
        await event("chat-layout", {
            layoutRevision: ++layoutRevision,
            layoutReady: true,
            chatIntent: showChat,
            compactChat: false,
            splitChat: showPreview,
            contentX: c.x, contentY: c.y, contentWidth: c.width, contentHeight: c.height,
        });
        await event("preview-layout", {
            previewVisible: showPreview,
            previewX: p.x, previewY: p.y, previewWidth: p.width, previewHeight: p.height,
        });
    } catch (error) {
        console.error("KronTerm layout could not be reported", error);
    } finally {
        measuring = false;
    }
}

function button(label: string, name: string, route?: string): HTMLButtonElement {
    return h("button", {
        class: "tab kronterm-button",
        title: label,
        "aria-label": label,
        text: label,
        onclick: () => action(name, route),
    }) as HTMLButtonElement;
}

export function krontermLaunchers(): HTMLElement {
    const el = h("div", { class: "kronterm-launchers" });
    const launchers = [
        ["Browser", "web"],
        ["Terminal", "terminal"],
        ["Sandbox", "machines"],
        ["Apps", "apps"],
        ["Widgets", "widget"],
        ["HUD chat", "chat"],
        ["Exit HUD", "exit"],
    ];
    for (const [label, name] of launchers) el.append(button(label, name));
    const sync = () => {
        el.hidden = !connected;
    };
    subscribers.add(sync);
    sync();
    return el;
}

export function krontermWidgetTabs(): HTMLElement {
    const el = h("div", { class: "kronterm-widget-tabs" });
    const sync = () => {
        el.hidden = !connected;
        if (!connected) return;
        const fragment = document.createDocumentFragment();
        for (const workspace of state.workspaces ?? []) {
            const tab = button(workspace.name, `workspace-select:${workspace.id}`);
            tab.setAttribute("aria-pressed", String(workspace.selected));
            fragment.append(tab);
        }
        for (const widget of state.widgets ?? []) {
            // File presentation stays with Coucou's upstream diff card.
            if (["preview", "codeeditor", "file", "files"].includes(widget.view ?? "")) continue;
            fragment.append(button(widget.title, `preview-select:${widget.id}`));
        }
        if (state.activity?.detail || state.caption) {
            fragment.append(
                h("p", {
                    class: "kronterm-progress",
                    role: "status",
                    text: state.activity?.detail || state.caption || "",
                })
            );
        }
        if (state.controlTarget) {
            fragment.append(h("span", { text: state.controlTarget }));
            fragment.append(button("Pause", "control-pause"), button("Release", "control-release"));
        }
        const follow = button("Follow agent", "follow-agent");
        follow.setAttribute("aria-pressed", String(!!state.followAgent));
        fragment.append(follow);
        el.replaceChildren(fragment);
    };
    subscribers.add(sync);
    State.subscribe(sync);
    sync();
    return el;
}
