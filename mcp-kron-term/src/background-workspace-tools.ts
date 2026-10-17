// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { nativeBackgroundDisplays, type NativeBackgroundDisplay } from "./background-display-runtime.js";
import { linuxDesktopResult } from "./linux-desktop-tools.js";

export type BackgroundRunner = (request: Record<string, unknown>) => Promise<Record<string, any>>;
type OwnedApp = {
    pid: number;
    bundleId: string;
    launchTime: number;
    name?: string;
    enrolledWindowIds: number[];
    expectedWindowSpaces: Record<string, string[]>;
    expectedWindowDisplays: Record<string, number[]>;
};
type Snapshot = { id: string; app: OwnedApp; elements: Map<string, Record<string, string>>; fingerprint: string };
type Workspace = {
    scopeId: string;
    owner: string;
    id: string;
    taskId: string;
    apps: OwnedApp[];
    snapshot?: Snapshot;
    paused: boolean;
    busy: boolean;
    spaceIds?: string[];
    displayIds?: number[];
    desktop?: NativeBackgroundDisplay;
    released?: boolean;
};
const Limitation =
    "Native task apps use a dedicated virtual macOS display in your existing login, not a security sandbox. Apps launch without requested activation, but macOS apps may activate themselves. Only accessibility press/value actions are allowed; no global mouse or keyboard fallback. Existing running apps are refused. Released apps keep their display until they close.";

export class NativeBackgroundWorkspaces {
    private sessions = new Map<string, Workspace>();
    private boundCallers = new Set<string>();
    private retired = new Map<string, { sessionId: string; apps: OwnedApp[] }>();
    constructor(
        private runner: BackgroundRunner,
        private desktops?: typeof nativeBackgroundDisplays
    ) {}

    private async prepareWindows(app: OwnedApp, workspace: Workspace): Promise<void> {
        const desktop = workspace.desktop;
        if (!desktop) return;
        if (!this.desktops?.get(workspace.owner)) throw new Error("Assigned background display is unavailable.");
        let windows: Record<string, any>[] = [];
        let previous = "";
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            windows = await this.inventory(app);
            const misplaced = windows.filter(
                (window) =>
                    !app.enrolledWindowIds.includes(window.windowId) &&
                    JSON.stringify(window.displayIds) !== JSON.stringify([desktop.displayId])
            );
            if (misplaced.length) {
                await this.runner({
                    ...app,
                    action: "place_windows",
                    displayId: desktop.displayId,
                    windowIds: misplaced.map((window) => window.windowId),
                });
                windows = await this.inventory(app);
            }
            const signature = JSON.stringify(windows.map((window) => window.windowId).sort());
            if (attempt >= 4 && signature === previous) break;
            previous = signature;
        }
    }

    private async reclaimDisplays(): Promise<void> {
        for (const [owner, { sessionId, apps }] of this.retired) {
            const statuses = await Promise.all(apps.map((app) => this.runner({ ...app, action: "app_alive" })));
            if (statuses.some((status) => status.alive !== false)) continue;
            await this.desktops?.dispose(owner);
            this.retired.delete(owner);
            this.sessions.delete(sessionId);
        }
    }

    assertToolAllowed(name: string, owner: string, args: Record<string, any> = {}): void {
        if (
            this.boundCallers.has(owner) &&
            ((name.startsWith("kron_computer_") && !name.startsWith("kron_computer_background_workspace_")) ||
                name === "workspace_open_native_app" ||
                (name === "workspace_os_action" &&
                    args.action === "os.app.launch" &&
                    (args.appId || args.appName || args.args?.appId || args.args?.appName)))
        )
            throw new Error(
                "Agent is assigned to a background window group. Global desktop tools are disabled for this caller."
            );
    }

    private async inventory(app: OwnedApp): Promise<Record<string, any>[]> {
        const result = await this.runner({ ...app, action: "inventory_windows" });
        if (
            !Array.isArray(result.windows) ||
            result.windows.length > 128 ||
            result.windows.some(
                (window: any) =>
                    !window ||
                    !Number.isSafeInteger(window.windowId) ||
                    window.windowId <= 0 ||
                    window.windowId > 0xffffffff
            ) ||
            new Set(result.windows.map((window: any) => window.windowId)).size !== result.windows.length
        ) {
            throw new Error(
                "Native window inventory is unavailable or invalid. Membership cannot be treated as empty."
            );
        }
        return result.windows;
    }

    private async enroll(app: OwnedApp, workspace: Workspace): Promise<void> {
        for (const window of await this.inventory(app)) this.enrollWindow(app, window, workspace);
    }

    private enrollWindow(app: OwnedApp, window: Record<string, any>, workspace: Workspace): void {
        if (
            !Array.isArray(window.spaceIds) ||
            !window.spaceIds.length ||
            !window.spaceIds.every((id: any) => typeof id === "string" && /^\d+$/.test(id)) ||
            !Array.isArray(window.displayIds) ||
            !window.displayIds.length ||
            !window.displayIds.every((id: any) => Number.isSafeInteger(id) && id > 0)
        )
            throw new Error("Native window Space or display identity is unavailable; enrollment refused.");
        if (
            workspace.spaceIds &&
            (JSON.stringify([...workspace.spaceIds].sort()) !== JSON.stringify([...window.spaceIds].sort()) ||
                JSON.stringify([...(workspace.displayIds ?? [])].sort()) !==
                    JSON.stringify([...window.displayIds].sort()))
        )
            throw new Error("Window moved outside the assigned Space or display; move it back before approval.");
        workspace.spaceIds ??= [...window.spaceIds];
        workspace.displayIds ??= [...window.displayIds];
        if (app.enrolledWindowIds.includes(window.windowId)) {
            if (
                JSON.stringify([...app.expectedWindowSpaces[window.windowId]].sort()) !==
                    JSON.stringify([...window.spaceIds].sort()) ||
                JSON.stringify([...app.expectedWindowDisplays[window.windowId]].sort()) !==
                    JSON.stringify([...window.displayIds].sort())
            )
                throw new Error("Enrolled window moved to another Space or display; task is paused.");
            return;
        }
        app.enrolledWindowIds.push(window.windowId);
        app.expectedWindowSpaces[window.windowId] = [...window.spaceIds];
        app.expectedWindowDisplays[window.windowId] = [...window.displayIds];
    }

    async manage(
        operation: string,
        args: { scopeId: string; sessionId?: string; [key: string]: any }
    ): Promise<Record<string, any>> {
        if (operation === "list") {
            const owners = [
                ...new Set(
                    [...this.sessions.values()]
                        .filter((workspace) => workspace.scopeId === args.scopeId)
                        .map((workspace) => workspace.owner)
                ),
            ];
            const results = await Promise.all(
                owners.map((owner) => this.perform("list", {}, owner, args.scopeId, true))
            );
            return { workspaces: results.flatMap((result) => result.workspaces), limitation: Limitation };
        }
        const workspace = this.sessions.get(args.sessionId ?? "");
        if (!workspace || workspace.scopeId !== args.scopeId)
            throw new Error("Unknown or finished background workspace.");
        return this.perform(operation, args, workspace.owner, args.scopeId, true);
    }

    private session(id: string, owner: string, trustedManagement = false): Workspace {
        const value = this.sessions.get(id);
        if (!value || value.owner !== owner || (value.released && !trustedManagement))
            throw new Error("Unknown or finished background workspace. Existing apps cannot be adopted.");
        return value;
    }

    async perform(
        operation: string,
        args: Record<string, any>,
        owner = "local-process",
        scopeId = owner,
        trustedManagement = false
    ): Promise<Record<string, any>> {
        if (operation === "list")
            return {
                workspaces: await Promise.all(
                    [...this.sessions.values()]
                        .filter(
                            (workspace) =>
                                workspace.owner === owner &&
                                workspace.scopeId === scopeId &&
                                (trustedManagement || !workspace.released)
                        )
                        .map(async ({ id, taskId, apps, paused, busy, spaceIds, displayIds, desktop, released }) => ({
                            sessionId: id,
                            taskId,
                            spaceIds,
                            displayIds,
                            desktop,
                            released,
                            apps: await Promise.all(
                                apps.map(async (app) => {
                                    try {
                                        const availableWindows = await this.inventory(app);
                                        const closed = app.enrolledWindowIds.some(
                                            (id) => !availableWindows.some((window) => window.windowId === id)
                                        );
                                        const moved = availableWindows.some(
                                            (window) =>
                                                app.enrolledWindowIds.includes(window.windowId) &&
                                                (JSON.stringify([...window.spaceIds].sort()) !==
                                                    JSON.stringify(
                                                        [...app.expectedWindowSpaces[window.windowId]].sort()
                                                    ) ||
                                                    JSON.stringify([...window.displayIds].sort()) !==
                                                        JSON.stringify(
                                                            [...app.expectedWindowDisplays[window.windowId]].sort()
                                                        ))
                                        );
                                        const unexpected = availableWindows.some(
                                            (window) => !app.enrolledWindowIds.includes(window.windowId)
                                        );
                                        return {
                                            ...app,
                                            availableWindows,
                                            inventoryVerified: true,
                                            blockedReason: moved
                                                ? "A window moved outside its assigned desktop or display. Move it back before resuming."
                                                : closed
                                                  ? "An enrolled window closed. Remove its membership through human review."
                                                  : unexpected
                                                    ? "A new window requires human approval before actions can continue."
                                                    : undefined,
                                        };
                                    } catch {
                                        return {
                                            ...app,
                                            availableWindows: [],
                                            inventoryVerified: false,
                                            blockedReason: "Window membership could not be verified.",
                                        };
                                    }
                                })
                            ),
                            paused,
                            busy,
                        }))
                ),
                limitation: Limitation,
            };
        if (operation === "start") {
            if (this.desktops) await this.reclaimDisplays();
            if ([...this.sessions.values()].some((workspace) => workspace.owner === owner))
                throw new Error("Caller already has an assigned background window group.");
            if (this.sessions.size >= 32) throw new Error("Finish an existing background workspace first.");
            const workspace: Workspace = {
                scopeId,
                owner,
                id: randomUUID(),
                taskId: args.taskId,
                apps: [],
                paused: false,
                busy: false,
            };
            this.boundCallers.add(owner);
            if (this.desktops) {
                workspace.desktop = await this.desktops.create(owner);
                workspace.spaceIds = [...workspace.desktop.spaceIds];
                workspace.displayIds = [workspace.desktop.displayId];
            }
            this.sessions.set(workspace.id, workspace);
            return {
                sessionId: workspace.id,
                taskId: workspace.taskId,
                desktop: workspace.desktop,
                apps: [],
                limitation: Limitation,
            };
        }
        const workspace = this.session(args.sessionId, owner, trustedManagement);
        if (workspace.scopeId !== scopeId) throw new Error("Unknown or finished background workspace.");
        if (workspace.busy) throw new Error("Background workspace operation is already in progress.");
        workspace.busy = true;
        try {
            if (workspace.desktop && !["finish", "pause"].includes(operation) && !this.desktops?.get(owner)) {
                throw new Error("Assigned background display is unavailable.");
            }
            if (operation === "finish") {
                if (workspace.desktop) {
                    if (workspace.apps.length) {
                        workspace.released = true;
                        workspace.paused = true;
                        workspace.snapshot = undefined;
                        this.retired.set(owner, { sessionId: workspace.id, apps: workspace.apps });
                    } else {
                        this.sessions.delete(workspace.id);
                        await this.desktops?.dispose(owner);
                    }
                } else this.sessions.delete(workspace.id);
                return { sessionId: workspace.id, finished: true, appsPreserved: workspace.apps, stoppedApps: false };
            }
            if (operation === "launch") {
                if (workspace.apps.length >= 16) throw new Error("Background workspace app limit reached.");
                if (workspace.paused)
                    throw new Error("Workspace was revealed to the user. Resume explicitly before further actions.");
                const result = await this.runner({ action: "launch", bundleId: args.bundleId });
                const app: OwnedApp = {
                    pid: result.pid,
                    bundleId: result.bundleId,
                    launchTime: result.launchTime,
                    name: result.name,
                    enrolledWindowIds: [],
                    expectedWindowSpaces: {},
                    expectedWindowDisplays: {},
                };
                if (
                    !Number.isInteger(app.pid) ||
                    app.pid <= 0 ||
                    !Number.isFinite(app.launchTime) ||
                    app.bundleId !== args.bundleId
                )
                    throw new Error("Native launcher returned an invalid app identity.");
                workspace.apps.push(app);
                await this.prepareWindows(app, workspace);
                await this.enroll(app, workspace);
                workspace.snapshot = undefined;
                if (result.isActive) workspace.paused = true;
                return { sessionId: workspace.id, app, paused: workspace.paused, limitation: Limitation };
            }
            if (operation === "pause") {
                workspace.paused = true;
                workspace.snapshot = undefined;
                return { sessionId: workspace.id, paused: true };
            }
            const app = workspace.apps.find((item) => item.bundleId === args.bundleId);
            if (!app)
                throw new Error("App is outside this task-owned workspace. Launch it through this workspace first.");
            if (operation === "remove_window") {
                if ((await this.inventory(app)).some((window) => window.windowId === args.windowId))
                    throw new Error("Only a closed window can be removed from this group.");
                app.enrolledWindowIds = app.enrolledWindowIds.filter((id) => id !== args.windowId);
                delete app.expectedWindowSpaces[args.windowId];
                delete app.expectedWindowDisplays[args.windowId];
                workspace.snapshot = undefined;
                return { sessionId: workspace.id, app };
            }
            if (operation === "approve_window") {
                const candidate = (await this.inventory(app)).find((window) => window.windowId === args.windowId);
                if (!candidate) throw new Error("Window does not belong to this task app process.");
                this.enrollWindow(app, candidate, workspace);
                workspace.snapshot = undefined;
                return { sessionId: workspace.id, app };
            }
            if (operation === "open_file") {
                if (workspace.paused)
                    throw new Error("Resume the background workspace after human review before opening a file.");
                if ((await this.inventory(app)).some((window) => !app.enrolledWindowIds.includes(window.windowId)))
                    throw new Error(
                        "Unapproved windows exist in this app. Ask the user to approve them before opening files."
                    );
                workspace.snapshot = undefined;
                const result = await this.runner({
                    ...app,
                    allowedWindowIds: app.enrolledWindowIds,
                    action: "open_file",
                    filePath: args.filePath,
                });
                await this.prepareWindows(app, workspace);
                if ((await this.inventory(app)).some((window) => !app.enrolledWindowIds.includes(window.windowId)))
                    workspace.paused = true;
                if (result.isActive) workspace.paused = true;
                return { ...result, paused: workspace.paused, observeRequired: true };
            }
            if (operation === "reveal") {
                workspace.paused = true;
                workspace.snapshot = undefined;
                return {
                    ...(await this.runner({
                        ...app,
                        allowedWindowIds: app.enrolledWindowIds,
                        action: workspace.desktop ? "review_on_main" : "reveal",
                    })),
                    paused: true,
                };
            }
            if (operation === "return_windows") {
                if (!workspace.desktop) throw new Error("This group has no dedicated background display.");
                workspace.paused = true;
                workspace.snapshot = undefined;
                await this.runner({
                    ...app,
                    action: "place_windows",
                    displayId: workspace.desktop.displayId,
                    windowIds: app.enrolledWindowIds,
                });
                for (const window of await this.inventory(app)) {
                    if (app.enrolledWindowIds.includes(window.windowId)) this.enrollWindow(app, window, workspace);
                }
                return { sessionId: workspace.id, app, paused: true };
            }
            if (operation === "preview") {
                const result = await this.runner({
                    ...app,
                    allowedWindowIds: app.enrolledWindowIds,
                    action: "observe",
                });
                if (result.isActive) workspace.paused = true;
                return {
                    imageDataUrl: result.imageDataUrl,
                    captureUnavailable: result.captureUnavailable,
                    paused: workspace.paused,
                };
            }
            if (operation === "observe" || operation === "resume") {
                if (workspace.desktop && !this.desktops?.get(owner))
                    throw new Error("Assigned background display is unavailable.");
                const result = await this.runner({
                    ...app,
                    allowedWindowIds: app.enrolledWindowIds,
                    action: "observe",
                });
                if (operation === "resume") {
                    if (result.isActive)
                        throw new Error(
                            "The app is still foreground. Switch back to your own app before resuming background work."
                        );
                    workspace.paused = false;
                }
                if (result.isActive) workspace.paused = true;
                const id = randomUUID();
                const identities = new Map<string, Record<string, string>>();
                for (const element of result.elements ?? []) {
                    if (
                        !app.enrolledWindowIds.includes(element.windowId) ||
                        Number(String(element.elementId).split(".")[0]) !== element.windowId
                    )
                        continue;
                    identities.set(element.elementId, {
                        windowId: String(element.windowId),
                        AXRole: element.AXRole ?? "",
                        AXTitle: element.AXTitle ?? "",
                        AXIdentifier: element.AXIdentifier ?? "",
                        AXSubrole: element.AXSubrole ?? "",
                        AXDescription: element.AXDescription ?? "",
                    });
                }
                workspace.snapshot = { id, app, elements: identities, fingerprint: result.treeFingerprint };
                return {
                    ...result,
                    elements: (result.elements ?? []).filter((element: any) =>
                        app.enrolledWindowIds.includes(element.windowId)
                    ),
                    sessionId: workspace.id,
                    snapshotId: id,
                    paused: workspace.paused,
                };
            }
            if (operation !== "action") throw new Error("Unsupported background workspace operation.");
            if (workspace.paused)
                throw new Error(
                    "Workspace is paused for human review. Resume explicitly after returning the app to the background."
                );
            const snapshot = workspace.snapshot;
            if (!snapshot || snapshot.id !== args.snapshotId || snapshot.app !== app)
                throw new Error("Observe this workspace app again before acting; snapshot is stale.");
            const identity = snapshot.elements.get(args.elementId);
            if (!identity) throw new Error("Element is outside the observed task-owned window tree.");
            if (!identity.AXIdentifier && !identity.AXTitle && !identity.AXDescription)
                throw new Error("Element has no stable identifying label. Observe a named control instead.");
            if (
                [...snapshot.elements.values()].filter((item) => JSON.stringify(item) === JSON.stringify(identity))
                    .length !== 1
            )
                throw new Error("Element identity is ambiguous in this window tree. Background action refused.");
            if (typeof snapshot.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.fingerprint))
                throw new Error("Complete window fingerprint is unavailable. Observe again before acting.");
            workspace.snapshot = undefined;
            const result = await this.runner({
                ...app,
                allowedWindowIds: app.enrolledWindowIds,
                windowId: Number(identity.windowId),
                action: args.action,
                elementId: args.elementId,
                identity: Object.fromEntries(Object.entries(identity).filter(([key]) => key !== "windowId")),
                treeFingerprint: snapshot.fingerprint,
                value: args.value,
            });
            if (result.isActive) workspace.paused = true;
            return { ...result, paused: workspace.paused, observeRequired: true };
        } catch (error) {
            if (/\bSpace\b|\bdisplay\b|membership|moved|foreground|Unapproved/i.test(String(error))) {
                workspace.paused = true;
                workspace.snapshot = undefined;
            }
            throw error;
        } finally {
            workspace.busy = false;
        }
    }
}

async function runNative(request: Record<string, unknown>): Promise<Record<string, any>> {
    if (process.platform !== "darwin") throw new Error("Native background app workspaces require macOS.");
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    const binary = [
        process.env.KRONTERM_BACKGROUND_COMPUTER_BIN,
        resources && path.join(resources, "native", "background-computer"),
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/native/background-computer"),
        path.resolve("dist/native/background-computer"),
    ].find((candidate) => candidate && existsSync(candidate));
    if (!binary)
        throw new Error(
            "Build the native helper with node scripts/build-desktop-picker.mjs arm64 background-computer (use x64 on Intel), then retry."
        );
    return new Promise((resolve, reject) => {
        const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
        const chunks: Buffer[] = [];
        let bytes = 0;
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("Native background operation timed out; observe before retrying a launch."));
        }, 45_000);
        child.stdout.on("data", (data: Buffer) => {
            bytes += data.length;
            if (bytes > 24 * 1024 * 1024) {
                child.kill();
                reject(new Error("Native background response exceeds limit."));
            } else chunks.push(data);
        });
        child.stderr.on("data", (data: Buffer) => {
            stderr = (stderr + data.toString()).slice(-4096);
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            try {
                const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                if (result.error) throw new Error(result.error);
                if (code !== 0) throw new Error(stderr || `Native background helper exited ${code}`);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(request));
    });
}

const workspaces = new NativeBackgroundWorkspaces(runNative, nativeBackgroundDisplays);
let resolveScope: () => Promise<string> = async () => "local-process";
let resolveCaller: () => Promise<string> = async () => "local-process";

export async function assertBackgroundWorkspaceToolAllowed(
    name: string,
    args: Record<string, any> = {}
): Promise<void> {
    workspaces.assertToolAllowed(name, await resolveCaller(), args);
}

export async function manageNativeBackgroundWorkspaces(
    operation:
        "list" | "pause" | "reveal" | "preview" | "return_windows" | "approve_window" | "remove_window" | "finish",
    args: { scopeId: string; sessionId?: string; bundleId?: string; windowId?: number }
): Promise<Record<string, any>> {
    if (!args.scopeId) throw new Error("Trusted workspace scope is required.");
    return workspaces.manage(operation, args);
}
const Session = { sessionId: z.string().uuid() };
const App = { ...Session, bundleId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,254}$/) };

async function call(operation: string, args: Record<string, any>): Promise<CallToolResult> {
    try {
        const endpoint = process.env.KRONTERM_NATIVE_TOOL_URL;
        const token = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        if (!process.versions.electron && endpoint && token) {
            const url = new URL(endpoint);
            if (
                url.protocol !== "http:" ||
                !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
                url.pathname !== "/native" ||
                url.username ||
                url.password ||
                url.search ||
                url.hash
            )
                throw new Error("Background workspace transport must use a local native endpoint.");
            const response = await fetch(url, {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(125_000),
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify({
                    method: "call",
                    name: `kron_computer_background_workspace_${operation}`,
                    arguments: args,
                }),
            });
            if (!response.ok) throw new Error(`Background workspace transport returned ${response.status}`);
            if (!response.body) throw new Error("Background workspace response was empty.");
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done) break;
                    bytes += part.value.byteLength;
                    if (bytes > 28 * 1024 * 1024) throw new Error("Background workspace response exceeds limit.");
                    chunks.push(part.value);
                }
            } finally {
                await reader.cancel();
            }
            const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!Array.isArray(result.content))
                throw new Error(result.error || "Invalid background workspace response.");
            return result as CallToolResult;
        }
        return linuxDesktopResult(
            await workspaces.perform(operation, args, await resolveCaller(), await resolveScope())
        );
    } catch (error) {
        return {
            isError: true,
            content: [
                { type: "text", text: error instanceof Error ? error.message : "Native background operation failed." },
            ],
        };
    }
}

export function registerBackgroundWorkspaceTools(
    server: McpServer,
    caller?: () => Promise<string>,
    scope?: () => Promise<string>
): void {
    if (caller) resolveCaller = caller;
    if (scope) resolveScope = scope;
    const register = (operation: string, description: string, schema: z.ZodRawShape, readOnly = false) =>
        server.tool(
            `kron_computer_background_workspace_${operation}`,
            description,
            schema,
            {
                readOnlyHint: readOnly,
                destructiveHint: false,
                idempotentHint: readOnly,
                openWorldHint: operation === "action",
            },
            (args) => call(operation, args)
        );
    register(
        "list",
        "List current native background workspace groups with task labels, session IDs, task-owned app identities and paused/busy state. Does not capture windows, expose element values, launch an app, or change focus. Server restart clears these ownership sessions.",
        {},
        true
    );
    register(
        "open_file",
        "Open an exact user-requested existing local file in this workspace's newly launched app without requesting activation. Refuses unowned or foreground app processes. Observe afterward; if the app activates itself the workspace pauses. Does not create or modify file contents.",
        {
            ...App,
            filePath: z
                .string()
                .min(1)
                .max(4096)
                .refine((value) => value.startsWith("/") && !value.includes("\0"), "Use an absolute local file path"),
        }
    );
    register(
        "start",
        `Create a task-owned native macOS background app workspace. ${Limitation} Does not launch an app until launch is called. Save sessionId; finish releases the group and preserves apps.`,
        { taskId: z.string().min(1).max(128) }
    );
    register(
        "launch",
        "Launch an installed macOS app by exact bundle ID with activation disabled into this task-owned workspace. Refuses an already running app, never adopts user windows. If the app activates itself, the workspace pauses for human review. Requires the compiled native helper.",
        App
    );
    register(
        "observe",
        "Observe only this workspace's task-owned app windows through accessibility and optional window-scoped ScreenCaptureKit screenshot. Does not activate the app or use the desktop screenshot. Save snapshotId and exact elementId for one action. An app brought foreground pauses automation.",
        App,
        true
    );
    register(
        "action",
        "Perform AXPress or AXValue assignment on an exact observed task-owned app element. Requires current snapshotId; rejects stale elements, foreground apps and paused workspaces. Never uses global input or keyboard/pointer fallback. Observe again afterward.",
        {
            ...App,
            snapshotId: z.string().uuid(),
            elementId: z.string().regex(/^\d+(?:\.\d+){0,15}$/),
            action: z.enum(["press", "set_value"]),
            value: z.string().max(16384).optional(),
        }
    );
    register(
        "reveal",
        "Reveal a task-owned app for human review only when the user requested to inspect or take over. Activates its windows and pauses workspace actions. Never invoke merely to observe background progress.",
        App
    );
    register(
        "resume",
        "Resume after human review only when the user explicitly returns control. Refuses while this app remains foreground; returns a fresh observation. Does not activate or hide the app.",
        App
    );
    register(
        "finish",
        "Release a native background workspace session. Preserves every app and window; does not quit apps or close user data. Subsequent actions using the session are refused.",
        Session
    );
}
