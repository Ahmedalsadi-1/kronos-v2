// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getModels: vi.fn(() => [] as any[]),
    refocus: vi.fn(),
    setMeta: vi.fn(async () => undefined),
    selectNativeHudWidget: vi.fn(async () => true),
    getSnapshot: vi.fn(() => ({ islandBlockIds: [] })),
    createBlock: vi.fn(async () => "hud-block-1"),
    deleteBlock: vi.fn(async () => {}),
    openNativeHudIsland: vi.fn(async () => true),
    registerIsland: vi.fn(),
    unregisterIsland: vi.fn(),
}));

vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: { SetMetaCommand: mocks.setMeta } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));

vi.mock("@/app/store/services", () => ({
    ObjectService: {
        CreateBlock: mocks.createBlock,
        DeleteBlock: mocks.deleteBlock,
    },
}));

vi.mock("@/store/global", () => ({
    getAllBlockComponentModels: mocks.getModels,
    refocusNode: mocks.refocus,
    getApi: () => ({
        openNativeHudIsland: mocks.openNativeHudIsland,
        selectNativeHudWidget: mocks.selectNativeHudWidget,
    }),
}));

vi.mock("./kronterm-hud-controller", () => ({
    kronTermHudController: {
        getSnapshot: mocks.getSnapshot,
        openAlongsideWorkspace: vi.fn(),
        registerIsland: mocks.registerIsland,
        unregisterIsland: mocks.unregisterIsland,
    },
}));

import { launchKronTermHudIsland } from "./kronterm-hud-islands";

describe("KronTerm HUD island launcher", () => {
    beforeEach(() => vi.clearAllMocks());

    it("opens a requested file in the existing explorer before selecting its notch preview", async () => {
        const goHistory = vi.fn(async () => {});
        const setEditMode = vi.fn(async () => {});
        mocks.getModels.mockReturnValueOnce([
            { viewModel: { viewType: "preview", blockId: "files-existing", goHistory, setEditMode } },
        ]);
        await expect(launchKronTermHudIsland("files", { file: "/project/live.ts" })).resolves.toBe("files-existing");
        expect(goHistory).toHaveBeenCalledWith("/project/live.ts");
        expect(setEditMode).toHaveBeenCalledWith(true);
        expect(mocks.selectNativeHudWidget).toHaveBeenCalledWith("files-existing", true);
        expect(mocks.createBlock).not.toHaveBeenCalled();
    });

    it("opens the workflow plugin as a live notch widget", async () => {
        await launchKronTermHudIsland("workflowcanvas");
        expect(mocks.createBlock).toHaveBeenCalledWith(
            { meta: { view: "plugin:kronterm.openhuman-workflow/canvas" } },
            { termsize: { rows: 25, cols: 80 } }
        );
        expect(mocks.openNativeHudIsland).toHaveBeenCalledWith(
            expect.objectContaining({ view: "plugin:kronterm.openhuman-workflow/canvas", title: "Workflow Canvas" })
        );
    });
    it("reuses the persistent Bots widget from the notch", async () => {
        mocks.getModels.mockReturnValueOnce([{ viewModel: { viewType: "bots", blockId: "bots-existing" } }]);
        await expect(launchKronTermHudIsland("bots")).resolves.toBe("bots-existing");
        expect(mocks.selectNativeHudWidget).toHaveBeenCalledWith("bots-existing", true);
        expect(mocks.createBlock).not.toHaveBeenCalled();
    });
    it("switches an existing device widget to the phone requested by the notch", async () => {
        mocks.getModels.mockReturnValueOnce([{ viewModel: { viewType: "linux-vms", blockId: "devices" } }]);
        await expect(launchKronTermHudIsland("machines", { machineKind: "iphone" })).resolves.toBe("devices");
        expect(mocks.setMeta).toHaveBeenCalledWith(
            {},
            {
                oref: "block:devices",
                meta: { "machine:kind": "iphone", "machine:settings": false, "machine:picker": false },
            }
        );
        expect(mocks.createBlock).not.toHaveBeenCalled();
    });

    it("opens the emulator picker without starting a device", async () => {
        await launchKronTermHudIsland("machines", { machinePicker: true });
        expect(mocks.createBlock).toHaveBeenCalledWith(
            {
                meta: {
                    view: "linux-vms",
                    "machine:kind": "desktop",
                    "machine:settings": false,
                    "machine:picker": true,
                },
            },
            { termsize: { rows: 25, cols: 80 } }
        );
    });

    it("routes the sandbox alias to the current machine widget", async () => {
        await launchKronTermHudIsland("sandbox");
        expect(mocks.openNativeHudIsland).toHaveBeenCalledWith(expect.objectContaining({ view: "linux-vms" }));
    });

    it("reuses the original browser mount and its live history", async () => {
        mocks.getModels.mockReturnValueOnce([{ viewModel: { viewType: "web", blockId: "existing-web" } }]);
        await expect(launchKronTermHudIsland("web")).resolves.toBe("existing-web");
        expect(mocks.selectNativeHudWidget).toHaveBeenCalledWith("existing-web", true);
        expect(mocks.createBlock).not.toHaveBeenCalled();
        expect(mocks.openNativeHudIsland).not.toHaveBeenCalled();
    });

    it("opens the canonical machine launcher without provisioning or booting any machine", async () => {
        await expect(launchKronTermHudIsland("machines")).resolves.toBe("hud-block-1");
        expect(mocks.createBlock).toHaveBeenCalledWith(
            {
                meta: {
                    view: "linux-vms",
                    "machine:kind": "desktop",
                    "machine:settings": false,
                    "machine:picker": false,
                },
            },
            { termsize: { rows: 25, cols: 80 } }
        );
        expect(mocks.openNativeHudIsland).toHaveBeenCalledWith({
            blockId: "hud-block-1",
            title: "Devices",
            view: "linux-vms",
        });
    });

    it("creates a live block without adding it to the main workspace layout", async () => {
        await expect(launchKronTermHudIsland("terminal")).resolves.toBe("hud-block-1");

        expect(mocks.createBlock).toHaveBeenCalledWith(
            { meta: { view: "term", controller: "shell" } },
            { termsize: { rows: 25, cols: 80 } }
        );
        expect(mocks.registerIsland).toHaveBeenCalledWith("hud-block-1");
        expect(mocks.openNativeHudIsland).toHaveBeenCalledWith({
            blockId: "hud-block-1",
            title: "Terminal",
            view: "term",
        });
        expect(mocks.deleteBlock).not.toHaveBeenCalled();
    });

    it("rolls back the detached block when its native panel cannot open", async () => {
        mocks.openNativeHudIsland.mockResolvedValueOnce(false);

        await expect(launchKronTermHudIsland("widget")).rejects.toThrow("native HUD host");
        expect(mocks.unregisterIsland).toHaveBeenCalledWith("hud-block-1");
        expect(mocks.deleteBlock).toHaveBeenCalledWith("hud-block-1");
    });
    it("creates an explicitly requested new editor even when another editor is open", async () => {
        mocks.getModels.mockReturnValueOnce([{ viewModel: { viewType: "codeeditor", blockId: "original" } }]);
        await expect(launchKronTermHudIsland("editor", { file: "/project/app.ts", forceNew: true })).resolves.toBe(
            "hud-block-1"
        );
        expect(mocks.createBlock).toHaveBeenCalledWith(
            { meta: { view: "codeeditor", file: "/project/app.ts" } },
            { termsize: { rows: 25, cols: 80 } }
        );
        expect(mocks.selectNativeHudWidget).not.toHaveBeenCalled();
    });

    it("reports incomplete diff launches without creating a broken widget", async () => {
        await expect(launchKronTermHudIsland("diff", { file: "/project/app.ts" })).rejects.toThrow("chatId");
        expect(mocks.createBlock).not.toHaveBeenCalled();
    });
});
