// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { linuxDesktopResult } from "./linux-desktop-tools.js";

type SandboxComputerBridge = (tool: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
let bridge: SandboxComputerBridge;
export function setSandboxComputerBridge(next: SandboxComputerBridge) {
    bridge = next;
}
export function registerSandboxComputerTools(server: McpServer) {
    const register = (name: string, description: string, schema: z.ZodRawShape) => {
        server.tool(name, description, schema, async (args, extra) => {
            try {
                if (!bridge) throw new Error("Use the KronOS desktop's authenticated MCP endpoint for sandbox tools.");
                return linuxDesktopResult(await bridge(name, args, extra.signal));
            } catch (failure) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text" as const,
                            text: failure instanceof Error ? failure.message : "Sandbox tool failed.",
                        },
                    ],
                };
            }
        });
    };
    register(
        "delegation_status",
        "Inspect this chat or worker’s current delegation scope and sandbox readiness before assigning a specialist job.",
        {}
    );
    register(
        "sandbox_vm_status",
        "Inspect the sandbox computer selected by the user for this workspace. Returns task owner IDs, guest workspace and filesystem-sharing policy. In Hybrid, inspect this before moving work between widgets and guest. All sandbox_vm tools target this exact VM; they cannot select another computer or access the host.",
        {}
    );
    register(
        "sandbox_vm_login",
        "Request sign-in for an exact HTTPS website in the selected VM, or inspect an existing request by requestId. Checks the page first and opens a secure login card only when it detects a sign-in step. Never pass passwords, cookies, MFA codes or vault credentials as tool arguments. The card supports 1Password or private manual entry, remembers account-specific Ask/Automatic preferences, and returns control only through the user's completion action. If phase is unverified, inspect the task page for signed-in access or a login gate before retrying; no card was opened. A reused session must still be verified against the website for the requested task or account. Other agent tools pause during sign-in. Navigate to the website first with sandbox_vm_browser. If phase is choose/review, explain that the user should finish the login card and wait; do not keep polling or attempt to operate the login UI.",
        {
            action: z.enum(["request", "status"]),
            origin: z.string().max(2048).optional(),
            account: z.string().max(160).optional(),
            requestId: z.string().uuid().optional(),
        }
    );
    register(
        "sandbox_vm_handback",
        "Return the selected sandbox screen to the user only when the overall task is complete, the user explicitly requests control, or direct human input is necessary. Do not call at model-turn boundaries, ordinary questions, pauses or intermediate step completion. Leaves the VM and browser session running, revokes agent input, and requires the user's Return to agent action before further control. Only the parent chat may hand back control; delegated workers report completion to their parent.",
        {
            reason: z
                .enum(["task-complete", "user-request", "human-input"])
                .describe(
                    "Why control must be returned now. A turn boundary or ordinary pause is not a handback reason."
                ),
        }
    );
    register(
        "sandbox_vm_login_preferences",
        "List, remember or forget account sign-in preferences for the selected VM and exact HTTPS website origin. Remember opens a trusted user dialog to choose Ask first (default) or Automatic for this account. Stores only an account label and policy, never passwords, tokens or cookies. Preferences are not credential access grants and this tool does not perform sign-in. Use the browser's existing persistent session; if login is needed and no secure credential broker is available, hand back to the user.",
        {
            action: z.enum(["list", "remember", "forget"]),
            origin: z.string().max(2048).optional(),
            account: z.string().min(1).max(160).optional(),
        }
    );
    register(
        "sandbox_vm_history",
        "List, create or restore named checkpoints of the selected QEMU VM. Live checkpoints include memory; stopped checkpoints contain disk only. Restore first saves the departing state and advances the control generation: reobserve afterward. This rolls back guest files and apps, not external actions. Older running VMs require one restart to enable live history. Containers do not support this tool.",
        {
            action: z.enum(["list", "create", "restore"]),
            label: z.string().min(1).max(160).optional(),
            checkpointId: z.string().max(80).optional(),
        }
    );
    register(
        "sandbox_vm_exec",
        "Run a shell command directly in the assigned sandbox VM with a 55-second execution limit. Returns exitCode, stdout, stderr, timedOut, durationMs and truncated, including failed tests and builds. Output is limited to 3000 bytes per stream; redirect longer logs to a file and read it afterward. Working directory is /home/cua/workspace. Never executes on the host.",
        { command: z.string().min(1).max(20000) }
    );
    register(
        "sandbox_vm_files",
        "List, read, write, edit or create directories inside the assigned sandbox VM. Relative paths are resolved under /home/cua/workspace. Read returns sha256; edit requires expectedSha256 and an oldText match occurring exactly once, plus newText. Edits preserve permissions and reject changed files. Read in pages using offset (nextOffset is returned); writes are limited to 1 MB. This is a separate filesystem from workspace file tools: copy required text explicitly, retain both paths, and read back to verify; there is no automatic sync.",
        {
            action: z.enum(["list", "read", "write", "mkdir", "edit"]),
            path: z.string().max(4096),
            text: z.string().max(1048576).optional(),
            offset: z.number().int().min(0).optional(),
            expectedSha256: z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .optional(),
            oldText: z.string().min(1).max(3000).optional(),
            newText: z.string().max(3000).optional(),
        }
    );
    register(
        "sandbox_vm_browser",
        "Control the Chromium browser running inside the assigned sandbox VM using its loopback CDP endpoint. state returns page text and links and can open a private sign-in popup when it finds a visible login form. After navigating to a sign-in page, call state. If it returns a pending login, tell the user to finish the popup and wait for control to return. tabs lists page IDs; pass pageId when multiple pages are open. navigate opens a URL; click/fill require a unique visible selector; wait waits for a unique visible selector; scroll targets the scrollable container under x/y or selector and returns actual pixel movement on both axes. Prefer scroll over desktop wheel input for web content. Inspect moved/actual to detect boundaries. evaluate runs JavaScript for DOM actions. Starts the guest browser if needed.",
        {
            action: z.enum(["tabs", "state", "navigate", "evaluate", "click", "fill", "scroll", "wait"]),
            url: z.string().max(8192).optional(),
            expression: z.string().max(6000).optional(),
            pageId: z.string().max(200).optional(),
            selector: z.string().max(1000).optional(),
            text: z.string().max(3000).optional(),
            timeoutMs: z.number().int().min(100).max(10000).optional(),
            x: z.number().min(0).max(16384).optional(),
            y: z.number().min(0).max(16384).optional(),
            deltaX: z.number().min(-10000).max(10000).optional(),
            deltaY: z.number().min(-10000).max(10000).optional(),
        }
    );
    register(
        "sandbox_vm_desktop",
        "Capture or control only the selected sandbox desktop. Never controls the host desktop. Input returns an after-image by default; inspect it before another dependent action. Desktop wheel movement is quantized to lines; prefer sandbox_vm_browser scroll for web content and measured pixel movement. Start or stop the prepared VM using action start/stop; image downloads are managed in Settings → Computers.",
        {
            action: z.enum(["screenshot", "click", "drag", "type", "key", "scroll", "start", "stop"]),
            observe: z
                .boolean()
                .default(true)
                .describe(
                    "Return an after-image after input; inspect it before the next dependent action. Set false only for a known sequence."
                ),
            x: z.number().min(0).max(16384).optional(),
            y: z.number().min(0).max(16384).optional(),
            endX: z.number().min(0).max(16384).optional(),
            endY: z.number().min(0).max(16384).optional(),
            text: z.string().max(20000).optional(),
            key: z.string().max(120).optional(),
            deltaX: z.number().min(-10000).max(10000).optional(),
            deltaY: z.number().min(-10000).max(10000).optional(),
        }
    );
}
