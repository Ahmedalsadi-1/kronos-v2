// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AgentActivityAction, AgentActivitySurface } from "./agent-activity";

export function agentActivityCaption(activity: {
    phase: string;
    action?: AgentActivityAction;
    surface?: AgentActivitySurface;
}): string {
    const lifecycle: Record<string, string> = {
        idle: "Ready when you are",
        queued: "Getting ready",
        "awaiting-approval": "Waiting for your approval",
        verifying: "Checking the result",
        succeeded: "Task complete",
        finish: "Task complete",
        degraded: "Working with limited access",
        failed: "Task needs attention",
        error: "Task needs attention",
        cancelled: "Task cancelled",
        paused: "Paused",
    };
    if (lifecycle[activity.phase]) return lifecycle[activity.phase];
    if (activity.action === "thinking") return "Thinking";
    if (activity.action === "verify") return "Checking the result";
    if (activity.action === "wait") return "Waiting";
    const surfaces: Record<AgentActivitySurface, string> = {
        browser: "browser",
        terminal: "terminal",
        file: "files",
        sandbox: "sandbox",
        desktop: "desktop",
        panel: "workspace",
    };
    const surface = surfaces[activity.surface] ?? "workspace";
    const verb = ["open", "focus"].includes(activity.action)
        ? "Opening"
        : ["inspect", "screenshot"].includes(activity.action)
          ? "Checking"
          : "Working in";
    return `${verb} ${surface === "files" ? "your" : "the"} ${surface}`;
}
