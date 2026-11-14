import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isToolAllowedBySurfaceCapability } from "../src/native-bridge";

const WebCapability = {
    token: "token",
    tabId: "tab",
    workspaceId: "workspace",
    hostMode: "web-fullscreen" as const,
    capabilities: {
        browser: true,
        terminal: true,
        files: true,
        sandbox: true,
        computerControl: false,
    },
};

describe("Hermes native bridge capability policy", () => {
    it("keeps the full KronOS toolset outside web mode", () => {
        assert.equal(
            isToolAllowedBySurfaceCapability("workspace_snapshot", { ...WebCapability, hostMode: "kronterm" }),
            true
        );
    });

    it("exposes web-agent families but not workspace mutation or computer control by default", () => {
        assert.equal(isToolAllowedBySurfaceCapability("browser_navigate", WebCapability), true);
        assert.equal(isToolAllowedBySurfaceCapability("terminal_open", WebCapability), true);
        assert.equal(isToolAllowedBySurfaceCapability("file_read", WebCapability), true);
        assert.equal(isToolAllowedBySurfaceCapability("sandbox_click", WebCapability), true);
        assert.equal(isToolAllowedBySurfaceCapability("workspace_move_widget", WebCapability), false);
        assert.equal(isToolAllowedBySurfaceCapability("kron_computer_click", WebCapability), false);
    });

    it("honors per-tool overrides", () => {
        const capability = {
            ...WebCapability,
            capabilities: { ...WebCapability.capabilities, customTools: { terminal_open: false } },
        };
        assert.equal(isToolAllowedBySurfaceCapability("terminal_open", capability), false);
    });

    it("restores workspace tools when the host returns to KronOS mode", () => {
        assert.equal(isToolAllowedBySurfaceCapability("workspace_snapshot", WebCapability), false);
        assert.equal(
            isToolAllowedBySurfaceCapability("workspace_snapshot", { ...WebCapability, hostMode: "kronterm" }),
            true
        );
    });
});
