import { expect, it } from "vitest";
import { isToolAllowedBySurfaceCapability } from "../mcp-kron-term/src/surface-policy";
import { bindSandboxComputer, withSandboxComputerScope } from "./computer-access-policy";
import { resolveToolRequestContext, withToolRequestContext } from "./tool-request-context";

it("applies the current sandbox selection to each caller and denies host tools even with custom overrides", () => {
    bindSandboxComputer("tab-a", "linux-container:research");
    try {
        const context = withToolRequestContext({ tabId: "tab-a" }, () => resolveToolRequestContext(() => null));
        expect(context.sandboxComputerId).toBe("linux-container:research");
        const capability = {
            ...context,
            token: "fixture",
            capabilities: {
                browser: true,
                terminal: true,
                files: true,
                sandbox: true,
                computerControl: true,
                customTools: { terminal_run: true, kron_computer_click: true },
            },
        };
        for (const name of [
            "terminal_run",
            "file_read",
            "file_write",
            "kron_computer_click",
            "device_control",
            "linux_desktop_exec",
            "browser_evaluate",
            "widget_evaluate",
            "workflow_run",
        ])
            expect(isToolAllowedBySurfaceCapability(name, capability as any)).toBe(false);
        for (const name of [
            "sandbox_vm_status",
            "sandbox_vm_exec",
            "sandbox_vm_files",
            "sandbox_vm_browser",
            "sandbox_vm_desktop",
            "widget_click",
            "widget_snapshot",
            "tool_search",
        ])
            expect(isToolAllowedBySurfaceCapability(name, capability as any)).toBe(true);
        expect(withSandboxComputerScope({ tabId: "tab-b" }).sandboxComputerId).toBeUndefined();
        bindSandboxComputer("tab-a", "linux-vm:second");
        expect(withSandboxComputerScope({ tabId: "tab-a" }).sandboxComputerId).toBe("linux-vm:second");
    } finally {
        bindSandboxComputer("tab-a");
    }
});

it("uses the runtime chat's registered workspace instead of the focused chat and fails closed without identity", async () => {
    const { registerComputerChats, resolveComputerChatContext } = await import("./computer-access-policy");
    bindSandboxComputer("owner-tab", "linux-vm:one");
    bindSandboxComputer("focused-tab", "linux-container:two");
    registerComputerChats("owner-tab", ["live-one", "stored-one"], "owner-workspace");
    registerComputerChats("focused-tab", ["live-two"], "focused-workspace");
    try {
        const focused = {
            tabId: "focused-tab",
            workspaceId: "focused-workspace",
            agentRuntime: "hermes" as const,
            sandboxComputerId: "linux-container:two",
        };
        expect(resolveComputerChatContext(focused, "live-one")).toMatchObject({
            tabId: "owner-tab",
            workspaceId: "owner-workspace",
            sandboxComputerId: "linux-vm:one",
            toolSessionId: "live-one",
        });
        expect(resolveComputerChatContext(focused, "stored-one").sandboxComputerId).toBe("linux-vm:one");
        expect(() => resolveComputerChatContext(focused)).toThrow("no registered Computer scope");
        expect(() => resolveComputerChatContext(focused, "forged-session")).toThrow("no registered Computer scope");
        registerComputerChats("another-tab", ["live-one"]);
        expect(resolveComputerChatContext(focused, "live-one").tabId).toBe("owner-tab");
    } finally {
        bindSandboxComputer("owner-tab");
        bindSandboxComputer("focused-tab");
    }
});

it("advertises workspace and VM tools together only for an explicit Hybrid grant", () => {
    bindSandboxComputer("hybrid-tab", "linux-vm:ubuntu", "hybrid");
    try {
        const scope = withSandboxComputerScope({ tabId: "hybrid-tab" });
        expect(scope.sandboxComputerMode).toBe("hybrid");
        const capability = { ...scope, token: "fixture" };
        for (const name of [
            "terminal_run",
            "file_read",
            "browser_navigate",
            "widget_click",
            "workspace_snapshot",
            "n8n_search_nodes",
            "n8n_edit_workflow",
            "sandbox_vm_exec",
            "sandbox_vm_desktop",
        ])
            expect(isToolAllowedBySurfaceCapability(name, capability as any)).toBe(true);
        for (const name of ["kron_computer_click", "device_control", "linux_desktop_exec"])
            expect(isToolAllowedBySurfaceCapability(name, capability as any)).toBe(false);
        expect(
            isToolAllowedBySurfaceCapability("terminal_run", { ...capability, delegationScope: "sandbox" } as any)
        ).toBe(false);
        bindSandboxComputer("hybrid-tab", "linux-vm:ubuntu");
        const sandboxCapability = { ...withSandboxComputerScope({ tabId: "hybrid-tab" }), token: "fixture" };
        for (const name of ["terminal_run", "n8n_search_nodes", "n8n_edit_workflow"])
            expect(isToolAllowedBySurfaceCapability(name, sandboxCapability as any)).toBe(false);
    } finally {
        bindSandboxComputer("hybrid-tab");
    }
});
