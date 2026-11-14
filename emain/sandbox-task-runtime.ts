// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { LinuxDesktop } from "../frontend/types/linux-desktops";
import type { LinuxDesktopFleetRuntime } from "./linux-desktops-runtime";

type TaskStart = { desktopId: string; assignedAgentId: string; expectedGeneration: number; taskId: string };
type TaskSession = TaskStart & { sessionId: string; startedByTask: boolean; finished?: "complete" | "preserved" };

function preservedResult(sessionId: string) {
    return {
        sessionId,
        finished: true,
        stopped: false,
        preserved: true,
        reason: "Control changed; sandbox left untouched.",
    };
}

class SandboxControlChanged extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class SandboxTaskRuntime {
    private sessions = new Map<string, TaskSession>();
    private pending = new Set<string>();

    constructor(private desktops: Pick<LinuxDesktopFleetRuntime, "list" | "performAgent">) {}

    private async current(session: TaskStart): Promise<LinuxDesktop> {
        const desktop = (await this.desktops.list()).find((item) => item.id === session.desktopId);
        if (
            !desktop ||
            desktop.controlOwner !== "agent" ||
            desktop.assignedAgentId !== session.assignedAgentId ||
            desktop.controlGeneration !== session.expectedGeneration
        ) {
            throw new SandboxControlChanged(
                "Sandbox control changed. Ask the user to assign or resume access; do not reclaim control."
            );
        }
        return desktop;
    }

    async start(args: TaskStart) {
        if (
            typeof args.desktopId !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(args.desktopId) ||
            typeof args.assignedAgentId !== "string" ||
            !args.assignedAgentId.trim() ||
            args.assignedAgentId.length > 128 ||
            !Number.isSafeInteger(args.expectedGeneration) ||
            args.expectedGeneration < 0
        )
            throw new Error("Invalid sandbox task reservation.");
        if (typeof args.taskId !== "string" || !args.taskId.trim() || args.taskId.length > 128)
            throw new Error("A bounded task ID is required.");
        if (this.pending.has(args.desktopId)) throw new Error("Sandbox task operation already pending.");
        this.pending.add(args.desktopId);
        try {
            let desktop = await this.current(args);
            const existing = [...this.sessions.values()].find(
                (item) => !item.finished && item.desktopId === args.desktopId
            );
            if (existing) {
                if (
                    existing.assignedAgentId === args.assignedAgentId &&
                    existing.expectedGeneration === args.expectedGeneration
                ) {
                    if (existing.taskId !== args.taskId) throw new Error("Sandbox already has an active task.");
                    return { sessionId: existing.sessionId, desktop, startedByTask: existing.startedByTask };
                }
                existing.finished = "preserved";
            }
            if (this.sessions.size >= 128) {
                for (const [id, session] of this.sessions) if (session.finished) this.sessions.delete(id);
                if (this.sessions.size >= 128) throw new Error("Finish an existing sandbox task first.");
            }
            if (!["running", "stopped"].includes(desktop.status))
                throw new Error("Prepare the sandbox in its settings before starting a task.");
            const startedByTask = desktop.status === "stopped";
            const session: TaskSession = { ...args, sessionId: randomUUID(), startedByTask };
            // Keep the lease even if startup fails so the caller can explicitly clean up a partial start.
            this.sessions.set(session.sessionId, session);
            try {
                if (startedByTask) desktop = (await this.desktops.performAgent({ ...args, action: "start" })).desktop;
                return { sessionId: session.sessionId, desktop, startedByTask };
            } catch (error) {
                throw new Error(
                    `Sandbox startup failed; cleanup with sandbox_task_finish sessionId=${session.sessionId}. ${error instanceof Error ? error.message : "Unknown error"}`
                );
            }
        } finally {
            this.pending.delete(args.desktopId);
        }
    }

    async finish(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error("Unknown sandbox task session; cleanup cannot stop an arbitrary desktop.");
        if (session.finished === "preserved") return preservedResult(sessionId);
        if (session.finished) return { sessionId, finished: true };
        if (this.pending.has(session.desktopId)) throw new Error("Sandbox task operation already pending.");
        this.pending.add(session.desktopId);
        try {
            let desktop: LinuxDesktop;
            try {
                desktop = await this.current(session);
            } catch (error) {
                if (!(error instanceof SandboxControlChanged)) throw error;
                session.finished = "preserved";
                return preservedResult(sessionId);
            }
            if (desktop.status === "running") {
                desktop = (await this.desktops.performAgent({ ...session, action: "stop" })).desktop;
            }
            session.finished = "complete";
            return { sessionId, finished: true, stopped: desktop.status === "stopped", desktop };
        } finally {
            this.pending.delete(session.desktopId);
        }
    }
}
