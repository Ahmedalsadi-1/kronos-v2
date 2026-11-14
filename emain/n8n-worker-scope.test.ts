import { expect, it } from "vitest";
import {
    bindSandboxComputer,
    registerComputerChats,
    resolveComputerChatContext,
    withSandboxComputerScope,
} from "./computer-access-policy";
import { pinWorkflowComputerAction, validateWorkflowComputerGrant } from "./n8n-worker-scope";
it("pins a workflow worker to its original VM and refuses switching or regranting control", () => {
    const context = {
        n8nWorkerId: "worker",
        agentRuntime: "hermes" as const,
        tabId: "vm-test-tab",
        workspaceId: "workspace",
        sandboxComputerId: "vm-1",
        sandboxComputerGeneration: 4,
        sandboxComputerMode: "sandbox" as const,
    };
    const desktop = {
        id: "vm-1",
        ready: true,
        controlOwner: "agent",
        assignedAgentId: "sandbox:vm-test-tab",
        controlGeneration: 4,
    };
    bindSandboxComputer(context.tabId, "vm-1");
    registerComputerChats(context.tabId, ["vm-workflow-test"], context.workspaceId);
    try {
        expect(resolveComputerChatContext(context, "vm-workflow-test").sandboxComputerId).toBe("vm-1");
        expect(() => validateWorkflowComputerGrant(context, [desktop])).not.toThrow();
        const action = { desktopId: "vm-1", assignedAgentId: desktop.assignedAgentId, expectedGeneration: 4 };
        expect(pinWorkflowComputerAction(context, action).expectedGeneration).toBe(4);
        expect(() => pinWorkflowComputerAction(context, { ...action, expectedGeneration: 5 })).toThrow("grant changed");
        expect(() => pinWorkflowComputerAction(context, { ...action, desktopId: "vm-2" })).toThrow("grant changed");
        expect(() => validateWorkflowComputerGrant(context, [{ ...desktop, controlGeneration: 5 }])).toThrow(
            "grant changed"
        );
        expect(() => validateWorkflowComputerGrant(context, [{ ...desktop, controlOwner: "human" }])).toThrow(
            "grant changed"
        );
        bindSandboxComputer(context.tabId, "vm-2");
        expect(() => resolveComputerChatContext(context, "vm-workflow-test")).toThrow("grant changed");
        expect(() => withSandboxComputerScope(context)).toThrow("grant changed");
    } finally {
        bindSandboxComputer(context.tabId);
    }
});
