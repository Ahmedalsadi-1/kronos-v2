// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, test, vi } from "vitest";
import { registerNativeHudIpc } from "./native-hud-ipc";

const mocks = vi.hoisted(() => ({
    on: vi.fn(),
    handle: vi.fn(),
    registerBrowserToolsIpc: vi.fn(),
    setNativeHudMode: vi.fn(),
    openNativeHudIsland: vi.fn(),
    syncNativeNotch: vi.fn(),
    reportNativeAgentCursor: vi.fn(),
    command: vi.fn(),
    publishNativeWorkflow: vi.fn(),
    initialize: vi.fn(),
    subscriber: undefined as (snapshot: any) => void,
    desktopSend: vi.fn(),
    hudSend: vi.fn(),
    forwardHermesSelection: vi.fn(),
    beginDesktopGrab: vi.fn(),
    cancelDesktopGrab: vi.fn(),
}));
vi.mock("electron", () => ({ ipcMain: { on: mocks.on, handle: mocks.handle } }));
vi.mock("./browser/browser-tools-ipc", () => ({ registerBrowserToolsIpc: mocks.registerBrowserToolsIpc }));
vi.mock("./desktop-picker", () => ({
    beginDesktopGrab: mocks.beginDesktopGrab,
    cancelDesktopGrab: mocks.cancelDesktopGrab,
}));
vi.mock("./emain-tabview", () => ({ getWaveTabViewByWebContentsId: (id: number) => (id === 1 ? {} : null) }));
vi.mock("./emain-window", () => ({
    getAllWaveWindows: () => [
        {
            allLoadedTabViews: new Map([
                ["tab", { webContents: { isDestroyed: () => false, send: mocks.desktopSend } }],
            ]),
        },
    ],
}));
vi.mock("./workflow-runtime", () => ({
    workflowCommand: mocks.command,
    workflowStore: () => ({ snapshot: () => ({ runs: [], workflows: [] }) }),
    initializeWorkflows: mocks.initialize,
    subscribeWorkflows: (callback: any) => {
        mocks.subscriber = callback;
    },
}));
vi.mock("./emain-hud", () => ({
    ...mocks,
    listNativeHudWebContents: () => [{ id: 2, send: mocks.hudSend }],
    setNativeHudIgnoreMouse: vi.fn(),
    requestNativeAgentTakeover: vi.fn(),
    requestNativeHudLaunch: vi.fn(),
    requestNativeHudExit: vi.fn(),
    moveNativeHudBy: vi.fn(),
    closeNativeHudSurface: vi.fn(),
    setNativeHudIslandVisibility: vi.fn(),
    resolveNativeHudWidgetRoute: vi.fn(),
    getNativeHudIslandPresentation: vi.fn(),
    toggleNativeHudIslandExpanded: vi.fn(),
    resizeCurrentNativeHudIsland: vi.fn(),
    selectNativeHudWidget: vi.fn(),
    captureNativeHudBlock: vi.fn(),
    forwardHermesContext: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
test("only a trusted top-level renderer can arm or cancel its desktop picker", () => {
    registerNativeHudIpc();
    const grab = mocks.handle.mock.calls.find(([channel]) => channel === "desktop-grab")[1];
    const cancel = mocks.handle.mock.calls.find(([channel]) => channel === "cancel-desktop-grab")[1];
    const mainFrame = {};
    const sender = { id: 1, mainFrame };
    const operationId = "f7abbbf2-cb7a-47cd-912c-f06397b6f58b";
    expect(() => grab({ sender, senderFrame: {} }, operationId)).toThrow("Untrusted desktop picker");
    expect(() => cancel({ sender, senderFrame: mainFrame }, undefined)).toThrow("Invalid desktop picker operation");
    grab({ sender, senderFrame: mainFrame }, operationId);
    cancel({ sender, senderFrame: mainFrame }, operationId);
    expect(mocks.beginDesktopGrab).toHaveBeenCalledExactlyOnceWith(sender, operationId);
    expect(mocks.cancelDesktopGrab).toHaveBeenCalledExactlyOnceWith(1, operationId);
});
test("registers notch startup and widget APIs for workspace and native renderers", () => {
    registerNativeHudIpc();
    const startup = mocks.on.mock.calls.find(([channel]) => channel === "set-hud-window-mode")[1];
    startup({ sender: { id: 1 } }, true, "session");
    expect(mocks.setNativeHudMode).toHaveBeenCalledWith(1, true, "session", undefined);
    expect(mocks.publishNativeWorkflow).toHaveBeenCalledWith({ runs: [], workflows: [] });
    const open = mocks.handle.mock.calls.find(([channel]) => channel === "open-native-hud-island")[1];
    open({ sender: { id: 2 } }, { blockId: "file" });
    expect(mocks.openNativeHudIsland).toHaveBeenCalledWith(2, { blockId: "file" });
    expect(() => open({ sender: { id: 99 } }, {})).toThrow("Untrusted notch caller");
    startup({ sender: { id: 99 } }, true);
    expect(mocks.setNativeHudMode).toHaveBeenCalledTimes(1);
    expect(mocks.registerBrowserToolsIpc).toHaveBeenCalledOnce();
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual(
        expect.arrayContaining([
            "set-native-hud-island-visibility",
            "toggle-native-hud-island-expanded",
            "select-native-hud-widget",
            "get-native-hud-island-presentation",
            "capture-native-hud-block",
            "send-hermes-context",
            "send-hermes-selection",
        ])
    );
});
test("only owned workspace and native surfaces can forward structured image selection", () => {
    registerNativeHudIpc();
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === "send-hermes-selection")[1];
    const payload = {
        text: "Inspect",
        target: "new",
        images: [{ filename: "capture.png", dataUrl: "data:image/png;base64,YQ==" }],
    };
    handler({ sender: { id: 2 } }, payload);
    expect(mocks.forwardHermesSelection).toHaveBeenCalledExactlyOnceWith(2, payload);
    expect(() => handler({ sender: { id: 99 } }, payload)).toThrow("Untrusted");
});
test("desktop and HUD share workflow updates; browser guests cannot answer approvals", () => {
    registerNativeHudIpc();
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === "workflow-command")[1];
    const command = { action: "permission", runId: "run", questionId: "request", optionId: "allow" };
    for (const id of [1, 2]) handler({ sender: { id } }, command);
    expect(mocks.command).toHaveBeenCalledTimes(2);
    expect(() => handler({ sender: { id: 99 } }, command)).toThrow("Untrusted");
    expect(mocks.command).toHaveBeenCalledTimes(2);
    const snapshot = { runs: [], workflows: [] };
    mocks.subscriber(snapshot);
    expect(mocks.desktopSend).toHaveBeenCalledWith("workflow-changed", snapshot);
    expect(mocks.hudSend).toHaveBeenCalledWith("workflow-changed", snapshot);
    expect(mocks.publishNativeWorkflow).toHaveBeenCalledWith(snapshot);
});
test("an unreadable journal does not prevent workspace startup", () => {
    mocks.initialize.mockImplementationOnce(() => {
        throw new Error("Invalid journal");
    });
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => registerNativeHudIpc()).not.toThrow();
    expect(logging).toHaveBeenCalledWith(expect.stringContaining("workspace startup continues"), expect.any(Error));
    logging.mockRestore();
});

test("only trusted renderers can report an agent cursor for Coucou", () => {
    registerNativeHudIpc();
    const report = mocks.on.mock.calls.find(([channel]) => channel === "report-agent-cursor")[1];
    report({ sender: { id: 1 } }, { x: 10, y: 20 }, "browser:demo");
    report({ sender: { id: 99 } }, { x: 30, y: 40 }, "browser:demo");
    expect(mocks.reportNativeAgentCursor).toHaveBeenCalledTimes(1);
    expect(mocks.reportNativeAgentCursor).toHaveBeenCalledWith(1, { x: 10, y: 20 }, "browser:demo");
});
