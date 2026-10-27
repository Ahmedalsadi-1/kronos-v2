// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    classifyHarnessTask,
    formatAcpCapabilityLease,
    getAcpHarnessProfile,
    KronTermToolsets,
    makeAcpCapabilityLease,
} from "./acp-harness";

describe("ACP harness profiles", () => {
    it("describes the execution patterns KronosCode can borrow from specialist harnesses", () => {
        expect(getAcpHarnessProfile("hermes").patterns.map((pattern) => pattern.id)).toContain("prompt-tiers");
        expect(getAcpHarnessProfile("codex").patterns.map((pattern) => pattern.id)).toContain("bounded-workflows");
        expect(getAcpHarnessProfile("claude").patterns.map((pattern) => pattern.id)).toContain("lifecycle-hooks");
        expect(getAcpHarnessProfile("kronterm-agent").patterns.map((pattern) => pattern.id)).toContain(
            "native-surface-tools"
        );
    });

    it("falls back to a live-discovery profile for unknown ACP backends", () => {
        const profile = getAcpHarnessProfile("future-agent");
        expect(profile.backend).toBe("future-agent");
        expect(profile.summary).toContain("live protocol handshake");
    });
});

describe("ACP capability leases", () => {
    it("classifies workspace control before generic coding", () => {
        expect(classifyHarnessTask("Fix the KronTerm canvas widget bug").taskClass).toBe("workspace-control");
        expect(classifyHarnessTask("Debug a failing TypeScript test").taskClass).toBe("debugging");
    });

    it("grants only advertised protocol and scoped surface capabilities", () => {
        const lease = makeAcpCapabilityLease({
            backend: "hermes",
            capabilities: {
                loadSession: true,
                promptCapabilities: { image: false, audio: false, embeddedContext: true },
                mcpCapabilities: { stdio: true, http: false, sse: false },
                sessionCapabilities: { fork: null, resume: {}, list: null, close: {} },
                _meta: {},
            },
            content: "Research the runtime and review its architecture",
            surfaceAvailable: true,
            workspace: "/tmp/kronterm-project",
            ttlMs: 60_000,
        });

        expect(lease.capabilities).toContain("kronterm:surface");
        expect(lease.capabilities).toContain("mcp:stdio");
        expect(lease.capabilities).not.toContain("mcp:http");
        expect(lease.protocol.session).toEqual(["resume", "close"]);
        expect(lease.constraints).toMatchObject({
            filesystem: "workspace",
            writes: "approval-required",
            credentialAccess: "brokered-only",
        });
    });

    it("keeps shared skills and fast browser interactions discoverable for external agents", () => {
        const lease = makeAcpCapabilityLease({
            backend: "kilo",
            capabilities: null,
            content: "Open the browser tab",
            surfaceAvailable: true,
            workspace: "/tmp/project",
        });
        expect(lease.protocol.mcp).toContain("stdio");
        expect(lease.toolsets).toContain("skills");
        expect(KronTermToolsets.widget.tools).toContain("widget_sequence");
        expect(KronTermToolsets.browser.tools).toContain("browser_configure");
    });

    it("formats an explicit upper-bound policy for the specialist prompt", () => {
        const lease = makeAcpCapabilityLease({
            backend: "codex",
            capabilities: null,
            content: "Implement the parser",
            surfaceAvailable: false,
            workspace: "/tmp/project",
        });
        const prompt = formatAcpCapabilityLease(lease);
        expect(prompt).toContain("KronTerm Specialist Capability Lease");
        expect(prompt).toContain("approval-required");
        expect(prompt).toContain("Treat the lease as an upper bound");
    });
});

describe("KronTerm toolset registry", () => {
    it("groups every surface tool family into a named toolset", () => {
        const ids = Object.keys(KronTermToolsets);
        expect(ids).toContain("workspace");
        expect(ids).toContain("hud");
        expect(ids).toContain("widget");
        expect(ids).toContain("browser");
        expect(ids).toContain("terminal");
        expect(ids).toContain("sandbox");
        expect(ids).toContain("desktop");
        expect(ids).toContain("file");
        expect(ids).toContain("memory");
        expect(ids).toContain("skills");
        expect(ids).toContain("agents");
        expect(KronTermToolsets.desktop.tools).toContain("kron_computer_click");
        expect(KronTermToolsets.sandbox.tools).toContain("linux_desktop_start");
        expect(KronTermToolsets.sandbox.tools).toContain("sandbox_task_start");
        expect(KronTermToolsets.sandbox.tools).toContain("sandbox_task_finish");
        expect(KronTermToolsets.sandbox.tools).toContain("device_tap");
        expect(classifyHarnessTask("Use my iPhone to open Settings").taskClass).toBe("workspace-control");
        expect(KronTermToolsets.widget.tools).toContain("widget_snapshot");
        expect(KronTermToolsets.workspace.tools).toContain("workspace_snapshot");
        expect(KronTermToolsets.workspace.tools).toContain("workspace_set_presentation");
        expect(KronTermToolsets.workspace.tools).toContain("workspace_canvas_add_note");
        expect(KronTermToolsets.memory.tools).toContain("get_memories");
        expect(KronTermToolsets.hud.tools).toContain("hud_open_island");
        expect(KronTermToolsets.agents.tools).toContain("acp_run_agent");
    });

    it("recommends task-appropriate toolsets and surfaces them in the lease", () => {
        const lease = makeAcpCapabilityLease({
            backend: "kronoscode",
            capabilities: null,
            content: "Research the kron-term MCP surface and compare source options",
            surfaceAvailable: true,
            workspace: "/tmp/kronterm-project",
        });
        expect(lease.toolsets).toEqual(["browser", "file", "workspace", "skills", "agents"]);
        const prompt = formatAcpCapabilityLease(lease);
        expect(prompt).toContain("Recommended toolsets");
        expect(prompt).toContain("Browser");
        expect(prompt).toContain("browser_open_tab");
    });

    it("routes workspace-control requests to surface tool groups", () => {
        const lease = makeAcpCapabilityLease({
            backend: "kronoscode",
            capabilities: null,
            content: "Fix the KronTerm canvas widget bug",
            surfaceAvailable: true,
            workspace: "/tmp/kronterm-project",
        });
        expect(lease.toolsets).toEqual(["workspace", "hud", "widget", "sandbox", "desktop", "skills", "agents"]);
    });

    it("does not recommend recursive ACP delegation to a KronTerm Agent child", () => {
        const lease = makeAcpCapabilityLease({
            backend: "kronterm-agent",
            capabilities: null,
            content: "Implement the parser",
            surfaceAvailable: true,
            workspace: "/tmp/kronterm-project",
        });
        expect(lease.toolsets).toEqual(["file", "terminal", "lsp", "widget", "workspace", "skills"]);
        expect(formatAcpCapabilityLease(lease, ["acp_run_agent", "lsp_hover"])).not.toContain("acp_run_agent");
    });

    it("advertises every available family without inventing executable capabilities", () => {
        const lease = makeAcpCapabilityLease({
            backend: "kronoscode",
            capabilities: null,
            content: "Implement parser",
            surfaceAvailable: true,
            workspace: "/tmp/project",
        });
        const tools = [
            "lsp_hover",
            "canvas_snapshot",
            "workspace_os_action",
            "linux_desktop_batch",
            "device_key",
            "workflow_run",
            "tool_search",
        ];
        const prompt = formatAcpCapabilityLease(lease, tools);
        for (const name of tools) expect(prompt).toContain(name);
        expect(prompt).not.toContain("kron_computer_click");
        expect(prompt).toContain("Recommendations do not grant permissions");
        expect(prompt).toContain("Labs");
        expect(formatAcpCapabilityLease(lease, [])).toContain("None available in this session");
    });
});
