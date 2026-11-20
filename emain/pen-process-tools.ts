// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";

type Job = { child: ChildProcess; output: string; status: string };

export function makePenProcessTools(cwd: string) {
    const jobs = new Map<number, Job>();
    let nextId = 0;
    const stop = (job: Job) => {
        if (job.status !== "running" || !job.child.pid) return;
        try {
            if (process.platform === "win32") job.child.kill();
            else process.kill(-job.child.pid, "SIGTERM");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
    };
    const result = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
    return {
        tool: {
            name: "process_manage",
            label: "Manage background processes",
            description: "Start a background shell command in the project or list, inspect, and stop jobs started during this turn. Use bash for foreground commands.",
            parameters: {
                type: "object",
                properties: {
                    action: { enum: ["start", "list", "status", "stop"] },
                    command: { type: "string" },
                    id: { type: "integer" },
                },
                required: ["action"],
            },
            execute: async (_callId: string, args: { action: string; command?: string; id?: number }) => {
                if (args.action === "start") {
                    if (!args.command?.trim()) throw new Error("A command is required.");
                    if (jobs.size >= 8) throw new Error("This turn has reached its background process limit.");
                    const child = spawn(args.command, { cwd, shell: true, detached: process.platform !== "win32",
                        stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
                    const job: Job = { child, output: "", status: "running" };
                    const id = ++nextId;
                    jobs.set(id, job);
                    const collect = (chunk: Buffer) => { job.output = (job.output + chunk.toString()).slice(-12000); };
                    child.stdout.on("data", collect);
                    child.stderr.on("data", collect);
                    child.once("error", (error) => { job.status = error.message; });
                    child.once("close", (code, signal) => { job.status = signal ?? `exit ${code}`; });
                    return result({ id, status: job.status });
                }
                if (args.action === "list") return result([...jobs].map(([id, job]) => ({ id, status: job.status })));
                const job = jobs.get(args.id);
                if (!job) throw new Error("Background job not found in this turn.");
                if (args.action === "stop") stop(job);
                return result({ id: args.id, status: job.status, output: job.output });
            },
        },
        dispose: () => { for (const job of jobs.values()) stop(job); },
    };
}
