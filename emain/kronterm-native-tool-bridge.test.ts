// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceService } from "@/app/store/services";
import { execFile } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { executeTool } from "../mcp-kron-term/src/tool-execution";
import { ElectronWshClient } from "./emain-wsh";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermNativeToolBridge } from "./kronterm-native-tool-bridge";

vi.mock("@/app/store/services", () => ({
    WorkspaceService: {
        CreateWorkspace: vi.fn().mockResolvedValue("created-workspace"),
        UpdateWorkspace: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock("node:child_process", () => {
    const execFile = vi.fn();
    execFile[Symbol.for("nodejs.util.promisify.custom")] = (...args: any[]) =>
        new Promise((resolve, reject) => {
            execFile(...args, (error: Error, stdout: string, stderr: string) => {
                if (error) reject(error);
                else resolve({ stdout, stderr });
            });
        });
    return { execFile, spawn: vi.fn() };
});
vi.mock("./emain-hud", () => ({
    nativeDesktopHudActive: () => windowMocks.hudActive,
    nativeHudViewingContext: () => undefined,
    listNativeHudIslands: () => [
        { blockId: "detached", visible: false, bounds: { x: 0, y: 0, width: 480, height: 360 } },
    ],
    nativeHudWidgetRoute: (tab, block) => (block === "detached" ? `tab:${tab}:island:${block}` : `tab:${tab}`),
}));
const workflowMocks = vi.hoisted(() => ({
    run: {
        id: "run",
        status: "running",
        target: {
            workspaceId: "workspace",
            tabId: "tab",
            blockIds: ["browser"],
            environment: "workspace",
            computerId: "VM-1",
        },
    } as any,
    owner: undefined as string | undefined,
}));
vi.mock("./workflow-runtime", () => ({
    workflowStore: () => ({ get: () => workflowMocks.run, controlOwner: () => workflowMocks.owner }),
}));
const windowMocks = vi.hoisted(() => ({
    setActiveTab: vi.fn().mockResolvedValue(undefined),
    hudActive: false,
    missing: false,
    createWindow: vi.fn(),
}));
vi.mock("./emain-window", () => ({
    getWaveWindowByTabId: () =>
        windowMocks.missing
            ? undefined
            : {
                  activeTabView: { waveTabId: "other-tab" },
                  allLoadedTabViews: new Map([["tab", {}]]),
                  setActiveTab: windowMocks.setActiveTab,
              },
    focusedWaveWindow: { workspaceId: "workspace", activeTabView: { waveTabId: "other-tab" }, isFocused: () => true },
    getWaveWindowByWorkspaceId: (workspaceId) =>
        windowMocks.missing
            ? undefined
            : {
                  waveWindowId: `window-${workspaceId}`,
                  allLoadedTabViews: new Map([["other-tab", {}]]),
                  isVisible: () => true,
                  isFocused: () => true,
                  activeTabView: { waveTabId: "other-tab" },
                  setActiveTab: windowMocks.setActiveTab,
              },
    createWindowForWorkspace: windowMocks.createWindow,
}));
vi.mock("./emain-pet", () => ({}));
vi.mock("./emain-wsh", () => ({ ElectronWshClient: { wshRpcCall: vi.fn() } }));

describe("native tool CLI authentication", () => {
    test("pixel wheel input uses scoped native RPC and preserves zero coordinates", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab", blockId: "browser" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValueOnce({ success: true });
        await bridge.widgetScroll("browser", -120, 0, 0);
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledWith(
            "widgetmousescroll",
            { blockid: "browser", amount: -120, originx: 0, originy: 0 },
            expect.objectContaining({ route: "tab:tab" })
        );
        expect(execFile).not.toHaveBeenCalled();
    });
    beforeEach(() => {
        vi.stubEnv("KRONTERM_WSH", process.execPath);
        vi.stubEnv("KRONTERM_JWT", "stale-inherited-token");
        vi.stubEnv("WAVETERM_BLOCKID", "stale-block");
        vi.mocked(execFile).mockImplementation((_file, _args, _options, callback: any) => {
            callback(null, "ready", "");
            return {} as any;
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    test("brokers a fresh scoped token for inherited tools without changing the agent environment", async () => {
        let context: HermesSurfaceContext = { tabId: "tab-1", blockId: "block-1" };
        const bridge = new KronTermNativeToolBridge(() => context);
        vi.mocked(ElectronWshClient.wshRpcCall)
            .mockResolvedValueOnce({ token: "scoped-1", tabid: "tab-1", blockid: "block-1" })
            .mockResolvedValueOnce({ token: "scoped-2", tabid: "tab-2" });

        await bridge.connectionStatus();
        context = { tabId: "tab-2" };
        await bridge.connectionStatus();

        expect(ElectronWshClient.wshRpcCall).toHaveBeenNthCalledWith(
            1,
            "createsurfacetoken",
            { tabid: "tab-1", blockid: "block-1" },
            {}
        );
        const firstEnv = vi.mocked(execFile).mock.calls[0][2].env;
        const secondEnv = vi.mocked(execFile).mock.calls[1][2].env;
        expect(firstEnv).toMatchObject({
            KRONTERM_JWT: "scoped-1",
            WAVETERM_JWT: "scoped-1",
            KRONTERM_TABID: "tab-1",
            WAVETERM_TABID: "tab-1",
            KRONTERM_BLOCKID: "block-1",
            WAVETERM_BLOCKID: "block-1",
        });
        expect(secondEnv).toMatchObject({ KRONTERM_JWT: "scoped-2", KRONTERM_TABID: "tab-2" });
        expect(secondEnv).not.toHaveProperty("WAVETERM_BLOCKID");
        expect(secondEnv).not.toHaveProperty("KRONTERM_BLOCKID");
        expect(process.env.KRONTERM_JWT).toBe("stale-inherited-token");
    });

    test("lists OS and detached widgets through the same tab inventory with the correct owners", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab-1" }));
        vi.spyOn(bridge, "workspaceSurfaceSnapshot").mockResolvedValue(
            JSON.stringify({
                blocks: [
                    { blockid: "browser", view: "web", hudselected: true, hudvisible: true, availability: "ready" },
                    { blockid: "detached", view: "term", availability: "owner-required" },
                    { blockid: "chat", view: "hermes" },
                ],
            })
        );
        const widgets = JSON.parse(await bridge.hudListIslands());
        expect(widgets).toHaveLength(2);
        expect(widgets[0]).toMatchObject({
            blockId: "browser",
            selected: true,
            hudVisible: true,
            ownerRoute: "tab:tab-1",
            detached: false,
        });
        expect(widgets[1]).toMatchObject({
            blockId: "detached",
            ownerRoute: "tab:tab-1:island:detached",
            detached: true,
            nativeVisible: false,
        });
    });

    test("does not execute a CLI tool when the surface is missing", async () => {
        const bridge = new KronTermNativeToolBridge(() => null);
        await expect(bridge.connectionStatus()).rejects.toThrow("not attached to a workspace tab");
        expect(execFile).not.toHaveBeenCalled();
    });

    test("does not execute a CLI tool with a token for another tab", async () => {
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValueOnce({ token: "wrong", tabid: "other-tab" });
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab-1" }));
        await expect(bridge.connectionStatus()).rejects.toThrow("could not issue a capability");
        expect(execFile).not.toHaveBeenCalled();
    });

    test("native RPC tools continue using Electron authentication without issuing a CLI token", async () => {
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValueOnce([]);
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab-1" }));
        await bridge.getWorkspaceInfo();
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledWith("workspacelist", null, {});
        expect(execFile).not.toHaveBeenCalled();
    });

    test("restores the exact HUD widget through its owning tab without creating a duplicate block", async () => {
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValueOnce('{"success":true}');
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab-1" }));
        await bridge.workspaceSurfaceControl({ action: "hud.restore", blockId: "block:browser-1" });
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledWith(
            "workspacesurfacecontrol",
            expect.objectContaining({ action: "hud.restore", blockid: "browser-1" }),
            { route: "tab:tab-1" }
        );
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledTimes(1);
        expect(execFile).not.toHaveBeenCalled();
    });

    test("rejects invalid HUD requests and cross-browser targets before RPC mutation", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({
            tabId: "tab-1",
            blockId: "browser-1",
            hostMode: "web-fullscreen",
        }));
        await expect(bridge.workspaceSurfaceControl({ action: "hud.open" })).rejects.toThrow("block ID");
        await expect(bridge.workspaceSurfaceControl({ action: "hud.mode", presentation: "canvas" })).rejects.toThrow(
            "HUD mode"
        );
        await expect(bridge.workspaceSurfaceControl({ action: "hud.restore", blockId: "browser-2" })).rejects.toThrow(
            "outside"
        );
        await expect(bridge.workspaceSurfaceControl({ action: "resize", width: NaN })).rejects.toThrow("finite");
        expect(ElectronWshClient.wshRpcCall).not.toHaveBeenCalled();
    });
});

describe("resolved native targets", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    test("HUD discovery does not require an owning workspace", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "detached-hud" }));
        const action = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "inventory" }] });
        const result = await executeTool("workspace_inventory", {}, true, () => bridge.withToolTarget({}, action));
        expect(result.isError).not.toBe(true);
        expect(action).toHaveBeenCalledOnce();
        expect(ElectronWshClient.wshRpcCall).not.toHaveBeenCalled();
    });

    test("routes control to the owning tab despite caller focus changes", async () => {
        let caller = { tabId: "caller-tab", workspaceId: "caller-workspace" };
        const bridge = new KronTermNativeToolBridge(() => caller);
        vi.mocked(ElectronWshClient.wshRpcCall).mockImplementation(async (command) => {
            if (command === "blockinfo")
                return { blockid: "target", tabid: "other-tab", workspaceid: "other-workspace" };
            return JSON.stringify({ success: true });
        });
        const result = await executeTool("workspace_move_widget", { blockId: "target" }, false, () =>
            bridge.withToolTarget({ blockId: "target" }, async () => {
                caller = { tabId: "changed-tab", workspaceId: "changed-workspace" };
                return {
                    content: [
                        {
                            type: "text",
                            text: await bridge.workspaceSurfaceControl({
                                action: "move",
                                blockId: "target",
                                x: 10,
                                y: 20,
                            }),
                        },
                    ],
                };
            })
        );
        expect(result.isError).not.toBe(true);
        expect(ElectronWshClient.wshRpcCall).toHaveBeenLastCalledWith(
            "workspacesurfacecontrol",
            expect.objectContaining({ blockid: "target" }),
            expect.objectContaining({ route: "tab:other-tab", timeout: expect.any(Number) })
        );
    });

    test("rejects conflicting workspace and widget owners before mutation", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "caller" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValue({ tabid: "owner", workspaceid: "workspace" });
        const action = vi.fn();
        await expect(bridge.withToolTarget({ blockId: "target", targetTabId: "wrong" }, action)).rejects.toThrow(
            "does not belong"
        );
        expect(action).not.toHaveBeenCalled();
    });

    test("restricted web callers cannot expand their target scope", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({
            tabId: "web-tab",
            workspaceId: "web-workspace",
            blockId: "web",
            hostMode: "web-fullscreen",
        }));
        const action = vi.fn();
        await expect(bridge.withToolTarget({ targetWorkspaceId: "other" }, action)).rejects.toThrow("outside");
        expect(action).not.toHaveBeenCalled();
        expect(ElectronWshClient.wshRpcCall).not.toHaveBeenCalled();
    });

    test("retries one stale read route but never replays an action", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "other-tab", workspaceId: "workspace" }));
        vi.mocked(ElectronWshClient.wshRpcCall)
            .mockRejectedValueOnce(new Error("route not found"))
            .mockResolvedValueOnce("{}");
        const read = await executeTool("workspace_snapshot", {}, true, async () => ({
            content: [{ type: "text", text: await bridge.workspaceSurfaceSnapshot() }],
        }));
        expect(read.isError).not.toBe(true);
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledTimes(2);
        vi.mocked(ElectronWshClient.wshRpcCall).mockClear().mockRejectedValue(new Error("route not found"));
        const write = await executeTool("workspace_move_widget", {}, false, () =>
            bridge.workspaceSurfaceControl({ action: "move" })
        );
        expect(write.isError).toBe(true);
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledTimes(1);
    });

    test("unsuccessful RPC results fail instead of becoming success text", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValue('{"success":false,"message":"Widget is closed"}');
        await expect(bridge.workspaceSurfaceControl({ action: "focus" })).rejects.toThrow("Widget is closed");
    });

    test("configured widget launch and discovery avoid CLI processes", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab" }));
        const config = {
            widgets: {},
            defaultwidgets: { terminal: { blockdef: { meta: { view: "term" } }, magnified: true } },
        };
        vi.mocked(ElectronWshClient.wshRpcCall)
            .mockResolvedValueOnce(config)
            .mockResolvedValueOnce(config)
            .mockResolvedValueOnce("block:created");
        expect(JSON.parse(await bridge.listWidgets())).toEqual(config);
        await bridge.launchWidget("terminal");
        expect(ElectronWshClient.wshRpcCall).toHaveBeenLastCalledWith(
            "createblock",
            { tabid: "tab", blockdef: { meta: { view: "term" } }, magnified: true, focused: true },
            {}
        );
        expect(execFile).not.toHaveBeenCalled();
    });
});

describe("workspace discovery", () => {
    afterEach(() => vi.clearAllMocks());
    test("coalesces inventory calls, includes detached geometry, and refreshes after topology changes", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "other-tab", workspaceId: "workspace" }));
        let blocks = [{ blockid: "detached", tabid: "other-tab", meta: { view: "term", "term:env": "private" } }];
        vi.mocked(ElectronWshClient.wshRpcCall).mockImplementation(async (command) => {
            if (command === "workspacelist")
                return [
                    {
                        windowid: "win",
                        workspacedata: { oid: "workspace", tabids: ["other-tab"], activetabid: "other-tab" },
                    },
                ];
            if (command === "blockslist") return blocks;
        });
        const snapshots = await Promise.all([bridge.workspaceInventory(), bridge.workspaceInventory()]);
        const snapshot = JSON.parse(snapshots[0]);
        expect(snapshot.userView).toMatchObject({ workspaceId: "workspace", tabId: "other-tab", appFocused: true });
        expect(snapshot.workspaces[0].tabs[0].widgets[0]).toMatchObject({
            availability: "detached",
            nativeVisible: false,
            nativeBounds: { width: 480, height: 360 },
        });
        expect(snapshots[0]).not.toContain("private");
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledTimes(2);
        blocks = [];
        expect(JSON.parse(await bridge.workspaceInventory()).workspaces[0].tabs[0].widgets).toEqual([]);
        expect(windowMocks.setActiveTab).not.toHaveBeenCalled();
    });

    test("lists the caller's actual workspace instead of the globally focused workspace", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "background-tab" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockImplementation(async (command, data) => {
            if (command === "workspacelist")
                return [{ workspacedata: { oid: "background-workspace", tabids: ["background-tab"] } }];
            expect(data).toEqual({ workspaceid: "background-workspace" });
            return [{ tabid: "background-tab", blockid: "exact" }];
        });
        expect(JSON.parse(await bridge.listBlocks())[0].blockid).toBe("exact");
    });
});

describe("workspace organization", () => {
    test("creates a named workspace without moving the user's focus", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "other-tab", workspaceId: "workspace" }));
        expect(JSON.parse(await bridge.organizeWorkspace({ action: "create", name: "  Mobile  " }))).toEqual({
            workspaceId: "created-workspace",
            name: "Mobile",
        });
        expect(WorkspaceService.CreateWorkspace).toHaveBeenCalledWith("Mobile", "", "", true);
    });
    test("preserves workspace appearance on rename and rejects missing targets", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "other-tab", workspaceId: "workspace" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValue([
            { workspacedata: { oid: "workspace", icon: "terminal", color: "#9270ff" } },
        ]);
        await bridge.organizeWorkspace({ action: "rename", workspaceId: "workspace", name: "Build" });
        expect(WorkspaceService.UpdateWorkspace).toHaveBeenCalledWith(
            "workspace",
            "Build",
            "terminal",
            "#9270ff",
            false
        );
        await expect(
            bridge.organizeWorkspace({ action: "rename", workspaceId: "gone", name: "Build" })
        ).rejects.toThrow("no longer exists");
        await expect(bridge.organizeWorkspace({ action: "create", name: "  " })).rejects.toThrow("1 to 80");
    });
});

describe("workflow target fencing", () => {
    beforeEach(() => {
        workflowMocks.owner = undefined;
        workflowMocks.run.status = "running";
        workflowMocks.run.target.environment = "workspace";
    });
    const scoped = () =>
        new KronTermNativeToolBridge(() => ({ tabId: "tab", workspaceId: "workspace", workflowRunId: "run" }));
    test("workspace switches do not widen specialist targets", async () => {
        const operation = vi.fn(async () => "result");
        await expect(scoped().withWorkflowRun("widget_snapshot", { blockId: "browser" }, operation)).resolves.toBe(
            "result"
        );
        for (const target of [
            { blockId: "other" },
            { targetWorkspaceId: "other" },
            { targetTabId: "other" },
            { tabId: "other" },
        ])
            await expect(scoped().withWorkflowRun("widget_snapshot", target, operation)).rejects.toThrow("outside");
        expect(operation).toHaveBeenCalledTimes(1);
    });
    test("paused runs cannot issue more tools or approve themselves", async () => {
        workflowMocks.run.status = "paused";
        await expect(
            scoped().withWorkflowRun("widget_click", { blockId: "browser" }, async () => "done")
        ).rejects.toThrow("paused");
        await expect(
            scoped().workflowCommand({ action: "permission", runId: "run", questionId: "request", optionId: "allow" })
        ).rejects.toThrow("explicit decision");
    });
    test("native control needs the exact assigned app and respects another run's lease", async () => {
        workflowMocks.run.target.environment = "native";
        workflowMocks.run.target.computerId = "Safari";
        await expect(
            scoped().withWorkflowRun("kron_computer_click", { app: "Notes" }, async () => "done")
        ).rejects.toThrow("not assigned");
        await expect(
            scoped().withWorkflowRun("kron_computer_click", { app: "Safari" }, async () => "done")
        ).resolves.toBe("done");
        workflowMocks.owner = "another-run";
        const other = new KronTermNativeToolBridge(() => ({ tabId: "tab" }));
        await expect(
            other.withWorkflowRun("kron_computer_click", { app: "Safari" }, async () => "done")
        ).rejects.toThrow("owns this computer");
    });
    test("VM tools cannot target a different computer", async () => {
        workflowMocks.run.target.environment = "vm";
        workflowMocks.run.target.computerId = "VM-1";
        await expect(
            scoped().withWorkflowRun("linux_desktop_click", { desktopId: "VM-2" }, async () => "done")
        ).rejects.toThrow("outside");
    });
    test("background app sessions cannot bypass an app-bound workflow", async () => {
        workflowMocks.run.target.environment = "native";
        workflowMocks.run.target.computerId = "com.apple.TextEdit";
        const operation = vi.fn(async () => "done");
        for (const action of [
            "list",
            "start",
            "launch",
            "open_file",
            "observe",
            "action",
            "reveal",
            "resume",
            "finish",
        ]) {
            await expect(
                scoped().withWorkflowRun(
                    `kron_computer_background_workspace_${action}`,
                    {
                        bundleId: "com.apple.TextEdit",
                        sessionId: "opaque-session",
                    },
                    operation
                )
            ).rejects.toThrow("not bound to workflow capabilities");
        }
        expect(operation).not.toHaveBeenCalled();
    });
});

describe("HUD tool routing", () => {
    afterEach(() => {
        windowMocks.hudActive = false;
        windowMocks.missing = false;
        vi.clearAllMocks();
    });

    test("reads and mutations keep the mounted HUD tab without switching the workspace", async () => {
        windowMocks.hudActive = true;
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab", blockId: "browser" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockResolvedValue('{"success":true}');
        for (const readOnly of [true, false]) {
            const result = await executeTool(
                readOnly ? "widget_snapshot" : "hud_show_widget",
                {},
                readOnly,
                async () => ({
                    content: [
                        {
                            type: "text",
                            text: readOnly
                                ? await bridge.widgetSnapshot("browser")
                                : await bridge.workspaceSurfaceControl({ action: "hud.open", blockId: "browser" }),
                        },
                    ],
                })
            );
            expect(result.isError).not.toBe(true);
        }
        expect(windowMocks.setActiveTab).not.toHaveBeenCalled();
        expect(ElectronWshClient.wshRpcCall).toHaveBeenLastCalledWith(
            "workspacesurfacecontrol",
            expect.objectContaining({ blockid: "browser" }),
            expect.objectContaining({ route: "tab:tab" })
        );
    });

    test("an unavailable HUD tab fails without switching or revealing the hidden workspace", async () => {
        windowMocks.hudActive = true;
        windowMocks.missing = true;
        const bridge = new KronTermNativeToolBridge(() => ({
            tabId: "unmounted",
            workspaceId: "workspace",
            blockId: "browser",
        }));
        const result = await executeTool("hud_show_widget", {}, false, () =>
            bridge.workspaceSurfaceControl({ action: "hud.open", blockId: "browser" })
        );
        expect(result.isError).toBe(true);
        expect(windowMocks.setActiveTab).not.toHaveBeenCalled();
        expect(windowMocks.createWindow).not.toHaveBeenCalled();
        expect(ElectronWshClient.wshRpcCall).not.toHaveBeenCalled();
    });

    test("a stale detached island never falls back to a different renderer", async () => {
        const bridge = new KronTermNativeToolBridge(() => ({ tabId: "tab", blockId: "detached" }));
        vi.mocked(ElectronWshClient.wshRpcCall).mockRejectedValue(new Error("route not found"));
        const result = await executeTool("widget_snapshot", {}, true, () => bridge.widgetSnapshot("detached"));
        expect(result.isError).toBe(true);
        expect(ElectronWshClient.wshRpcCall).toHaveBeenCalledTimes(1);
        expect(windowMocks.setActiveTab).not.toHaveBeenCalled();
    });
});
