// @vitest-environment jsdom
import type { PaletteContribution } from "@hermes/app/command-palette/contrib";
import { registry } from "@hermes/contrib/registry";
import type { ChatMessage } from "@hermes/lib/chat-messages";
import { createClientSessionState } from "@hermes/lib/chat-runtime";
import { $krontermInspectorOpen } from "@hermes/lib/kronterm-sidebar";
import { registerCanvasChatSubmit } from "@hermes/store/quick-entry";
import { $activeSessionId, $sessions } from "@hermes/store/session";
import { $subagentsBySession, upsertSubagent } from "@hermes/store/subagents";
import { $sessionStates, sessionTileDelegate, setSessionTileDelegate } from "@hermes/store/session-states";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSPenEditor } from "./os-pen-editor";

const Palette = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@hermes/store/command-palette", () => ({ openCommandPalettePopup: Palette.open }));

const Appearance = vi.hoisted(() => ({ colorScheme: "dark", reducedMotion: true }));
vi.mock("@/app/components/system-ui", () => ({ useSystemAppearance: () => Appearance }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps one editor frame across visibility and camera changes without echoing native gestures", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let camera = { x: 20, y: 30, zoom: 1 };
    const viewport = { x: 240, y: 58, width: 800, height: 600 };
    const onCamera = vi.fn();
    const onViewport = vi.fn();
    const onCanvasInteraction = vi.fn();
    const render = async (visible: boolean) => {
        await act(async () => {
            root.render(
                <OSPenEditor
                    tabId="persistent-pen"
                    visible={visible}
                    camera={camera}
                    onCamera={onCamera}
                    onViewport={onViewport}
                    onCanvasInteraction={onCanvasInteraction}
                    widgets={[]}
                    onWidgets={vi.fn()}
                    onWidgetInteract={vi.fn()}
                    onWidgetsReady={vi.fn()}
                />
            );
        });
    };
    try {
        await render(true);
        const frame = host.querySelector("iframe");
        const frameWindow = frame.contentWindow;
        const source = frame.src;
        const origin = new URL(source).origin;
        const send = (data: Record<string, unknown>) => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    source: frameWindow,
                    origin,
                    data: { source: "kronos-pen", ...data },
                })
            );
        };
        const post = vi.spyOn(frameWindow, "postMessage").mockImplementation((data: any) => {
            if (data.method === "set_camera") camera = data.params;
            queueMicrotask(() =>
                send({
                    id: data.id,
                    result:
                        data.method === "sync_widgets" ? { widgets: [], selectedBlockIds: [] } : { camera, viewport },
                })
            );
        });
        await act(async () => send({ type: "ready" }));
        expect(onCamera).toHaveBeenLastCalledWith(camera);
        expect(post.mock.calls.filter(([data]: any) => data.method === "set_camera")).toHaveLength(1);
        camera = { x: 81, y: -20, zoom: 0.5 };
        await act(async () => send({ type: "camera", camera, viewport }));
        await render(true);
        expect(onCamera).toHaveBeenLastCalledWith(camera);
        expect(post.mock.calls.filter(([data]: any) => data.method === "set_camera")).toHaveLength(1);
        await act(async () => send({ type: "canvas-interaction" }));
        expect(onCanvasInteraction).toHaveBeenCalledOnce();
        await render(false);
        expect(host.querySelector("section").hidden).toBe(true);
        await render(true);
        expect(host.querySelector("iframe")).toBe(frame);
        expect(frame.contentWindow).toBe(frameWindow);
        expect(frame.src).toBe(source);
        expect(host.querySelector("header")).toBeNull();
        expect(host.querySelector("[data-live-block-occluder]")).toBeNull();
        post.mockRestore();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("leaves space for Pen's presentation chat and controls above live widgets", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const engine = document.createElement("iframe");
    document.body.append(engine);
    try {
        await act(async () => root.render(<OSPenEditor tabId="slide-chrome" kronosV2 visible presenting />));
        const iframe = host.querySelector("iframe");
        const editorWrapper = document.implementation.createHTMLDocument();
        vi.spyOn(editorWrapper, "querySelector").mockImplementation((selector) => selector === "#pen-editor" ? engine : null);
        vi.spyOn(iframe, "contentDocument", "get").mockReturnValue(editorWrapper);
        const chat = engine.contentDocument.createElement("div");
        chat.dataset.agentSpotlight = "";
        engine.contentDocument.body.append(chat);
        vi.spyOn(engine, "getBoundingClientRect").mockReturnValue(new DOMRect(7, 11, 800, 600));
        vi.spyOn(chat, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 510, 400, 50));
        await act(async () => {
            window.dispatchEvent(new MessageEvent("message", {
                source: iframe.contentWindow,
                origin: new URL(iframe.src).origin,
                data: { source: "kronos-pen", type: "ready" },
            }));
        });
        const occluder = host.querySelector<HTMLElement>("[data-live-block-occluder]");
        expect(occluder?.style.left).toBe("205px");
        expect(occluder?.style.top).toBe("519px");
        expect(occluder?.style.width).toBe("404px");
        await act(async () => root.render(<OSPenEditor tabId="slide-chrome" kronosV2 visible />));
        expect(host.querySelector("[data-live-block-occluder]")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        engine.remove();
        host.remove();
    }
});

it("registers native widget frames without echoing geometry or recreating the editor", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let widgets = [{ blockId: "browser", title: "Browser", x: 20, y: 30, width: 640, height: 480, visible: true }];
    const onWidgets = vi.fn();
    const onWidgetInteract = vi.fn();
    const onWidgetsReady = vi.fn();
    const camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { x: 52, y: 58, width: 900, height: 600 };
    const render = async (visible = true) =>
        act(async () => {
            root.render(
                <OSPenEditor
                    tabId="widget-pen"
                    visible={visible}
                    camera={camera}
                    onCamera={vi.fn()}
                    onViewport={vi.fn()}
                    onCanvasInteraction={vi.fn()}
                    widgets={widgets}
                    onWidgets={onWidgets}
                    onWidgetInteract={onWidgetInteract}
                    onWidgetsReady={onWidgetsReady}
                />
            );
        });
    try {
        await render();
        const frame = host.querySelector("iframe");
        const send = (data: Record<string, unknown>) =>
            window.dispatchEvent(
                new MessageEvent("message", {
                    source: frame.contentWindow,
                    origin: new URL(frame.src).origin,
                    data: { source: "kronos-pen", ...data },
                })
            );
        const post = vi.spyOn(frame.contentWindow, "postMessage").mockImplementation((data: any) => {
            const result =
                data.method === "sync_widgets"
                    ? { widgets: data.params.widgets, selectedBlockIds: [] }
                    : { camera, viewport };
            queueMicrotask(() => send({ id: data.id, result }));
        });
        await act(async () => send({ type: "ready" }));
        expect(onWidgetsReady).toHaveBeenLastCalledWith(true);
        const widgetCalls = () => post.mock.calls.filter(([data]: any) => data.method === "sync_widgets");
        expect(widgetCalls()).toHaveLength(1);
        widgets = [{ ...widgets[0], x: 210, y: 330 }];
        await act(async () => send({ type: "widgets", widgets, selectedBlockIds: ["browser"] }));
        await render();
        expect(widgetCalls()).toHaveLength(1);
        expect(onWidgets.mock.lastCall[0].widgets[0].x).toBe(210);
        await act(async () => {
            send({ type: "widget-interact", blockId: "other-workspace" });
            send({ type: "widget-interact", blockId: "browser" });
        });
        expect(onWidgetInteract).toHaveBeenCalledExactlyOnceWith("browser");
        await act(async () => send({ type: "widget-interact", blockId: null }));
        expect(onWidgetInteract).toHaveBeenLastCalledWith(null);
        widgets = [{ ...widgets[0], title: "Documentation" }];
        await render();
        expect(widgetCalls()).toHaveLength(2);
        expect((widgetCalls()[1][0] as any).params.selectedBlockId).toBeUndefined();
        await render(false);
        expect(host.querySelector("iframe")).toBe(frame);
        expect(widgetCalls()).toHaveLength(2);
        post.mockRestore();
    } finally {
        await act(async () => root.unmount());
        expect(onWidgetsReady).toHaveBeenLastCalledWith(false);
        host.remove();
    }
});

it("reconnects after effects reattach to a ready iframe and ignores duplicate ready announcements", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { x: 52, y: 58, width: 900, height: 600 };
    const onWidgetsReady = vi.fn();
    const messages: Array<{ method: string }> = [];
    const frames = new Set<Window>();
    const spies: Array<{ mockRestore: () => void }> = [];
    const getFrame = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow").get;
    const getter = vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function () {
        const frame = getFrame.call(this) as Window;
        if (frame && !frames.has(frame)) {
            frames.add(frame);
            const iframe = this as HTMLIFrameElement;
            spies.push(
                vi.spyOn(frame, "postMessage").mockImplementation((data: any) => {
                    messages.push(data);
                    const response =
                        data.method === "connect"
                            ? { type: "ready" }
                            : {
                                  id: data.id,
                                  result:
                                      data.method === "sync_widgets"
                                          ? { widgets: [], selectedBlockIds: [] }
                                          : { camera, viewport },
                              };
                    queueMicrotask(() =>
                        window.dispatchEvent(
                            new MessageEvent("message", {
                                source: frame,
                                origin: new URL(iframe.src).origin,
                                data: { source: "kronos-pen", ...response },
                            })
                        )
                    );
                })
            );
        }
        return frame;
    });
    try {
        await act(async () =>
            root.render(
                <StrictMode>
                    <OSPenEditor
                        tabId="reattach-pen"
                        visible
                        camera={camera}
                        widgets={[]}
                        onCamera={vi.fn()}
                        onViewport={vi.fn()}
                        onCanvasInteraction={vi.fn()}
                        onWidgets={vi.fn()}
                        onWidgetInteract={vi.fn()}
                        onWidgetsReady={onWidgetsReady}
                    />
                </StrictMode>
            )
        );
        expect(frames.size).toBe(1);
        expect(messages.filter((data) => data.method === "connect")).toHaveLength(2);
        expect(messages.filter((data) => data.method === "set_camera")).toHaveLength(1);
        expect(messages.filter((data) => data.method === "sync_widgets")).toHaveLength(1);
        expect(onWidgetsReady).toHaveBeenLastCalledWith(true);
        expect(host.querySelector(".os-pen-editor-startup")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        spies.forEach((spy) => spy.mockRestore());
        getter.mockRestore();
        host.remove();
    }
});

it("publishes native commands to the workspace popup and retires them when the canvas hides", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { x: 52, y: 58, width: 900, height: 600 };
    const render = (visible: boolean) =>
        act(async () =>
            root.render(
                <OSPenEditor
                    tabId="command-pen"
                    visible={visible}
                    camera={camera}
                    onCamera={vi.fn()}
                    onViewport={vi.fn()}
                    onCanvasInteraction={vi.fn()}
                    widgets={[]}
                    onWidgets={vi.fn()}
                    onWidgetInteract={vi.fn()}
                    onWidgetsReady={vi.fn()}
                />
            )
        );
    Palette.open.mockClear();
    try {
        await render(true);
        const frame = host.querySelector("iframe");
        const send = (data: Record<string, unknown>) =>
            window.dispatchEvent(
                new MessageEvent("message", {
                    source: frame.contentWindow,
                    origin: new URL(frame.src).origin,
                    data: { source: "kronos-pen", ...data },
                })
            );
        const post = vi.spyOn(frame.contentWindow, "postMessage").mockImplementation((data: any) => {
            queueMicrotask(() =>
                send({
                    id: data.id,
                    result:
                        data.method === "sync_widgets" ? { widgets: [], selectedBlockIds: [] } : { camera, viewport },
                })
            );
        });
        await act(async () => send({ type: "ready" }));
        await act(async () =>
            send({
                type: "commands-changed",
                commands: [
                    {
                        id: "frame-tool",
                        label: "Frame",
                        category: "Tools",
                        keywords: [],
                        shortcut: ["F"],
                        enabled: true,
                        keepOpen: false,
                    },
                ],
            })
        );
        const contribution = registry
            .getArea("palette")
            .find((row) => row.id === "kronos.canvas.command-pen.frame-tool");
        expect(contribution).toBeDefined();
        await act(async () => send({ type: "command-palette-open" }));
        expect(Palette.open).toHaveBeenCalledOnce();
        await act(async () => (contribution.data as PaletteContribution).run());
        expect(
            post.mock.calls.some(
                ([message]: any) => message.method === "run_command" && message.params.id === "frame-tool"
            )
        ).toBe(true);
        await render(false);
        expect(registry.getArea("palette").find((row) => row.id === contribution.id)).toBeUndefined();
        expect(host.querySelector("iframe")).toBe(frame);
        post.mockRestore();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("relays answer and tool updates from the submitting session until the turn settles", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dialog = vi.fn();
    window.addEventListener("kronos:pen-dialog", dialog);
    const oldSession = $activeSessionId.get();
    const oldWorkers = $subagentsBySession.get();
    $subagentsBySession.set({});
    const oldStates = $sessionStates.get();
    const user: ChatMessage = { id: "user", role: "user", parts: [{ type: "text", text: "Draw a frame" }] };
    const publish = (messages: ChatMessage[], busy: boolean) => {
        $sessionStates.set({ ...$sessionStates.get(), design: { ...createClientSessionState(null, messages), busy } });
    };
    const submit = vi.fn(async (text: string) => {
        if (text === "/help") {
            $activeSessionId.set("design");
            publish([{ id: "help", role: "system", parts: [{ type: "text", text: "Available commands" }] }], false);
            return true;
        }
        publish([user], true);
        $activeSessionId.set("design");
        return true;
    });
    const unregister = registerCanvasChatSubmit(submit);
    try {
        $activeSessionId.set(null);
        $sessionStates.set({});
        await act(async () => root.render(<OSPenEditor tabId="chat-pen" visible />));
        const frame = host.querySelector("iframe");
        const frameWindow = frame.contentWindow;
        const send = (data: Record<string, unknown>) => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    source: frameWindow,
                    origin: new URL(frame.src).origin,
                    data: { source: "kronos-pen", ...data },
                })
            );
        };
        const replies: any[] = [];
        const workerReplies: unknown[] = [];
        vi.spyOn(frameWindow, "postMessage").mockImplementation((data: any) => {
            if (data.method === "agent_workers") workerReplies.push(data.params.rows);
            if (data.method === "agent_reply") replies.push(...data.params.updates.map((update) => ({
                requestId: data.params.requestId,
                ...update,
            })));
            queueMicrotask(() => send({ id: data.id, result: { success: true } }));
        });

        await act(async () => send({ type: "agent-prompt", requestId: "pen-turn", conversationId: "canvas-chat", prompt: "Draw a frame" }));
        const partial: ChatMessage = {
            id: "reply",
            role: "assistant",
            completedAt: 1,
            parts: [
                { type: "text", text: "Drawing" },
                { type: "tool-call", toolCallId: "frame", toolName: "draw", args: { code: "drawFrame()" } },
            ],
        };
        await act(async () => {
            publish([user, {
                ...partial,
                parts: [{ type: "text", text: "Draw" }, partial.parts[1]],
            }], true);
            publish([user, partial], true);
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(replies).toEqual([
            { requestId: "pen-turn", done: false, tool: { id: "frame", name: "draw", done: false, input: { code: "drawFrame()" } } },
            { requestId: "pen-turn", done: false, text: "Drawing", start: true },
        ]);

        await act(async () => {
            $activeSessionId.set("other");
            $sessionStates.set({ ...$sessionStates.get(), other: createClientSessionState(null, [user, partial]) });
        });
        expect(replies).toHaveLength(2);
        await act(async () => send({ type: "subagent-theater", conversationId: "canvas-chat", workerId: "worker" }));
        expect(dialog.mock.calls[0][0].detail).toEqual({ kind: "subagents", sessionId: "design", workerId: "worker" });
        await act(async () => {
            upsertSubagent("other", { subagent_id: "unrelated", status: "running" });
            upsertSubagent("design", { subagent_id: "worker", goal: "Explore layout", status: "running" });
            upsertSubagent("design", { subagent_id: "worker", status: "completed", summary: "Layout ready" });
        });
        expect(workerReplies.slice(-2)).toEqual([
            [{ id: "worker", goal: "Explore layout", status: "running", detail: "" }],
            [{ id: "worker", goal: "Explore layout", status: "completed", detail: "Layout ready" }],
        ]);
        const final: ChatMessage = {
            ...partial,
            parts: [
                { type: "text", text: "Drawing complete." },
                { type: "tool-call", toolCallId: "frame", toolName: "draw", result: {
                    _multimodal: true,
                    content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${"a".repeat(64)}` } }],
                    text_summary: "Frame drawn",
                } },
            ],
        };
        await act(async () => publish([user, final], false));
        expect(replies.slice(2)).toEqual([
            { requestId: "pen-turn", done: false, tool: {
                id: "frame", name: "draw", done: true,
                output: [
                    { type: "text", text: "Frame drawn" },
                    { type: "image", mimeType: "image/png", data: "a".repeat(64) },
                ],
            } },
            { requestId: "pen-turn", done: true, text: "Drawing complete." },
        ]);
        await act(async () => send({ type: "agent-prompt", requestId: "slash", prompt: "/help" }));
        expect(submit).toHaveBeenLastCalledWith("/help", "/help");
        expect(replies.at(-1)).toMatchObject({ requestId: "slash", done: true, text: "Available commands" });
    } finally {
        await act(async () => root.unmount());
        unregister();
        window.removeEventListener("kronos:pen-dialog", dialog);
        $sessionStates.set(oldStates);
        $subagentsBySession.set(oldWorkers);
        $activeSessionId.set(oldSession);
        host.remove();
    }
});


it("lists stored Hermes chats and projects only the selected transcript into Pen", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previousSessions = $sessions.get();
    const previousStates = $sessionStates.get();
    const previousDelegate = sessionTileDelegate();
    const resumeTile = vi.fn(async () => "runtime");
    try {
        $sessions.set([
            { id: "stored", title: "Design notes", message_count: 1 },
            { id: "archived", title: "Old notes", message_count: 1, archived: true },
        ] as ReturnType<typeof $sessions.get>);
        $sessionStates.set({
            runtime: createClientSessionState("stored", [
                { id: "message", role: "user", parts: [{ type: "text", text: "Review spacing" }] },
                { id: "reply", role: "assistant", parts: [{
                    type: "tool-call", toolCallId: "saved-tool", toolName: "terminal",
                    args: { command: "pwd" }, result: "/workspace",
                }] },
            ]),
        });
        setSessionTileDelegate({ resumeTile } as unknown as ReturnType<typeof sessionTileDelegate>);
        await act(async () => root.render(<OSPenEditor tabId="history-pen" visible />));
        const iframe = host.querySelector("iframe");
        const send = (data: object) => window.dispatchEvent(new MessageEvent("message", {
            source: iframe.contentWindow,
            origin: new URL(iframe.src).origin,
            data: { source: "kronos-pen", ...data },
        }));
        const post = vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation((data) => {
            queueMicrotask(() => send({ id: data.id, result: {} }));
        });
        await act(async () => {
            send({ type: "hermes-history-search", requestId: 1, query: "" });
            send({ type: "hermes-history-open", requestId: 2, sessionId: "archived" });
            send({ type: "hermes-history-open", requestId: 3, sessionId: "stored" });
        });
        expect(resumeTile).toHaveBeenCalledExactlyOnceWith("stored");
        await act(async () => {
            send({ type: "agent-prompt", requestId: "resume", conversationId: "pen-chat", prompt: "/switch Design notes" });
        });
        expect(resumeTile).toHaveBeenCalledTimes(2);
        const transcript = [
            expect.objectContaining({ text: "Review spacing" }),
            expect.objectContaining({
                role: "tool",
                toolUse: expect.objectContaining({
                    toolUseId: "saved-tool", input: { command: "pwd" }, output: "/workspace",
                }),
            }),
        ];
        expect(post.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            expect.objectContaining({ method: "hermes_history_results", params: expect.objectContaining({
                rows: [{ id: "stored", title: "Design notes" }],
            }) }),
            expect.objectContaining({ method: "hermes_history_opened", params: expect.objectContaining({
                requestId: 3,
                messages: transcript,
            }) }),
            expect.objectContaining({ method: "resume_hermes_chat", params: expect.objectContaining({
                conversationId: "pen-chat", sessionId: "stored",
                messages: transcript,
            }) }),
        ]));
    } finally {
        await act(async () => root.unmount());
        host.remove();
        $sessions.set(previousSessions);
        $sessionStates.set(previousStates);
        setSessionTileDelegate(previousDelegate);
    }
});

it("routes Pen composer controls and closes the shared inspector", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previousDesktop = window.hermesDesktop;
    const previousSession = $activeSessionId.get();
    const { $sandboxComputerAccess } = await import("@hermes/computer/access-store");
    const previousAccess = $sandboxComputerAccess.get();
    const access = vi.fn(async () => ({ desktopId: "dev-vm", enabled: true, mode: "hybrid" }));
    const openMachines = vi.fn(async () => ({ ok: true }));
    const voice = vi.fn();
    const complete = vi.fn();
    const previousInspector = $krontermInspectorOpen.get();
    window.addEventListener("kronos:pen-composer-complete", complete);
    window.addEventListener("kronos:pen-composer-voice", voice);
    try {
        $activeSessionId.set("pen-runtime");
        window.hermesDesktop = {
            krontermSurfaces: {
                openMachines,
                computerManager: {
                    access,
                    desktops: async () => [{ id: "dev-vm", name: "Dev VM", status: "running", imagePrepared: true }],
                },
            },
        } as unknown as typeof window.hermesDesktop;
        await act(async () => root.render(<OSPenEditor tabId="composer-pen" visible />));
        const iframe = host.querySelector("iframe");
        const send = (data: object) => window.dispatchEvent(new MessageEvent("message", {
            source: iframe.contentWindow,
            origin: new URL(iframe.src).origin,
            data: { source: "kronos-pen", ...data },
        }));
        const post = vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation((data) => {
            queueMicrotask(() => send({ id: data.id, result: { success: true } }));
        });
        await act(async () => {
            send({ type: "composer-sandbox", conversationId: "pen-chat", action: "select", desktopId: "dev-vm", mode: "hybrid" });
            send({ type: "composer-voice", conversationId: "pen-chat", action: "dictation" });
            send({ type: "composer-complete", conversationId: "pen-chat", trigger: "@", query: "file:src", requestId: 1 });
            $krontermInspectorOpen.set(true);
            send({ type: "close-workspace-inspector" });
        });
        expect($krontermInspectorOpen.get()).toBe(false);
        const completion = complete.mock.calls[0][0].detail;
        expect(completion).toMatchObject({ trigger: "@", query: "file:src", sessionId: "pen-runtime" });
        const items = [{ text: "@file:src/main.ts" }];
        completion.publish(items);
        expect(post.mock.calls.map(([message]) => message)).toContainEqual(expect.objectContaining({
            method: "composer_completions", params: { conversationId: "pen-chat", requestId: 1, items },
        }));
        expect(access).toHaveBeenCalledWith({
            enabled: true, desktopId: "dev-vm", mode: "hybrid", startIfStopped: true, sessionIds: ["pen-runtime"],
        });
        expect(openMachines).toHaveBeenCalledExactlyOnceWith("desktop", false, "dev-vm");
        const request = voice.mock.calls[0][0].detail;
        expect(request).toMatchObject({ action: "dictation", tabId: "composer-pen", conversationId: "pen-chat" });
        await request.publish({ text: "Dictated note" });
        expect(post.mock.calls.map(([message]) => message)).toContainEqual(expect.objectContaining({
            method: "composer_voice_update", params: { conversationId: "pen-chat", text: "Dictated note" },
        }));
    } finally {
        await act(async () => root.unmount());
        window.removeEventListener("kronos:pen-composer-voice", voice);
        window.removeEventListener("kronos:pen-composer-complete", complete);
        $krontermInspectorOpen.set(previousInspector);
        window.hermesDesktop = previousDesktop;
        $activeSessionId.set(previousSession);
        $sandboxComputerAccess.set(previousAccess);
        host.remove();
    }
});

it("uses theme-aware orbital motion for canvas loading and a still mark for reduced motion", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        Appearance.reducedMotion = false;
        Appearance.colorScheme = "dark";
        await act(async () => root.render(<OSPenEditor tabId="orbit-loading" visible />));
        const video = host.querySelector(".os-pen-editor-loading-logo video") as HTMLVideoElement;
        expect(video).not.toBeNull();
        expect(video.getAttribute("src")).toContain("orbit-logo-animation.mp4");
        expect(video.autoplay).toBe(true);
        expect(video.loop).toBe(true);
        expect(video.muted).toBe(true);
        expect(host.querySelector(".os-pen-editor-startup h2")).toBeNull();
        expect(host.querySelector(".sr-only")?.textContent).toBe("Opening your canvas");

        Appearance.colorScheme = "light";
        await act(async () => root.render(<OSPenEditor tabId="orbit-loading" visible />));
        expect(host.querySelector("video")?.getAttribute("src")).toContain("orbit-logo-animation-light.mp4");

        Appearance.reducedMotion = true;
        await act(async () => root.render(<OSPenEditor tabId="orbit-loading" visible />));
        expect(host.querySelector(".os-pen-editor-loading-logo video")).toBeNull();
        expect(host.querySelector(".os-pen-editor-loading-logo img")?.getAttribute("src")).toContain(
            "orbit-logo-dark.png"
        );
    } finally {
        Appearance.colorScheme = "dark";
        Appearance.reducedMotion = true;
        await act(async () => root.unmount());
        host.remove();
    }
});
