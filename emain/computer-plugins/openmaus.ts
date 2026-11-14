// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { LinuxDesktop, LinuxDesktopAction, LinuxDesktopActionResult } from "../../frontend/types/linux-desktops";
import { rememberComputerControl, restoredComputerControl } from "../computer-access-policy";
import { runLinuxDesktopCommand } from "../linux-desktop/command-runner";
import {
    containerComputerAction,
    containerComputerScreenshot,
    containerComputerStatus,
    containerExec,
    CUA_SOCKET,
    cuaExecArgs,
    perBotLocalVmTarget,
    type CommandRunner,
} from "../linux-desktop/upstream/openmaus/container-computer";
import type { ComputerProviderRuntime } from "./types";

export class OpenMausComputerPlugin implements ComputerProviderRuntime {
    private generation = 0;
    private owner: "user" | "agent" = "user";
    private agentId: string;
    private queue = Promise.resolve();
    private busy = false;
    private idleTimer: ReturnType<typeof setTimeout>;
    private target;

    constructor(
        private id: string,
        private name: string,
        private runner: CommandRunner = runLinuxDesktopCommand,
        private platform = process.platform
    ) {
        this.target = perBotLocalVmTarget(`kronterm:${id}`);
        const restored = restoredComputerControl(id);
        if (restored) {
            this.owner = restored.owner;
            this.agentId = restored.agentId;
            this.generation = restored.generation;
        }
    }
    async list(): Promise<LinuxDesktop[]> {
        const status = await containerComputerStatus(this.runner, this.platform, this.target);
        return [
            {
                id: this.id,
                name: this.name,
                provider: "openmaus-container",
                runtime: `${status.runtime || "Docker / Podman"} · Cua ${status.driver_version} · 2 CPU · 4 GB`,
                status: !status.runtime || !status.daemonUp ? "unavailable" : status.container,
                ready: status.ready,
                imagePrepared: status.image,
                viewerUrl: status.container === "running" ? status.viewer_url : "",
                problem: this.busy ? "Updating computer…" : status.problem || undefined,
                workspacePath: status.workspace_path,
                controlOwner: this.owner,
                controlGeneration: this.generation,
                assignedAgentId: this.agentId,
            },
        ];
    }
    private check(id: string, generation?: number, agent = false, agentId?: string) {
        if (id !== this.id) throw new Error("Unknown sandbox computer.");
        if (generation != null && generation !== this.generation)
            throw new Error("Computer control changed. Refresh and retry.");
        if (agent && (this.owner !== "agent" || !agentId || agentId !== this.agentId))
            throw new Error("This computer is not assigned to this agent.");
    }
    async assign(id: string, agentId: string, generation: number) {
        this.check(id, generation);
        if (typeof agentId !== "string" || !agentId.trim() || agentId.length > 128)
            throw new Error("Invalid agent identity.");
        this.agentId = agentId;
        this.owner = "agent";
        this.generation++;
        rememberComputerControl(this.id, { owner: this.owner, agentId: this.agentId, generation: this.generation });
        return (await this.list())[0];
    }
    async takeover(id: string, expected?: { agentId: string; generation: number }) {
        this.check(id, expected?.generation, expected != null, expected?.agentId);
        this.owner = "user";
        this.generation++;
        rememberComputerControl(this.id, { owner: this.owner, agentId: this.agentId, generation: this.generation });
        return (await this.list())[0];
    }
    async resume(id: string, generation: number) {
        this.check(id, generation);
        if (!this.agentId) throw new Error("Assign an agent first.");
        this.owner = "agent";
        this.generation++;
        rememberComputerControl(this.id, { owner: this.owner, agentId: this.agentId, generation: this.generation });
        return (await this.list())[0];
    }
    perform(action: LinuxDesktopAction) {
        return this.enqueue(action, false);
    }
    performAgent(action: LinuxDesktopAction) {
        return this.enqueue(action, true);
    }
    private enqueue(input: LinuxDesktopAction, agent: boolean): Promise<LinuxDesktopActionResult> {
        const action = structuredClone(input);
        const pending = this.queue.then(() => this.execute(action, agent));
        this.queue = pending.then(
            () => undefined,
            () => undefined
        );
        return pending;
    }
    private async execute(action: LinuxDesktopAction, agent: boolean): Promise<LinuxDesktopActionResult> {
        this.check(action.desktopId, action.expectedGeneration, agent, action.assignedAgentId);
        if (agent && ["prepare", "create", "remove"].includes(action.action))
            throw new Error("Manage computer images in Settings → Computers.");
        this.busy = true;
        try {
            if (["prepare", "create", "start", "stop", "remove"].includes(action.action)) {
                const status = await containerComputerStatus(this.runner, this.platform, this.target);
                this.check(action.desktopId, action.expectedGeneration, agent, action.assignedAgentId);
                const lifecycle =
                    action.action === "prepare"
                        ? "pull"
                        : action.action === "create" || (action.action === "start" && status.container === "missing")
                          ? "run"
                          : action.action;
                if (!(action.action === "start" && status.container === "running"))
                    await containerComputerAction(lifecycle as any, this.runner, this.platform, this.target);
            } else if (action.action === "screenshot") {
                const frame = await containerComputerScreenshot(this.runner, this.platform, this.target);
                this.check(action.desktopId, action.expectedGeneration, agent, action.assignedAgentId);
                return { desktop: (await this.list())[0], imageDataUrl: frame };
            } else {
                const status = await containerComputerStatus(this.runner, this.platform, this.target);
                if (!status.ready || !status.runtime)
                    throw new Error(status.problem || "Start this sandbox computer first.");
                this.check(action.desktopId, action.expectedGeneration, agent, action.assignedAgentId);
                let output: string;
                if (action.action === "exec") {
                    const result = await containerExec(this.target, action.command || "", { runtime: status.runtime });
                    output = JSON.stringify(result);
                    if (result.exitCode !== 0)
                        throw new Error(`Guest command exited ${result.exitCode}: ${result.stderr || result.stdout}`);
                } else {
                    const tool =
                        action.action === "key" ? "press_key" : action.action === "type" ? "type_text" : action.action;
                    const params =
                        action.action === "type"
                            ? { text: action.text }
                            : action.action === "key"
                              ? { key: action.key, scope: "desktop" }
                              : {
                                    x: action.x,
                                    y: action.y,
                                    button: action.button || "left",
                                    ...(action.action === "scroll"
                                        ? {
                                              direction: (action.deltaY || action.deltaX || 1) < 0 ? "up" : "down",
                                              amount: Math.max(
                                                  1,
                                                  Math.min(
                                                      50,
                                                      Math.round(Math.abs(action.deltaY || action.deltaX || 40) / 40)
                                                  )
                                              ),
                                              by: "line",
                                              scope: "desktop",
                                          }
                                        : {}),
                                    ...(action.action === "drag" ? { end_x: action.endX, end_y: action.endY } : {}),
                                };
                    const result = await this.runner(
                        status.runtime,
                        cuaExecArgs(["call", tool, JSON.stringify(params), "--socket", CUA_SOCKET], {
                            container: this.target.containerName,
                        }),
                        80_000
                    );
                    output = result.stdout;
                    const value = JSON.parse(output);
                    if (value?.isError || value?.code || value?.error)
                        throw new Error("The guest rejected this input.");
                }
                this.check(action.desktopId, action.expectedGeneration, agent, action.assignedAgentId);
                return { desktop: (await this.list())[0], output };
            }
            return { desktop: (await this.list())[0] };
        } finally {
            this.busy = false;
            if (!["stop", "remove", "screenshot"].includes(action.action)) {
                clearTimeout(this.idleTimer);
                this.idleTimer = setTimeout(() => {
                    if (this.owner !== "agent") return;
                    void this.perform({
                        desktopId: this.id,
                        action: "stop",
                        expectedGeneration: this.generation,
                    }).catch(() => {});
                }, 300_000);
                this.idleTimer.unref?.();
            }
        }
    }
}
