// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type ProjectEnvironmentRole = "terminal" | "browser" | "files";
export type ProjectEnvironmentSpec = { root: string; url: string; connection?: string };
export type ProjectEnvironmentPlan = {
    key: string;
    spec: ProjectEnvironmentSpec;
    widgets: { role: ProjectEnvironmentRole; blockDef: BlockDef }[];
};
export type ProjectEnvironmentAdapter = {
    create: (blockDef: BlockDef) => Promise<string>;
    remove: (blockId: string) => Promise<void>;
    findExisting: (key: string, role: ProjectEnvironmentRole) => string;
    ensureConnection: (connection: string) => Promise<void>;
};

export function planProjectEnvironment(input: ProjectEnvironmentSpec): ProjectEnvironmentPlan {
    const root = input.root.trim();
    const connection = input.connection?.trim() || "";
    if (!root || (!root.startsWith("/") && root !== "~" && !root.startsWith("~/") && !/^[A-Za-z]:[\\/]/.test(root))) {
        throw new Error("Enter an absolute project folder or a folder beginning with ~/.");
    }
    let url: URL;
    try {
        url = new URL(input.url.trim());
    } catch {
        throw new Error("Enter a complete browser URL, such as http://localhost:3000.");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("The browser URL must start with http:// or https://.");
    }
    const spec = { root, connection, url: url.href };
    const key = JSON.stringify(spec);
    const widgets = (
        [
            { role: "terminal", meta: { view: "term", controller: "shell", "cmd:cwd": root, connection } },
            { role: "browser", meta: { view: "web", url: url.href } },
            { role: "files", meta: { view: "preview", file: root, connection } },
        ] as const
    ).map(({ role, meta }) => ({
        role,
        blockDef: {
            meta: {
                ...meta,
                "environment:key": key,
                "environment:role": role,
                "environment:root": root,
                "environment:connection": connection,
                "frame:title": `Project ${role}`,
            } as unknown as MetaType,
        },
    }));
    return { key, spec, widgets };
}

export class ProjectEnvironmentLaunchError extends Error {
    remainingBlockIds: string[];
    constructor(cause: unknown, remainingBlockIds: string[]) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(
            `Environment launch failed: ${reason}${remainingBlockIds.length ? `. Cleanup failed for widgets: ${remainingBlockIds.join(", ")}. Close those widgets before retrying.` : ". Newly opened widgets were removed; you can retry."}`
        );
        this.remainingBlockIds = remainingBlockIds;
    }
}

export async function launchProjectEnvironment(
    plan: ProjectEnvironmentPlan,
    adapter: ProjectEnvironmentAdapter
): Promise<string[]> {
    const created: string[] = [];
    const blocks: string[] = [];
    try {
        if (plan.spec.connection) {
            await adapter.ensureConnection(plan.spec.connection);
        }
        for (const widget of plan.widgets) {
            const existing = adapter.findExisting(plan.key, widget.role);
            if (existing) {
                blocks.push(existing);
                continue;
            }
            const blockId = await adapter.create(widget.blockDef);
            if (!blockId) {
                throw new Error(`The ${widget.role} widget did not return an identity`);
            }
            created.push(blockId);
            blocks.push(blockId);
        }
        return blocks;
    } catch (cause) {
        const remaining: string[] = [];
        for (const blockId of created.reverse()) {
            try {
                await adapter.remove(blockId);
            } catch {
                remaining.push(blockId);
            }
        }
        throw new ProjectEnvironmentLaunchError(cause, remaining);
    }
}
