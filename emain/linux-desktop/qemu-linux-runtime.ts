// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import type { LinuxDesktop, LinuxDesktopAction, LinuxDesktopActionResult } from "../../frontend/types/linux-desktops";
import { SandboxLoginProviders } from "../../frontend/types/sandbox-login";
import { normalizeToolResult, ToolOperationContext } from "../../mcp-kron-term/src/tool-execution";
import {
    hasComputerInteraction,
    hasWorkspaceComputerAssignment,
    rememberComputerControl,
    restoredComputerControl,
} from "../computer-access-policy";
import { GuestLogin, type PrivateBrowserInput, type PrivateBrowserResult } from "../guest-login";
import { runPrivateGuestCommand } from "../private-guest-command";
import { runLinuxDesktopCommand } from "./command-runner";
import { LinuxGuestSources } from "./guest-assets";
import {
    linuxVmQemuArgs,
    linuxVmQemuDrive,
    LinuxVmVncSetup,
    makeLinuxVmCloudInit,
    makeLinuxVmMetadata,
} from "./qemu-provision";
import { QemuVncBridge } from "./qemu-vnc-bridge";
import { DATA_DIR } from "./upstream/openmaus/kronterm-adapter";
import { VmHistoryStore } from "./vm-history";
import { isManagedQemu } from "./vm-process";

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
    "pick-element",
    "click",
    "drag",
    "type",
    "key",
    "scroll",
    "exec",
    "history",
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
    private statusProbe: Promise<LinuxDesktop>;
    private statusRevision = 0;
    private guestHealth: { pid: number; checkedAt: number };
    private idleTimer: ReturnType<typeof setTimeout>;
    private startupGrace = false;
    private viewerUrl = "";
    private viewerSetup: Promise<void>;
    private viewerRetryAt = 0;
    private viewerError = "";
    private vncBridge = new QemuVncBridge(undefined, () => this.scheduleIdle());

    private configureViewer() {
        if (this.viewerUrl || this.viewerSetup || Date.now() < this.viewerRetryAt) return;
        const setup = (async () => {
            await this.ssh(LinuxVmVncSetup, 300_000);
            if (this.viewerSetup !== setup) return;
            const url = await this.vncBridge.open(this.sshArgs());
            if (this.viewerSetup !== setup) return;
            this.viewerUrl = url;
            this.viewerError = "";
        })()
            .catch((error) => {
                if (this.viewerSetup !== setup) return;
                this.viewerError = `Computer connection setup failed: ${error instanceof Error ? error.message : error}`;
                this.viewerRetryAt = Date.now() + 15_000;
            })
            .finally(() => {
                if (this.viewerSetup !== setup) return;
                this.viewerSetup = undefined;
                this.statusCache = undefined;
            });
        this.viewerSetup = setup;
    }

    private resetViewer() {
        this.viewerSetup = undefined;
        this.vncBridge.close();
        this.viewerUrl = "";
        this.viewerError = "";
        this.viewerRetryAt = 0;
    }

    private scheduleIdle(ms = 300_000) {
        this.startupGrace = ms > 300_000;
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (
                hasComputerInteraction(this.vmId) ||
                (this.owner === "agent" && hasWorkspaceComputerAssignment(this.vmId, this.assignedAgentId))
            ) {
                this.scheduleIdle();
                return;
            }
            const action: LinuxDesktopAction = {
                desktopId: this.vmId,
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
        private architecture = process.arch,
        private vmId = VmId,
        private directory = Directory,
        private sshPort = SshPort
    ) {
        const restored = restoredComputerControl(this.vmId);
        if (restored) {
            this.owner = restored.owner;
            this.assignedAgentId = restored.agentId;
            this.generation = restored.generation;
        }
    }

    private async exists(file: string): Promise<boolean> {
        return stat(file)
            .then((s) => s.size > 0)
            .catch(() => false);
    }
    private async pid(): Promise<number> {
        let contents: string;
        try {
            contents = await readFile(join(this.directory, "qemu.pid"), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
        const pid = Number(contents.trim());
        if (!Number.isInteger(pid) || pid < 2 || pid > 0x7fffffff) return undefined;
        return isManagedQemu(pid, linuxVmQemuDrive(this.directory)) ? pid : undefined;
    }
    private sshArgs(command?: string): string[] {
        return [
            "-i",
            join(this.directory, "id_ed25519"),
            "-p",
            String(this.sshPort),
            "-o",
            "BatchMode=yes",
            "-o",
            "ControlMaster=auto",
            "-o",
            "ControlPersist=60",
            "-o",
            `ControlPath=${join(this.directory, "ssh-control")}`,
            "-o",
            "ConnectTimeout=3",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            `UserKnownHostsFile=${join(this.directory, "known_hosts")}`,
            "cua@127.0.0.1",
            ...(command == null ? [] : [command]),
        ];
    }
    private async ssh(command: string, timeout = 15_000) {
        return this.runner("ssh", this.sshArgs(command), timeout);
    }
    private invalidateStatus() {
        this.statusCache = undefined;
        this.statusProbe = undefined;
        this.statusRevision++;
    }
    async list(): Promise<LinuxDesktop[]> {
        const revision = this.statusRevision;
        const desktop =
            this.statusCache && Date.now() - this.statusCache.time < 2000
                ? this.statusCache.desktop
                : await (this.statusProbe ??= this.probeStatus(revision).finally(() => {
                      if (revision === this.statusRevision) this.statusProbe = undefined;
                  }));
        if (revision !== this.statusRevision) return this.list();
        return [
            {
                ...desktop,
                controlOwner: this.owner,
                controlGeneration: this.generation,
                assignedAgentId: this.assignedAgentId,
            },
        ];
    }
    private async probeStatus(revision: number): Promise<LinuxDesktop> {
        if (this.platform !== "darwin" || this.architecture !== "arm64") {
            return {
                id: this.vmId,
                name: "KronOS Linux",
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
                workspacePath: this.directory,
            };
        }
        const [disk, seed, runningPid] = await Promise.all([
            this.exists(join(this.directory, "ubuntu.qcow2")),
            this.exists(join(this.directory, "seed.iso")),
            this.pid(),
        ]);
        if (revision !== this.statusRevision) return;
        const prepared = disk && seed;
        const running = Boolean(runningPid);
        if (this.guestHealth?.pid !== runningPid) this.guestHealth = undefined;
        let ready = running && this.guestHealth != null && Date.now() - this.guestHealth.checkedAt < 15_000;
        if (running && !ready) {
            try {
                await this.ssh(
                    (this.guestHealth == null
                        ? "cloud-init status 2>/dev/null | grep -Eq '^status: ((degraded )?done|degraded)$' && "
                        : "") +
                        "DISPLAY=:1 /usr/local/bin/cua-driver status --socket /run/kronterm-cua/kronterm-cua.sock",
                    15_000
                );
                if (revision !== this.statusRevision) return;
                ready = true;
                this.guestHealth = { pid: runningPid, checkedAt: Date.now() };
            } catch {
                if (revision !== this.statusRevision) return;
                this.guestHealth = undefined;
            }
        }
        if (ready) this.configureViewer();
        if (!running) this.resetViewer();
        const desktop: LinuxDesktop = {
            id: this.vmId,
            name: "KronOS Linux",
            provider: "cua-qemu",
            runtime: "QEMU · ARM64 · 2 CPU · 2 GB",
            status: running ? "running" : prepared ? "stopped" : "missing",
            ready,
            imagePrepared: prepared,
            viewerUrl: ready ? this.viewerUrl : "",
            problem: ready
                ? this.viewerError || (this.viewerUrl ? undefined : "Configuring the VM computer connection…")
                : this.progress ||
                  (running
                      ? "Ubuntu is starting and installing its desktop and CUA driver."
                      : prepared
                        ? "Start the virtual machine."
                        : "First launch downloads Ubuntu 24.04 LTS (620 MB) and installs the desktop."),
            controlOwner: this.owner,
            controlGeneration: this.generation,
            assignedAgentId: this.assignedAgentId,
            workspacePath: this.directory,
        };
        this.statusCache = { desktop, time: Date.now() };
        // Observation does not renew the idle lease.
        if (running && (!this.idleTimer || (ready && this.startupGrace)))
            this.scheduleIdle(ready ? 300_000 : 1_200_000);
        return desktop;
    }
    private id(id: string) {
        if (id !== this.vmId) throw new Error("Unknown Linux VM.");
    }
    async assign(id: string, agentId: string, generation: number) {
        this.id(id);
        if (generation !== this.generation || typeof agentId !== "string" || !agentId.trim() || agentId.length > 128)
            throw new Error("Refresh and provide a valid agent identity.");
        this.owner = "agent";
        this.assignedAgentId = agentId;
        this.generation++;
        rememberComputerControl(this.vmId, {
            owner: this.owner,
            agentId: this.assignedAgentId,
            generation: this.generation,
        });
        return (await this.list())[0];
    }
    async takeover(id: string, expected?: { agentId: string; generation: number }) {
        this.id(id);
        if (
            expected &&
            (this.owner !== "agent" ||
                expected.agentId !== this.assignedAgentId ||
                expected.generation !== this.generation)
        )
            throw new Error("Control changed. Refresh and wait for desktop assignment or takeover.");
        this.owner = "user";
        this.generation++;
        rememberComputerControl(this.vmId, {
            owner: this.owner,
            agentId: this.assignedAgentId,
            generation: this.generation,
        });
        return (await this.list())[0];
    }
    async resume(id: string, generation: number) {
        this.id(id);
        if (generation !== this.generation || !this.assignedAgentId)
            throw new Error("Refresh and assign an agent before resuming.");
        this.owner = "agent";
        this.generation++;
        rememberComputerControl(this.vmId, {
            owner: this.owner,
            agentId: this.assignedAgentId,
            generation: this.generation,
        });
        return (await this.list())[0];
    }
    privateBrowser(id: string, generation: number, input: PrivateBrowserInput): Promise<PrivateBrowserResult> {
        const action: LinuxDesktopAction = { desktopId: id, action: "exec", expectedGeneration: generation };
        const agentId = input.action === "inspect" ? input.agentId : undefined;
        if (agentId) action.assignedAgentId = agentId;
        const pending = this.queue.then(async () => {
            this.check(action, Boolean(agentId));
            this.scheduleIdle();
            const script = Buffer.from(GuestLogin).toString("base64");
            const output = await runPrivateGuestCommand(
                "ssh",
                this.sshArgs(`python3 -c "import base64;exec(base64.b64decode('${script}'))"`),
                JSON.stringify(input)
            );
            this.check(action, Boolean(agentId));
            let result: any;
            try {
                result = JSON.parse(output);
            } catch {
                throw new Error("Invalid secure browser response.");
            }
            if (
                !["submitted", "needs-user", "ready"].includes(result?.phase) ||
                typeof result.passwordVisible !== "boolean" ||
                !["required", "authenticated", "unknown"].includes(result.status) ||
                !Array.isArray(result.providers) ||
                result.providers.length > SandboxLoginProviders.length ||
                result.providers.some((provider) => !SandboxLoginProviders.includes(provider))
            )
                throw new Error("Invalid secure browser response.");
            return {
                phase: result.phase,
                passwordVisible: result.passwordVisible,
                status: result.status,
                providers: [...new Set<PrivateBrowserResult["providers"][number]>(result.providers)],
                registration: result.registration === true,
                signUpAvailable: result.signUpAvailable === true,
            };
        });
        this.queue = pending.then(
            () => undefined,
            () => undefined
        );
        return pending;
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
                : action.action === "pick-element"
                  ? action.expectedGeneration !== this.generation
                  : action.action !== "screenshot" &&
                    !(action.action === "history" && action.historyAction === "list") &&
                    (this.owner !== "user" || action.expectedGeneration !== this.generation)
        )
            throw new Error("Control changed. Refresh and wait for desktop assignment or takeover.");
        if (this.platform !== "darwin" || this.architecture !== "arm64")
            throw new Error("QEMU VM requires Apple Silicon macOS.");
    }
    async performAgent(action: LinuxDesktopAction) {
        if (["prepare", "create", "remove", "pick-element"].includes(action.action))
            throw new Error("VM provisioning requires the management UI.");
        return this.queued(action, true);
    }
    async perform(action: LinuxDesktopAction) {
        return this.queued(action, false);
    }
    private queued(action: LinuxDesktopAction, agent: boolean): Promise<LinuxDesktopActionResult> {
        action = structuredClone(action);
        this.check(action, agent);
        if (action.action !== "screenshot" && action.action !== "pick-element") this.screenshotPromise = undefined;
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
        await this.runner("qemu-system-aarch64", ["--version"]).catch((error) => {
            if (error.code !== "ENOENT") throw error;
            throw new Error("Install QEMU with Homebrew (brew install qemu), then launch KronOS Linux again.");
        });
        check();
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const base = join(this.directory, "ubuntu-base.qcow2");
        const verifyImage = async (path: string) => {
            const hash = await this.runner("shasum", ["-a", "256", path], 120_000);
            if (hash.stdout.split(/\s+/, 1)[0] !== CloudImageSha)
                throw new Error("Ubuntu image checksum does not match the pinned release.");
            check();
        };
        if (await this.exists(base)) {
            await verifyImage(base);
        } else {
            const partial = `${base}.part`;
            try {
                this.progress = "Downloading Ubuntu ARM64 (620 MB)…";
                await this.runner("curl", ["--fail", "--location", BaseUrl, "-o", partial], 20 * 60_000);
                check();
                await verifyImage(partial);
                await rename(partial, base);
            } finally {
                await rm(partial, { force: true });
                this.progress = undefined;
            }
        }
        if (!(await this.exists(join(this.directory, "id_ed25519"))))
            await this.runner("ssh-keygen", [
                "-q",
                "-t",
                "ed25519",
                "-N",
                "",
                "-f",
                join(this.directory, "id_ed25519"),
            ]);
        const publicKey = await readFile(join(this.directory, "id_ed25519.pub"), "utf8");
        check();
        const seed = join(this.directory, "cidata");
        await mkdir(seed, { recursive: true, mode: 0o700 });
        let wallpaper: Buffer;
        for (const asset of ["../frontend/guest/liquid-chrome.png", "../../public/guest/liquid-chrome.png"]) {
            try {
                wallpaper = await readFile(new URL(asset, import.meta.url));
                break;
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }
        if (wallpaper == null) throw new Error("The bundled computer wallpaper is missing. Rebuild KronOS.");
        await writeFile(join(seed, "user-data"), makeLinuxVmCloudInit(publicKey, wallpaper.toString("base64")));
        await writeFile(join(seed, "meta-data"), makeLinuxVmMetadata());
        if (!(await this.exists(join(this.directory, "ubuntu.qcow2")))) {
            await this.runner("qemu-img", [
                "create",
                "-f",
                "qcow2",
                "-F",
                "qcow2",
                "-b",
                base,
                join(this.directory, "ubuntu.qcow2"),
                "20G",
            ]);
        }
        await rm(join(this.directory, "seed.iso"), { force: true });
        check();
        await this.runner("hdiutil", [
            "makehybrid",
            "-o",
            join(this.directory, "seed.iso"),
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
        if (action.action === "scroll" && action.deltaX && action.deltaY) {
            if (![action.deltaX, action.deltaY].every((value) => Number.isFinite(value) && Math.abs(value) <= 10000))
                throw new Error("Invalid scroll.");
            await this.execute({ ...action, deltaY: 0 }, agent);
            return this.execute({ ...action, deltaX: 0 }, agent);
        }
        this.busy = true;
        try {
            const changesLifecycle = ["prepare", "create", "start", "stop", "remove"].includes(action.action);
            if (!changesLifecycle && action.action !== "screenshot" && action.action !== "pick-element")
                this.scheduleIdle();
            if (changesLifecycle) this.invalidateStatus();
            if (action.action === "history") {
                const running = Boolean(await this.pid());
                this.check(action, agent);
                if (running) {
                    try {
                        await stat(join(this.directory, "qmp.sock"));
                    } catch {
                        throw new Error(
                            "Restart this VM once to enable live checkpoints, or stop it for disk-only history."
                        );
                    }
                }
                const history = new VmHistoryStore(this.directory, this.runner);
                let result;
                const check = () => this.check(action, agent);
                if (action.historyAction === "list") result = await history.list(running);
                else if (action.historyAction === "create") result = await history.create(action.label, running, check);
                else if (action.historyAction === "restore") {
                    try {
                        result = await history.restore(action.checkpointId, running, check);
                    } finally {
                        // A lost monitor reply or metadata failure can follow a successful restore.
                        this.generation++;
                        rememberComputerControl(this.vmId, {
                            owner: this.owner,
                            agentId: this.assignedAgentId,
                            generation: this.generation,
                        });
                        this.guestHealth = undefined;
                        this.resetViewer();
                        if (running) await this.runner("ssh", ["-O", "exit", ...this.sshArgs()], 5000).catch(() => {});
                        this.invalidateStatus();
                    }
                } else throw new Error("Unknown history action.");
                return { desktop: (await this.list())[0], history: result };
            }
            if (action.action === "prepare") await this.prepare(() => this.check(action, agent));
            else if (action.action === "create" || action.action === "start") {
                if (!(await this.pid())) {
                    const [disk, seed] = await Promise.all([
                        this.exists(join(this.directory, "ubuntu.qcow2")),
                        this.exists(join(this.directory, "seed.iso")),
                    ]);
                    if (!disk || !seed) {
                        if (action.action !== "create")
                            throw new Error("Open the desktop in KronOS to prepare it first.");
                        await this.prepare(() => this.check(action, agent));
                    }
                    this.check(action, agent);
                    await this.runner("qemu-system-aarch64", linuxVmQemuArgs(this.directory, this.sshPort), 30_000);
                    this.scheduleIdle(1_200_000);
                }
            } else if (action.action === "stop") {
                const pid = await this.pid();
                this.check(action, agent);
                if (pid) {
                    try {
                        await this.ssh("sudo systemd-run --on-active=1s --quiet /usr/bin/systemctl poweroff", 5000);
                    } catch {
                        this.check(action, agent);
                        if (this.guestHealth) throw new Error("Could not shut down the guest. Try Stop VM again.");
                        if ((await this.pid()) === pid) {
                            this.check(action, agent);
                            process.kill(pid, "SIGTERM");
                        }
                    }
                    const deadline = Date.now() + 30_000;
                    while ((await this.pid()) === pid) {
                        if (Date.now() >= deadline)
                            throw new Error("The guest is still shutting down. Try again shortly.");
                        await wait(250);
                    }
                }
                this.guestHealth = undefined;
                this.resetViewer();
                clearTimeout(this.idleTimer);
                this.idleTimer = undefined;
            } else if (action.action === "remove") {
                if (await this.pid()) throw new Error("Stop the VM before removing it.");
                this.check(action, agent);
                await rm(join(this.directory, "ubuntu.qcow2"), { force: true });
                this.check(action, agent);
                await rm(join(this.directory, "seed.iso"), { force: true });
                this.check(action, agent);
                await rm(join(this.directory, "known_hosts"), { force: true });
            } else {
                const desktop = (await this.list())[0];
                this.check(action, agent);
                if (!desktop.ready) throw new Error(desktop.problem || "VM desktop is not ready.");
                if (action.action === "pick-element") {
                    const { x, y } = action;
                    if (![x, y].every((value) => Number.isInteger(value) && value >= 0 && value < 16384))
                        throw new Error("Invalid VM selection coordinates.");
                    const script = Buffer.from(LinuxGuestSources["pick-element.py"]).toString("base64");
                    const result = await this.ssh(
                        `DISPLAY=:1 python3 -c "import base64;exec(base64.b64decode('${script}'))" ${x} ${y}`,
                        4000
                    ).catch(() => undefined);
                    this.check(action, agent);
                    if (!result?.stdout || result.stdout.length > 2048) return { desktop };
                    const { application, role, name, frame } = JSON.parse(result.stdout);
                    if (
                        typeof role !== "string" ||
                        !frame ||
                        ![frame.x, frame.y, frame.width, frame.height].every(Number.isInteger) ||
                        frame.width <= 0 ||
                        frame.height <= 0 ||
                        x < frame.x ||
                        x >= frame.x + frame.width ||
                        y < frame.y ||
                        y >= frame.y + frame.height
                    )
                        return { desktop };
                    return {
                        desktop,
                        element: {
                            role: role.slice(0, 100),
                            application: typeof application === "string" ? application.slice(0, 180) : "",
                            name:
                                typeof name === "string" && !/password|secret|token/i.test(role)
                                    ? name.slice(0, 180)
                                    : "",
                            frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
                        },
                    };
                }
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
            if (changesLifecycle) this.invalidateStatus();
            return { desktop: (await this.list())[0] };
        } catch (error) {
            this.invalidateStatus();
            throw error;
        } finally {
            this.busy = false;
        }
    }
}
