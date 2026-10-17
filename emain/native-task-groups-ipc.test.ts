// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerNativeTaskGroupsIpc } from "./native-task-groups-ipc";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), tab: vi.fn(), manage: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("./emain-tabview", () => ({ getWaveTabViewByWebContentsId: mocks.tab }));
vi.mock("../mcp-kron-term/src/background-workspace-tools", () => ({ manageNativeBackgroundWorkspaces: mocks.manage }));

describe("native task groups IPC", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tab.mockReturnValue({ waveTabId: "trusted-tab" });
        mocks.manage.mockResolvedValue({ workspaces: [] });
        registerNativeTaskGroupsIpc();
    });
    const event = () => {
        const frame = {};
        return { sender: { id: 7, mainFrame: frame }, senderFrame: frame };
    };
    const handler = () => mocks.handle.mock.calls[0][1];

    it("derives ownership from sender and discards injected scope", async () => {
        await handler()(event(), { operation: "list", scopeId: "other-tab" });
        expect(mocks.manage).toHaveBeenCalledWith("list", expect.objectContaining({ scopeId: "trusted-tab" }));
    });
    it("routes human review and return through sender-derived scope without exposing resume", async () => {
        for (const operation of ["reveal", "return_windows", "preview"]) {
            const result = await handler()(event(), {
                operation,
                sessionId: "group",
                bundleId: "com.apple.TextEdit",
                scopeId: "injected",
                displayId: 999,
                windowIds: [999],
            });
            expect(result.success).toBe(true);
            expect(mocks.manage).toHaveBeenLastCalledWith(operation, {
                scopeId: "trusted-tab",
                sessionId: "group",
                bundleId: "com.apple.TextEdit",
                windowId: undefined,
            });
        }
        expect((await handler()(event(), { operation: "return_windows" })).success).toBe(false);
        expect((await handler()(event(), { operation: "resume", sessionId: "group" })).success).toBe(false);
        expect(mocks.manage).toHaveBeenCalledTimes(3);
    });
    it("rejects guest frames and unregistered senders", async () => {
        const frameEvent = event();
        frameEvent.senderFrame = {};
        expect((await handler()(frameEvent, { operation: "list" })).success).toBe(false);
        mocks.tab.mockReturnValue(null);
        expect((await handler()(event(), { operation: "list" })).success).toBe(false);
        expect(mocks.manage).not.toHaveBeenCalled();
    });
    it("never exposes native actions or agent resume through management", async () => {
        for (const operation of ["launch", "resume", "click", "observe"]) {
            expect((await handler()(event(), { operation, sessionId: "group" })).success).toBe(false);
        }
        expect(mocks.manage).not.toHaveBeenCalled();
    });
    it("rejects malformed window approval without invoking registry", async () => {
        expect(
            (await handler()(event(), { operation: "approve_window", sessionId: "group", windowId: -1 })).success
        ).toBe(false);
        expect(mocks.manage).not.toHaveBeenCalled();
    });
    it("returns registry failures without reporting success", async () => {
        mocks.manage.mockRejectedValue(new Error("Group belongs to another workspace"));
        expect(await handler()(event(), { operation: "finish", sessionId: "foreign" })).toEqual({
            success: false,
            error: { code: "native-task-group-error", message: "Group belongs to another workspace" },
        });
    });
});
