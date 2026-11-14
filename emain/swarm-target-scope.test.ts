// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import { assertSwarmToolCall, isSwarmToolAllowed, swarmBlockTarget, swarmWorkerContext } from "./swarm-target-scope";

const Parent = { workspaceId: "workspace", tabId: "tab" };
const Browser = swarmBlockTarget({
    tabid: "tab",
    blockid: "web-block",
    meta: { view: "web", url: "https://example.com", "web:partition": "persist:work" },
});

describe("swarm target grants", () => {
    test("keeps browser tools on the exact block and excludes shared or host tools", () => {
        const context = swarmWorkerContext(Parent, "run", Browser);
        expect(Browser.resourceKeys).toContain("browser-session:persist:work");
        expect(() => assertSwarmToolCall(context, "widget_click", { blockId: "web-block" })).not.toThrow();
        for (const args of [
            {},
            { blockId: "this" },
            { blockId: "other" },
            { blockId: "web-block", targetTabId: "other" },
        ]) {
            expect(() => assertSwarmToolCall(context, "widget_click", args)).toThrow();
        }
        for (const tool of [
            "browser_open",
            "widget_clipboard_get",
            "terminal_input",
            "kron_computer_click",
            "acp_run_agent",
            "swarm_run",
        ]) {
            expect(isSwarmToolAllowed(context, tool)).toBe(false);
        }
    });

    test("withholds every surface tool from the planner and excludes local/host widgets from discovery", () => {
        expect(isSwarmToolAllowed({ ...Parent, swarmRunId: "run", swarmPlanning: true }, "widget_snapshot")).toBe(
            false
        );
        expect(swarmBlockTarget({ tabid: "tab", blockid: "term", meta: { view: "term" } })).toBeUndefined();
        expect(
            swarmBlockTarget({
                tabid: "tab",
                blockid: "file",
                meta: { view: "web", url: "file:///private/file" },
            })
        ).toBeUndefined();
    });

    test("requires exact device ID and the granted generation before mutation", () => {
        const context = swarmWorkerContext(Parent, "run", {
            kind: "device",
            id: "device:phone",
            deviceId: "phone",
            generation: 7,
            resourceKeys: ["device:phone"],
            label: "Phone",
        });
        expect(() => assertSwarmToolCall(context, "device_screenshot", { targetId: "phone" })).not.toThrow();
        expect(() => assertSwarmToolCall(context, "device_tap", { targetId: "phone", expectedGeneration: 6 })).toThrow(
            "generation"
        );
        expect(() => assertSwarmToolCall(context, "device_tap", { targetId: "other", expectedGeneration: 7 })).toThrow(
            "exact"
        );
        expect(() =>
            assertSwarmToolCall(context, "device_tap", { targetId: "phone", expectedGeneration: 7 })
        ).not.toThrow();
        expect(isSwarmToolAllowed(context, "device_assign")).toBe(false);
    });

    test("pins the chosen VM in hybrid mode and rejects extra VMs in exclusive Computer mode", () => {
        const target = {
            kind: "vm" as const,
            id: "vm:two",
            desktopId: "two",
            generation: 3,
            resourceKeys: ["vm:two"],
            label: "Second VM",
        };
        expect(() => swarmWorkerContext({ ...Parent, sandboxComputerId: "one" }, "run", target)).toThrow();
        const context = swarmWorkerContext(
            { ...Parent, sandboxComputerId: "one", sandboxComputerMode: "hybrid" },
            "run",
            target
        );
        expect(context.sandboxComputerId).toBe("two");
        expect(() => assertSwarmToolCall(context, "sandbox_vm_browser", { action: "snapshot" })).not.toThrow();
        expect(() => assertSwarmToolCall(context, "sandbox_vm_desktop", { action: "screenshot" })).not.toThrow();
        for (const action of ["start", "stop"]) {
            expect(() => assertSwarmToolCall(context, "sandbox_vm_desktop", { action })).toThrow("start or stop");
        }
        const args = { desktopId: "two", assignedAgentId: "sandbox:tab", expectedGeneration: 3 };
        expect(() => assertSwarmToolCall(context, "linux_desktop_screenshot", args)).not.toThrow();
        expect(() =>
            assertSwarmToolCall(context, "linux_desktop_click", { ...args, assignedAgentId: "other" })
        ).toThrow();
        expect(isSwarmToolAllowed(context, "sandbox_vm_login")).toBe(false);
        expect(isSwarmToolAllowed(context, "linux_desktop_start")).toBe(false);
    });
});
