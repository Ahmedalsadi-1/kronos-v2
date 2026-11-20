// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VmCheckpoint, VmHistory } from "../../frontend/types/linux-desktops";
import { runLinuxDesktopCommand } from "./command-runner";
import { qmpCommand } from "./qmp-client";

export class VmHistoryStore {
    constructor(
        private directory: string,
        private runner = runLinuxDesktopCommand,
        private monitor = qmpCommand
    ) {}

    private async saved(): Promise<VmHistory> {
        try {
            const saved = JSON.parse(await readFile(join(this.directory, "history.json"), "utf8"));
            if (!Array.isArray(saved.checkpoints)) throw new Error("Invalid VM history metadata.");
            return saved;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return { checkpoints: [] };
            throw error;
        }
    }
    private async persist(history: VmHistory) {
        const file = join(this.directory, "history.json");
        await writeFile(`${file}.tmp`, JSON.stringify(history), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
    }
    private async snapshots(running: boolean): Promise<any[]> {
        if (running) {
            const blocks = await this.monitor(join(this.directory, "qmp.sock"), "query-block");
            return (
                blocks.find((block: any) => block.inserted?.image?.filename === join(this.directory, "ubuntu.qcow2"))
                    ?.inserted?.image?.snapshots ?? []
            );
        }
        const { stdout } = await this.runner("qemu-img", [
            "info",
            "--output=json",
            join(this.directory, "ubuntu.qcow2"),
        ]);
        return JSON.parse(stdout).snapshots ?? [];
    }
    async list(running: boolean): Promise<VmHistory> {
        const saved = await this.saved();
        const snapshots = await this.snapshots(running);
        return {
            head: saved.head,
            checkpoints: snapshots
                .filter((item) => /^kronos-[a-f0-9-]{36}$/.test(item.name))
                .map((item) => {
                    const metadata = saved.checkpoints.find((entry) => entry.id === item.name);
                    return {
                        id: item.name,
                        label: metadata?.label ?? "Recovered checkpoint",
                        parentId: metadata?.parentId,
                        createdAt: metadata?.createdAt ?? new Date(item["date-sec"] * 1000).toISOString(),
                        includesMemory: item["vm-state-size"] > 0,
                    };
                }),
        };
    }
    private async snapshot(operation: "savevm" | "loadvm", id: string, running: boolean) {
        if (!/^kronos-[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid checkpoint id.");
        if (running) {
            const response = await this.monitor(join(this.directory, "qmp.sock"), "human-monitor-command", {
                "command-line": `${operation} ${id}`,
            });
            if (typeof response === "string" && response.trim()) throw new Error(response.trim());
        } else {
            await this.runner(
                "qemu-img",
                ["snapshot", operation === "savevm" ? "-c" : "-a", id, join(this.directory, "ubuntu.qcow2")],
                120000
            );
        }
    }
    async create(label: string, running: boolean, check: () => void): Promise<VmHistory> {
        if (typeof label !== "string" || !label.trim() || label.length > 160)
            throw new Error("Name the checkpoint (1–160 characters).");
        const history = await this.list(running);
        if (history.checkpoints.length >= 100) throw new Error("VM history has reached its 100 checkpoint limit.");
        const checkpoint: VmCheckpoint = {
            id: `kronos-${randomUUID()}`,
            label: label.trim(),
            parentId: history.head,
            createdAt: new Date().toISOString(),
            includesMemory: running,
        };
        check();
        await this.snapshot("savevm", checkpoint.id, running);
        history.checkpoints.push(checkpoint);
        history.head = checkpoint.id;
        await this.persist(history);
        check();
        return history;
    }
    async restore(id: string, running: boolean, check: () => void): Promise<VmHistory> {
        const history = await this.list(running);
        const target = history.checkpoints.find((item) => item.id === id);
        if (!target) throw new Error("Checkpoint no longer exists.");
        if (!running && target.includesMemory)
            throw new Error("Start the VM before restoring a checkpoint that includes memory.");
        if (running && !target.includesMemory) throw new Error("Stop the VM before restoring a disk-only checkpoint.");
        // Preserve the departing branch before applying any older state.
        const preserved = await this.create(`Before restore: ${target.label}`.slice(0, 160), running, check);
        check();
        await this.snapshot("loadvm", id, running);
        preserved.head = id;
        await this.persist(preserved);
        return preserved;
    }
}
