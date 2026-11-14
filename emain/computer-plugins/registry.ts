// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
    ComputerInstanceConfig,
    ComputerManagerCommand,
    ComputerManagerState,
    ComputerProviderId,
    LinuxDesktopAction,
} from "../../frontend/types/linux-desktops";
import type { PrivateBrowserInput } from "../guest-login";
import { runLinuxDesktopCommand } from "../linux-desktop/command-runner";
import { containerRuntimeStatus } from "../linux-desktop/upstream/openmaus/container-computer";
import { DATA_DIR } from "../linux-desktop/upstream/openmaus/kronterm-adapter";
import { OpenMausComputerPlugin } from "./openmaus";
import { QemuComputerPlugin } from "./qemu";
import type { ComputerProviderRuntime } from "./types";

const Providers = [
    {
        id: "cua-qemu" as const,
        name: "KronOS Linux",
        description: "Ubuntu 24.04 LTS with XFCE · Apple Silicon virtual machines · 2 CPU · 2 GB",
    },
    {
        id: "openmaus-container" as const,
        name: "OpenMausBot local computers",
        description: "Docker, Podman or Apple Container · Cua 0.37 · 2 CPU · 4 GB · persistent files and live desktop",
    },
];

export class ComputerPluginRegistry {
    private configs: ComputerInstanceConfig[] = [
        { id: "linux-vm:ubuntu", name: "KronOS Linux", provider: "cua-qemu", slot: 0 },
        { id: "linux-container:primary", name: "Local computer", provider: "openmaus-container", slot: 1 },
    ];
    private enabled: ComputerProviderId[] = ["cua-qemu", "openmaus-container"];
    private runtimes = new Map<string, ComputerProviderRuntime>();
    constructor(
        private file = join(DATA_DIR, "computer-plugins.json"),
        private factory?: (config: ComputerInstanceConfig) => ComputerProviderRuntime
    ) {
        if (!existsSync(file)) return;
        const saved = JSON.parse(readFileSync(file, "utf8"));
        if (!Array.isArray(saved.computers) || saved.computers.length > 32 || !Array.isArray(saved.enabled))
            throw new Error("Invalid computer plugin configuration.");
        const ids = new Set();
        const slots = new Set();
        for (const config of saved.computers) {
            if (
                !/^(linux-vm|linux-container):[a-zA-Z0-9-]+$/.test(config.id) ||
                !Providers.some((provider) => provider.id === config.provider) ||
                typeof config.name !== "string" ||
                !config.name.trim() ||
                config.name.length > 80 ||
                !Number.isSafeInteger(config.slot) ||
                config.slot < 0 ||
                config.slot >= 32 ||
                ids.has(config.id) ||
                slots.has(config.slot)
            )
                throw new Error("Invalid computer instance configuration.");
            ids.add(config.id);
            slots.add(config.slot);
        }
        this.configs = saved.computers.map((config: ComputerInstanceConfig) =>
            config.id === "linux-vm:ubuntu" && config.name === "Ubuntu" ? { ...config, name: "KronOS Linux" } : config
        );
        this.enabled = saved.enabled.filter((id) => Providers.some((provider) => provider.id === id));
    }
    state(): ComputerManagerState {
        return {
            plugins: Providers.map((plugin) => ({ ...plugin, enabled: this.enabled.includes(plugin.id) })),
            computers: structuredClone(this.configs),
        };
    }
    private save() {
        mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
        const temp = `${this.file}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify({ enabled: this.enabled, computers: this.configs }, null, 2), {
            mode: 0o600,
        });
        renameSync(temp, this.file);
    }
    async manage(command: ComputerManagerCommand): Promise<ComputerManagerState> {
        if (!command || typeof command !== "object") throw new Error("Invalid computer command.");
        if (command.action === "list") return this.state();
        if (command.action === "start-runtime") {
            if (command.provider !== "openmaus-container")
                throw new Error("Ubuntu VMs start directly; no container service is needed.");
            const status = await containerRuntimeStatus(runLinuxDesktopCommand);
            if (status.daemonUp) return this.state();
            if (status.runtime === "container") await runLinuxDesktopCommand("container", ["system", "start"], 120_000);
            else if (status.runtime === "podman") await runLinuxDesktopCommand("podman", ["machine", "start"], 120_000);
            else if (status.runtime === "docker" && process.platform === "darwin")
                await runLinuxDesktopCommand("open", ["-a", "Docker"]);
            else
                throw new Error(
                    "Install and start Docker Desktop, Podman, or Apple Container, then refresh Computers."
                );
            return this.state();
        }
        if (command.action === "plugin") {
            if (!Providers.some((provider) => provider.id === command.provider) || typeof command.enabled !== "boolean")
                throw new Error("Unknown computer plugin.");
            if (
                !command.enabled &&
                (await this.list()).some(
                    (desktop) => desktop.provider === command.provider && desktop.status === "running"
                )
            )
                throw new Error("Stop this plugin's computers before disabling it.");
            this.enabled = this.enabled.filter((id) => id !== command.provider);
            if (command.enabled) this.enabled.push(command.provider);
        } else if (command.action === "create") {
            if (!this.enabled.includes(command.provider) || this.configs.length >= 32)
                throw new Error("Enable the provider and keep at most 32 configured computers.");
            const name = command.name?.trim();
            if (!name || name.length > 80) throw new Error("Computer names must be 1–80 characters.");
            const slot = Array.from({ length: 32 }, (_, index) => index).find(
                (value) => !this.configs.some((config) => config.slot === value)
            );
            this.configs.push({
                id: `${command.provider === "cua-qemu" ? "linux-vm" : "linux-container"}:${randomUUID()}`,
                name,
                provider: command.provider,
                slot,
            });
        } else if (command.action === "rename") {
            const config = this.configs.find((config) => config.id === command.id);
            if (!config || !command.name?.trim() || command.name.length > 80) throw new Error("Invalid computer name.");
            config.name = command.name.trim();
        } else throw new Error("Unknown computer manager action.");
        this.save();
        return this.state();
    }
    private runtime(id: string): ComputerProviderRuntime {
        const config = this.configs.find((config) => config.id === id);
        if (!config || !this.enabled.includes(config.provider))
            throw new Error("This computer or provider is unavailable. Enable it in Settings → Computers.");
        let runtime = this.runtimes.get(id);
        if (!runtime) {
            runtime =
                this.factory?.(config) ??
                (config.provider === "cua-qemu"
                    ? new QemuComputerPlugin(config)
                    : new OpenMausComputerPlugin(config.id, config.name));
            this.runtimes.set(id, runtime);
        }
        return runtime;
    }
    async list() {
        return (
            await Promise.all(
                this.configs
                    .filter((config) => this.enabled.includes(config.provider))
                    .map(async (config) => {
                        const desktops = await this.runtime(config.id).list();
                        return desktops.map((desktop) => ({ ...desktop, name: config.name }));
                    })
            )
        ).flat();
    }
    perform(action: LinuxDesktopAction) {
        return this.runtime(action.desktopId).perform(action);
    }
    async desktop(id: string) {
        return (await this.runtime(id).list()).find((desktop) => desktop.id === id);
    }
    performAgent(action: LinuxDesktopAction) {
        return this.runtime(action.desktopId).performAgent(action);
    }
    assign(id: string, agentId: string, generation: number) {
        return this.runtime(id).assign(id, agentId, generation);
    }
    takeover(id: string, expected?: { agentId: string; generation: number }) {
        return this.runtime(id).takeover(id, expected);
    }
    resume(id: string, generation: number) {
        return this.runtime(id).resume(id, generation);
    }
    privateBrowser(id: string, generation: number, input: PrivateBrowserInput) {
        const runtime = this.runtime(id);
        if (!runtime.privateBrowser)
            throw new Error("Secure autofill is not available for this provider. Sign in directly in its browser.");
        return runtime.privateBrowser(id, generation, input);
    }
}
