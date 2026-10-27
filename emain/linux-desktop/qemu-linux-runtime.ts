// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LinuxDesktop, LinuxDesktopAction, LinuxDesktopActionResult } from "../../frontend/types/linux-desktops";
import { normalizeToolResult, ToolOperationContext } from "../../mcp-kron-term/src/tool-execution";
import { runLinuxDesktopCommand } from "./command-runner";
import { linuxVmQemuArgs, makeLinuxVmCloudInit, makeLinuxVmMetadata } from "./qemu-provision";
import { DATA_DIR } from "./upstream/openmaus/kronterm-adapter";

const VmId = "linux-vm:ubuntu";
const SshPort = 59622;
const Directory = join(DATA_DIR, "qemu");
const BaseUrl = "https://cloud-images.ubuntu.com/noble/20260926/noble-server-cloudimg-arm64.img";
const CloudImageSha = "1d6bffe64b848468ac97f821d369a4846d983de1800ccf6b5ec8853e85cefc55";
const Actions = new Set([
    "prepare",
    "create",
    "start",
    "stop",
    "remove",
    "screenshot",
    "click",
    "drag",
    "type",
    "key",
    "scroll",
    "exec",
]);

export class QemuLinuxDesktopRuntime {
    private generation = 0;
    private owner: "user" | "agent" = "user";
    private assignedAgentId: string;
    private busy = false;
    private progress: string;
    private queue = Promise.resolve();
    private screenshotPromise: Promise<LinuxDesktopActionResult>;
    private queuedCount = 0;
    private statusCache: { desktop: LinuxDesktop; time: number };
    private idleTimer: ReturnType<typeof setTimeout>;
    private startupGrace = false;

    private scheduleIdle(ms = 300_000) {
        this.startupGrace = ms > 300_000;
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            const action: LinuxDesktopAction = {
                desktopId: VmId,
                action: "stop",
                expectedGeneration: this.generation,
                assignedAgentId: this.assignedAgentId,
            };
            ToolOperationContext.exit(() => {
                void this.queued(action, this.owner === "agent").catch(() => this.scheduleIdle());
            });
        }, ms);
        this.idleTimer.unref?.();
    }
    constructor(
        private runner = runLinuxDesktopCommand,
        private platform = process.platform,
        private architecture = process.arch
    ) {}

    private async exists(file: string): Promise<boolean> {
        return stat(file)
            .then((s) => s.size > 0)
            .catch(() => false);
    }
    private async pid(): Promise<number> {
        try {
            const pid = Number((await readFile(join(Directory, "qemu.pid"), "utf8")).trim());
            if (!Number.isInteger(pid) || pid < 2) return undefined;
            process.kill(pid, 0);
            const { stdout } = await this.runner("ps", ["-p", String(pid), "-o", "command="], 3000);
            return stdout.includes("qemu-system-aarch64") && stdout.includes(join(Directory, "ubuntu.qcow2"))
                ? pid
                : undefined;
        } catch {
            return undefined;
        }
    }
    private async ssh(command: string, timeout = 15_000) {
        return this.runner(
            "ssh",
            [
                "-i",
                join(Directory, "id_ed25519"),
                "-p",
                String(SshPort),
                "-o",
                "BatchMode=yes",
                "-o",
                "ControlMaster=auto",
                "-o",
                "ControlPersist=60",
                "-o",
                `ControlPath=${join(Directory, "ssh-control")}`,
                "-o",
                "ConnectTimeout=3",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "-o",
                `UserKnownHostsFile=${join(Directory, "known_hosts")}`,
                "cua@127.0.0.1",
                command,
            ],
            timeout
        );
    }
    async list(): Promise<LinuxDesktop[]> {
        if (this.statusCache && Date.now() - this.statusCache.time < 2000) {
            return [
                {
                    ...this.statusCache.desktop,
                    controlOwner: this.owner,
                    controlGeneration: this.generation,
                    assignedAgentId: this.assignedAgentId,
                },
            ];
        }
        if (this.platform !== "darwin" || this.architecture !== "arm64") {
            return [
                {
                    id: VmId,
                    name: "Ubuntu Virtual Machine",
                    provider: "cua-qemu",
                    runtime: "QEMU · ARM64",
                    status: "unavailable",
                    ready: false,
                    imagePrepared: false,
                    viewerUrl: "",
                    problem: "This QEMU VM backend currently requires Apple Silicon macOS.",
                    controlOwner: this.owner,
                    controlGeneration: this.generation,
                    assignedAgentId: this.assignedAgentId,
                    workspacePath: Directory,
                },
            ];
        }
        const prepared =
            (await this.exists(join(Directory, "ubuntu.qcow2"))) && (await this.exists(join(Directory, "seed.iso")));
        const running = Boolean(await this.pid());
        let ready = false;
        if (running) {
            try {
                await this.ssh(
                    "DISPLAY=:1 /usr/local/bin/cua-driver status --socket /run/kronterm-cua/kronterm-cua.sock",
                    15_000
                );
                ready = true;
            } catch {}
        }
        const desktops: LinuxDesktop[] = [
            {
                id: VmId,
                name: "Ubuntu Virtual Machine",
                provider: "cua-qemu",
                runtime: "QEMU · ARM64 · 2 CPU · 2 GB",
                status: running ? "running" : prepared ? "stopped" : "missing",
                ready,
                imagePrepared: prepared,
                viewerUrl: "",
                problem: ready
                    ? undefined
                    : this.progress ||
                      (running
                          ? "Ubuntu is starting and installing its desktop and CUA driver."
                          : prepared
                            ? "Start the virtual machine."
                            : "Prepare Ubuntu VM: 620 MB download plus desktop packages."),
                controlOwner: this.owner,
                controlGeneration: this.generation,
                assignedAgentId: this.assignedAgentId,
                workspacePath: Directory,
            },
        ];
        this.statusCache = { desktop: desktops[0], time: Date.now() };
        // Observation does not renew the idle lease.
        if (running && (!this.idleTimer || (ready && this.startupGrace)))
            this.scheduleIdle(ready ? 300_000 : 1_200_000);
        return desktops;
    }
    private id(id: string) {
        if (id !== VmId) throw new Error("Unknown Linux VM.");
    }
    async assign(id: string, agentId: string, generation: number) {
        this.id(id);
        if (generation !== this.generation || typeof agentId !== "string" || !agentId.trim() || agentId.length > 128)
            throw new Error("Refresh and provide a valid agent identity.");
        this.owner = "agent";
        this.assignedAgentId = agentId;
        this.generation++;
        return (await this.list())[0];
    }
    async takeover(id: string) {
        this.id(id);
        this.owner = "user";
        this.generation++;
        return (await this.list())[0];
    }
    async resume(id: string, generation: number) {
        this.id(id);
        if (generation !== this.generation || !this.assignedAgentId)
            throw new Error("Refresh and assign an agent before resuming.");
        this.owner = "agent";
        this.generation++;
        return (await this.list())[0];
    }
    private check(action: LinuxDesktopAction, agent: boolean) {
        ToolOperationContext.getStore()?.signal.throwIfAborted();
        this.id(action.desktopId);
        if (!Actions.has(action.action)) throw new Error("Unsupported Linux VM action.");
        if (
            agent
                ? this.owner !== "agent" ||
                  action.assignedAgentId !== this.assignedAgentId ||
                  !this.assignedAgentId ||
                  action.expectedGeneration !== this.generation
                : action.action !== "screenshot" &&
                  (this.owner !== "user" || action.expectedGeneration !== this.generation)
        )
            throw new Error("Control changed. Refresh and wait for desktop assignment or takeover.");
        if (this.platform !== "darwin" || this.architecture !== "arm64")
            throw new Error("QEMU VM requires Apple Silicon macOS.");
    }
    async performAgent(action: LinuxDesktopAction) {
        if (["prepare", "create", "remove"].includes(action.action))
            throw new Error("VM provisioning requires the management UI.");
        return this.queued(action, true);
    }
    async perform(action: LinuxDesktopAction) {
        return this.queued(action, false);
    }
    private queued(action: LinuxDesktopAction, agent: boolean): Promise<LinuxDesktopActionResult> {
        action = structuredClone(action);
        this.check(action, agent);
        if (action.action !== "screenshot") this.screenshotPromise = undefined;
        if (action.action === "screenshot" && this.screenshotPromise) {
            return this.screenshotPromise.then((result) => {
                this.check(action, agent);
                return result;
            });
        }
        if (this.queuedCount >= 16) return Promise.reject(new Error("Linux VM request queue is full."));
        this.queuedCount++;
        const pending = this.queue
            .then(() => this.execute(action, agent))
            .finally(() => {
                this.queuedCount--;
            });
        this.queue = pending.then(
            () => undefined,
            () => undefined
        );
        if (action.action === "screenshot") {
            this.screenshotPromise = pending;
            pending
                .finally(() => {
                    if (this.screenshotPromise === pending) this.screenshotPromise = undefined;
                })
                .catch(() => {});
        }
        return pending;
    }
    private async prepare(check: () => void) {
        if (await this.pid()) throw new Error("Stop the VM before preparing its disk.");
        check();
        await mkdir(Directory, { recursive: true, mode: 0o700 });
        const base = join(Directory, "ubuntu-base.qcow2");
        if (!(await this.exists(base))) {
            this.progress = "Downloading Ubuntu ARM64 (620 MB)…";
            await this.runner("curl", ["--fail", "--location", BaseUrl, "-o", `${base}.part`], 20 * 60_000);
            check();
            await this.runner("mv", [`${base}.part`, base]);
        }
        const hash = await this.runner("shasum", ["-a", "256", base], 120_000);
        if (!hash.stdout.startsWith(CloudImageSha))
            throw new Error("Ubuntu image checksum does not match the pinned release.");
        if (!(await this.exists(join(Directory, "id_ed25519"))))
            await this.runner("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(Directory, "id_ed25519")]);
        const publicKey = await readFile(join(Directory, "id_ed25519.pub"), "utf8");
        check();
        const seed = join(Directory, "cidata");
        await mkdir(seed, { recursive: true, mode: 0o700 });
        await writeFile(join(seed, "user-data"), makeLinuxVmCloudInit(publicKey));
        await writeFile(join(seed, "meta-data"), makeLinuxVmMetadata());
        if (!(await this.exists(join(Directory, "ubuntu.qcow2")))) {
            await this.runner("qemu-img", [
                "create",
                "-f",
                "qcow2",
                "-F",
                "qcow2",
                "-b",
                base,
                join(Directory, "ubuntu.qcow2"),
                "20G",
            ]);
        }
        await rm(join(Directory, "seed.iso"), { force: true });
        check();
        await this.runner("hdiutil", [
            "makehybrid",
            "-o",
            join(Directory, "seed.iso"),
            "-joliet",
            "-iso",
            "-default-volume-name",
            "cidata",
            seed,
        ]);
        this.progress = undefined;
    }
    private async execute(action: LinuxDesktopAction, agent: boolean): Promise<LinuxDesktopActionResult> {
        this.check(action, agent);
        if (this.busy) throw new Error("Linux VM is busy.");
        this.busy = true;
        try {
            if (action.action !== "screenshot") this.scheduleIdle();
            if (["prepare", "create", "start", "stop", "remove"].includes(action.action)) this.statusCache = undefined;
            if (action.action === "prepare") await this.prepare(() => this.check(action, agent));
            else if (action.action === "create" || action.action === "start") {
                if (!(await this.exists(join(Directory, "seed.iso")))) throw new Error("Prepare the VM first.");
                if (!(await this.pid())) {
                    this.check(action, agent);
                    await this.runner("qemu-system-aarch64", linuxVmQemuArgs(Directory, SshPort), 30_000);
                    this.scheduleIdle(1_200_000);
                }
            } else if (action.action === "stop") {
                const pid = await this.pid();
                this.check(action, agent);
                if (pid) process.kill(pid, "SIGTERM");
                clearTimeout(this.idleTimer);
                this.idleTimer = undefined;
                this.statusCache = undefined;
            } else if (action.action === "remove") {
                if (await this.pid()) throw new Error("Stop the VM before removing it.");
                this.check(action, agent);
                await rm(join(Directory, "ubuntu.qcow2"), { force: true });
                this.check(action, agent);
                await rm(join(Directory, "seed.iso"), { force: true });
                this.check(action, agent);
                await rm(join(Directory, "known_hosts"), { force: true });
            } else {
                const desktop = (await this.list())[0];
                this.check(action, agent);
                if (!desktop.ready) throw new Error(desktop.problem || "VM desktop is not ready.");
                if (action.action === "screenshot") {
                    const { stdout } = await this.ssh(
                        "DISPLAY=:1 /usr/local/bin/cua-driver call get_desktop_state '{}' --socket /run/kronterm-cua/kronterm-cua.sock --screenshot-out-file /tmp/kronterm-frame.png >/dev/null && base64 -w0 /tmp/kronterm-frame.png",
                        30_000
                    );
                    const bytes = Buffer.from(stdout.trim(), "base64");
                    this.check(action, agent);
                    if (
                        !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
                        bytes.length < 512 ||
                        bytes.length > 20 * 1024 * 1024 ||
                        !bytes.subarray(-12).includes(Buffer.from("IEND"))
                    )
                        throw new Error("Incomplete VM frame.");
                    return { desktop, imageDataUrl: `data:image/png;base64,${stdout.trim()}` };
                }
                let command: string;
                const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
                if (action.action === "exec") {
                    if (typeof action.command !== "string" || !action.command.trim() || action.command.length > 20_000)
                        throw new Error("Invalid guest command.");
                    command = `cd /home/cua/workspace && timeout -k 5 60 sh -lc ${quote(action.command)}`;
                } else {
                    let tool: string;
                    let params: Record<string, unknown>;
                    if (action.action === "click") {
                        if (![action.x, action.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 16384))
                            throw new Error("Invalid click coordinates.");
                        tool = "click";
                        if (action.button != null && !["left", "right", "middle"].includes(action.button))
                            throw new Error("Invalid mouse button.");
                        if (action.count != null && ![1, 2].includes(action.count))
                            throw new Error("Invalid click count.");
                        params = {
                            scope: "desktop",
                            delivery_mode: "foreground",
                            x: action.x,
                            y: action.y,
                            button: action.button ?? "left",
                            count: action.count ?? 1,
                        };
                    } else if (action.action === "drag") {
                        if (
                            ![action.x, action.y, action.endX, action.endY].every(
                                (v) => Number.isFinite(v) && v >= 0 && v <= 16384
                            )
                        )
                            throw new Error("Invalid drag coordinates.");
                        tool = "drag";
                        params = {
                            scope: "desktop",
                            delivery_mode: "foreground",
                            from_x: action.x,
                            from_y: action.y,
                            to_x: action.endX,
                            to_y: action.endY,
                            duration_ms: 200,
                            steps: 10,
                        };
                    } else if (action.action === "type") {
                        if (typeof action.text !== "string" || action.text.length > 10_000)
                            throw new Error("Invalid text.");
                        tool = "type_text";
                        params = { scope: "desktop", delivery_mode: "foreground", text: action.text };
                    } else if (action.action === "key") {
                        if (typeof action.key !== "string" || !action.key.trim() || action.key.length > 80)
                            throw new Error("Invalid key.");
                        tool = "press_key";
                        const aliases = {
                            control: "ctrl",
                            command: "super",
                            cmd: "super",
                            meta: "super",
                            option: "alt",
                        };
                        const parts = action.key.split("+");
                        const modifiers: string[] = [];
                        while (parts.length > 1) {
                            const part = parts[0].toLowerCase();
                            const modifier = aliases[part] ?? part;
                            if (!["ctrl", "alt", "shift", "super"].includes(modifier)) break;
                            modifiers.push(modifier);
                            parts.shift();
                        }
                        if (!parts.join("+").trim()) throw new Error("Invalid shortcut key.");
                        params = { scope: "desktop", delivery_mode: "foreground", key: parts.join("+"), modifiers };
                    } else {
                        if (
                            ![action.x ?? 512, action.y ?? 320].every((v) => Number.isFinite(v) && v >= 0 && v <= 16384)
                        )
                            throw new Error("Invalid scroll coordinates.");
                        const dx = action.deltaX ?? 0;
                        const dy = action.deltaY ?? 0;
                        if (![dx, dy].every((value) => Number.isFinite(value) && Math.abs(value) <= 10_000))
                            throw new Error("Invalid scroll.");
                        if (dx === 0 && dy === 0) return { desktop };
                        const vertical = Math.abs(dy) >= Math.abs(dx);
                        const delta = vertical ? dy : dx;
                        tool = "scroll";
                        params = {
                            scope: "desktop",
                            delivery_mode: "foreground",
                            x: action.x ?? 512,
                            y: action.y ?? 320,
                            direction: vertical ? (delta < 0 ? "up" : "down") : delta < 0 ? "left" : "right",
                            by: "line",
                            amount: Math.max(1, Math.min(50, Math.round(Math.abs(delta) / 40))),
                        };
                    }
                    command = `DISPLAY=:1 CUA_DRIVER_RS_TELEMETRY_ENABLED=0 /usr/local/bin/cua-driver call ${tool} ${quote(JSON.stringify(params))} --socket /run/kronterm-cua/kronterm-cua.sock`;
                }
                this.check(action, agent);
                const { stdout } = await this.ssh(command, 80_000);
                this.check(action, agent);
                if (action.action !== "exec") {
                    let result: { code?: string; isError?: boolean; error?: unknown; message?: string };
                    try {
                        result = JSON.parse(stdout);
                    } catch {
                        throw new Error("Guest driver returned an invalid input response.");
                    }
                    if (!result || typeof result !== "object")
                        throw new Error("Guest driver returned an invalid input response.");
                    if (result.code || normalizeToolResult(result).isError)
                        throw new Error(
                            `Guest input failed: ${result.code || result.message || JSON.stringify(result.error) || "driver rejected action"}`
                        );
                }
                return { desktop, output: stdout.slice(0, 20_000) };
            }
            return { desktop: (await this.list())[0] };
        } catch (error) {
            this.statusCache = undefined;
            throw error;
        } finally {
            this.busy = false;
        }
    }
}
