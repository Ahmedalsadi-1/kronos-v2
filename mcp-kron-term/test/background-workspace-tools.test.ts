import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NativeBackgroundWorkspaces, registerBackgroundWorkspaceTools } from "../src/background-workspace-tools.js";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";

const bundleId = "com.example.TaskApp";
function setup() {
    const calls: Record<string, any>[] = [];
    let active = false;
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        calls.push(request);
        if (request.action === "launch") return { pid: 123, bundleId, launchTime: 123.45, isActive: active };
        if (request.action === "inventory_windows")
            return { windows: [{ windowId: 44, spaceIds: ["1"], displayIds: [1] }] };
        if (request.action === "observe")
            return {
                isActive: active,
                treeFingerprint: "a".repeat(64),
                elements: [
                    { elementId: "44.1", windowId: 44, AXRole: "AXButton", AXTitle: "Save", AXIdentifier: "save" },
                ],
            };
        return { performed: request.action, isActive: active };
    });
    return {
        runtime,
        calls,
        setActive: (value: boolean) => {
            active = value;
        },
    };
}

test("native workspaces enforce app ownership and consume snapshots after one action", async () => {
    const { runtime, calls } = setup();
    const { sessionId } = await runtime.perform("start", { taskId: "draft" });
    await assert.rejects(runtime.perform("observe", { sessionId, bundleId }), /outside/);
    await assert.rejects(runtime.perform("open_file", { sessionId, bundleId, filePath: "/tmp/task.txt" }), /outside/);
    await runtime.perform("launch", { sessionId, bundleId });
    await runtime.perform("open_file", { sessionId, bundleId, filePath: "/tmp/task.txt" });
    assert.equal(
        calls.some((call) => call.action === "open_file"),
        true
    );
    assert.equal(calls.at(-1)?.pid, 123);
    const { snapshotId } = await runtime.perform("observe", { sessionId, bundleId });
    const listed = await runtime.perform("list", {});
    assert.equal(listed.workspaces[0].sessionId, sessionId);
    assert.equal(listed.workspaces[0].taskId, "draft");
    assert.equal(listed.workspaces[0].apps[0].pid, 123);
    assert.equal(JSON.stringify(listed).includes("AXButton"), false);
    assert.equal(JSON.stringify(listed).includes(snapshotId), false);
    await assert.rejects(
        runtime.perform("action", { sessionId, bundleId, snapshotId, elementId: "0.9", action: "press" }),
        /outside/
    );
    await runtime.perform("action", { sessionId, bundleId, snapshotId, elementId: "44.1", action: "press" });
    assert.deepEqual(calls.at(-1), {
        pid: 123,
        bundleId,
        launchTime: 123.45,
        name: undefined,
        enrolledWindowIds: [44],
        expectedWindowSpaces: { "44": ["1"] },
        expectedWindowDisplays: { "44": [1] },
        allowedWindowIds: [44],
        windowId: 44,
        action: "press",
        elementId: "44.1",
        identity: { AXRole: "AXButton", AXTitle: "Save", AXIdentifier: "save", AXSubrole: "", AXDescription: "" },
        treeFingerprint: "a".repeat(64),
        value: undefined,
    });
    await assert.rejects(
        runtime.perform("action", { sessionId, bundleId, snapshotId, elementId: "44.1", action: "press" }),
        /stale/
    );
    const finished = await runtime.perform("finish", { sessionId });
    assert.equal(finished.stoppedApps, false);
    assert.equal(finished.appsPreserved[0].pid, 123);
    await assert.rejects(runtime.perform("observe", { sessionId, bundleId }), /Unknown or finished/);
    assert.equal(
        calls.some((call) => call.action === "quit"),
        false
    );
});

test("revealing or foreground activation pauses actions until explicit background resume", async () => {
    const { runtime, setActive } = setup();
    const { sessionId } = await runtime.perform("start", { taskId: "review" });
    await runtime.perform("launch", { sessionId, bundleId });
    await runtime.perform("reveal", { sessionId, bundleId });
    const observed = await runtime.perform("observe", { sessionId, bundleId });
    await assert.rejects(
        runtime.perform("action", {
            sessionId,
            bundleId,
            snapshotId: observed.snapshotId,
            elementId: "44.1",
            action: "press",
        }),
        /paused/
    );
    setActive(true);
    await assert.rejects(runtime.perform("resume", { sessionId, bundleId }), /still foreground/);
    setActive(false);
    const resumed = await runtime.perform("resume", { sessionId, bundleId });
    assert.equal(resumed.paused, false);
    await runtime.perform("action", {
        sessionId,
        bundleId,
        snapshotId: resumed.snapshotId,
        elementId: "44.1",
        action: "set_value",
        value: "text",
    });
});

test("native background tools reject global input schemas and require computer capability", () => {
    const server = new McpServer({ name: "test", version: "1" });
    registerBackgroundWorkspaceTools(server);
    const tools = (server as any)._registeredTools;
    assert.equal(tools.kron_computer_background_workspace_list.annotations.readOnlyHint, true);
    assert.equal(tools.kron_computer_background_workspace_list.inputSchema.safeParse({}).success, true);
    const action = tools.kron_computer_background_workspace_action;
    const base = {
        sessionId: "bfa86846-829d-4ebf-a242-49d72a3f94c9",
        bundleId,
        snapshotId: "bfa86846-829d-4ebf-a242-49d72a3f94c9",
        elementId: "44.1",
    };
    for (const operation of ["click", "drag", "press_key", "type_text"])
        assert.equal(action.inputSchema.safeParse({ ...base, action: operation }).success, false);
    assert.equal(action.inputSchema.safeParse({ ...base, action: "press" }).success, true);
    assert.equal(
        isToolAllowedBySurfaceCapability("kron_computer_background_workspace_action", {
            hostMode: "web-fullscreen",
            capabilities: { sandbox: true },
        } as any),
        false
    );
    assert.equal(
        isToolAllowedBySurfaceCapability("kron_computer_background_workspace_action", {
            hostMode: "web-fullscreen",
            capabilities: { computerControl: true },
        } as any),
        true
    );
});

test("native helper contains no shared pointer or keyboard delivery and refuses existing apps", async () => {
    const source = await readFile(new URL("../../native/background-computer.swift", import.meta.url), "utf8");
    assert.doesNotMatch(source, /CGEvent|AXRaise|setFrontmost|terminate\(/);
    assert.match(source, /configuration.activates = false/);
    assert.match(source, /already running/);
    assert.match(source, /requireBackground/);
    assert.match(source, /desktopIndependentWindow/);
    assert.match(source, /launchDate/);
});

test("background controls reject ambiguous labels and carry full tree freshness binding", async () => {
    let fingerprint = "b".repeat(64);
    let ambiguous = true;
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        if (request.action === "launch") return { pid: 123, bundleId, launchTime: 123.45 };
        if (request.action === "inventory_windows")
            return { windows: [{ windowId: 44, spaceIds: ["1"], displayIds: [1] }] };
        if (request.action === "observe")
            return {
                treeFingerprint: fingerprint,
                elements: [
                    { elementId: "44.0", windowId: 44, AXRole: "AXButton", AXTitle: "Save" },
                    ...(ambiguous ? [{ elementId: "44.1", windowId: 44, AXRole: "AXButton", AXTitle: "Save" }] : []),
                ],
            };
        if (request.treeFingerprint !== fingerprint) throw new Error("Window hierarchy, labels or bounds changed");
        return { performed: true };
    });
    const { sessionId } = await runtime.perform("start", { taskId: "tree" });
    await runtime.perform("launch", { sessionId, bundleId });
    const first = await runtime.perform("observe", { sessionId, bundleId });
    await assert.rejects(
        runtime.perform("action", {
            sessionId,
            bundleId,
            snapshotId: first.snapshotId,
            elementId: "44.0",
            action: "press",
        }),
        /ambiguous/
    );
    ambiguous = false;
    const second = await runtime.perform("observe", { sessionId, bundleId });
    fingerprint = "c".repeat(64);
    await assert.rejects(
        runtime.perform("action", {
            sessionId,
            bundleId,
            snapshotId: second.snapshotId,
            elementId: "44.0",
            action: "press",
        }),
        /hierarchy/
    );
    await assert.rejects(
        runtime.perform("action", {
            sessionId,
            bundleId,
            snapshotId: second.snapshotId,
            elementId: "44.0",
            action: "press",
        }),
        /stale/
    );
});

test("trusted caller binding hides other groups and remains fail closed after finish", async () => {
    const { runtime, calls } = setup();
    const first = await runtime.perform("start", { taskId: "same-label" }, "tab-a");
    const second = await runtime.perform("start", { taskId: "same-label" }, "tab-b");
    assert.deepEqual(
        (await runtime.perform("list", {}, "tab-a")).workspaces.map((item: any) => item.sessionId),
        [first.sessionId]
    );
    await assert.rejects(
        runtime.perform("launch", { sessionId: first.sessionId, bundleId }, "tab-b"),
        /Unknown or finished/
    );
    assert.equal(calls.length, 0);
    assert.throws(() => runtime.assertToolAllowed("kron_computer_click", "tab-a"), /Global desktop/);
    assert.throws(() => runtime.assertToolAllowed("kron_computer_window", "tab-b"), /Global desktop/);
    assert.doesNotThrow(() => runtime.assertToolAllowed("kron_computer_click", "tab-c"));
    assert.doesNotThrow(() => runtime.assertToolAllowed("kron_computer_background_workspace_observe", "tab-a"));
    await runtime.perform("finish", { sessionId: first.sessionId }, "tab-a");
    assert.throws(() => runtime.assertToolAllowed("kron_computer_observe", "tab-a"), /Global desktop/);
    assert.equal((await runtime.perform("list", {}, "tab-b")).workspaces[0].sessionId, second.sessionId);
});

test("unapproved windows cannot become actionable or be adopted through open_file", async () => {
    let windows = [44];
    const calls: Record<string, any>[] = [];
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        calls.push(request);
        if (request.action === "launch") return { pid: 123, bundleId, launchTime: 1 };
        if (request.action === "inventory_windows")
            return { windows: windows.map((windowId) => ({ windowId, spaceIds: ["1"], displayIds: [1] })) };
        if (request.action === "observe")
            return {
                treeFingerprint: "a".repeat(64),
                elements: windows.map((windowId) => ({
                    windowId,
                    elementId: `${windowId}.1`,
                    AXTitle: String(windowId),
                })),
            };
        return {};
    });
    const { sessionId } = await runtime.perform("start", { taskId: "windows" });
    await runtime.perform("launch", { sessionId, bundleId });
    windows = [44, 55];
    const observed = await runtime.perform("observe", { sessionId, bundleId });
    assert.deepEqual(calls.at(-1)?.allowedWindowIds, [44]);
    await assert.rejects(
        runtime.perform("action", {
            sessionId,
            bundleId,
            snapshotId: observed.snapshotId,
            elementId: "55.1",
            action: "press",
        }),
        /outside/
    );
    await assert.rejects(
        runtime.perform("open_file", { sessionId, bundleId, filePath: "/tmp/task.txt" }),
        /Unapproved/
    );
    assert.equal(
        calls.some((call) => call.action === "open_file"),
        false
    );
    await assert.rejects(runtime.perform("approve_window", { sessionId, bundleId, windowId: 66 }), /does not belong/);
    await runtime.perform("approve_window", { sessionId, bundleId, windowId: 55 });
    const fresh = await runtime.perform("resume", { sessionId, bundleId });
    await runtime.perform("action", {
        sessionId,
        bundleId,
        snapshotId: fresh.snapshotId,
        elementId: "55.1",
        action: "press",
    });
    assert.equal(calls.at(-1)?.windowId, 55);
    assert.deepEqual(calls.at(-1)?.allowedWindowIds, [44, 55]);
});

test("moving an enrolled window cannot silently rebind its desktop and pauses the group", async () => {
    let spaceIds = ["1"];
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        if (request.action === "launch") return { pid: 123, bundleId, launchTime: 1 };
        if (request.action === "inventory_windows") return { windows: [{ windowId: 44, spaceIds, displayIds: [1] }] };
        return {};
    });
    const { sessionId } = await runtime.perform("start", { taskId: "space" });
    await runtime.perform("launch", { sessionId, bundleId });
    spaceIds = ["2"];
    await assert.rejects(runtime.perform("approve_window", { sessionId, bundleId, windowId: 44 }), /moved/);
    const summary = await runtime.perform("list", {});
    assert.equal(summary.workspaces[0].paused, true);
    assert.deepEqual(summary.workspaces[0].apps[0].expectedWindowSpaces[44], ["1"]);
});

test("assigned callers cannot launch native apps through alternate tools even after finish", async () => {
    const { runtime } = setup();
    const { sessionId } = await runtime.perform("start", { taskId: "confined" }, "caller-a", "tab-a");
    for (const name of ["workspace_open_native_app", "kron_computer_window", "kron_computer_click"])
        assert.throws(() => runtime.assertToolAllowed(name, "caller-a"), /Global desktop/);
    assert.throws(
        () => runtime.assertToolAllowed("workspace_os_action", "caller-a", { action: "os.app.launch", appId: "x" }),
        /Global desktop/
    );
    assert.doesNotThrow(() =>
        runtime.assertToolAllowed("workspace_os_action", "caller-a", { action: "os.app.launch", view: "term" })
    );
    await assert.rejects(runtime.manage("finish", { scopeId: "tab-b", sessionId }), /Unknown/);
    await runtime.manage("finish", { scopeId: "tab-a", sessionId });
    assert.throws(() => runtime.assertToolAllowed("workspace_open_native_app", "caller-a"), /Global desktop/);
});

test("the first window binds future app launches to the same desktop and display", async () => {
    let spaceIds = ["1"];
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        if (request.action === "launch") return { pid: 123, bundleId: request.bundleId, launchTime: 1 };
        if (request.action === "inventory_windows") return { windows: [{ windowId: 44, spaceIds, displayIds: [1] }] };
        return {};
    });
    const { sessionId } = await runtime.perform("start", { taskId: "boundary" });
    await runtime.perform("launch", { sessionId, bundleId });
    spaceIds = ["2"];
    await assert.rejects(runtime.perform("launch", { sessionId, bundleId: "com.example.Other" }), /assigned Space/);
    const group = (await runtime.perform("list", {})).workspaces[0];
    assert.deepEqual(group.spaceIds, ["1"]);
    assert.equal(group.paused, true);
    assert.deepEqual(group.apps[1].enrolledWindowIds, []);
});

function isolatedDisplaySetup() {
    const calls: Record<string, any>[] = [];
    const metadata = { displayId: 42, spaceIds: ["71"], bounds: { x: 1920, y: 0, width: 1280, height: 800 } };
    const owners = new Map<string, typeof metadata>();
    const disposed: string[] = [];
    const created: string[] = [];
    let windows = [{ windowId: 44, spaceIds: ["1"], displayIds: [1] }];
    let alive = true;
    const provider = {
        create: async (owner: string) => {
            created.push(owner);
            owners.set(owner, metadata);
            return metadata;
        },
        get: (owner: string) => owners.get(owner),
        dispose: (owner: string) => {
            disposed.push(owner);
            owners.delete(owner);
        },
    };
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        calls.push(structuredClone(request));
        if (request.action === "launch") return { pid: 123, bundleId, launchTime: 1 };
        if (request.action === "inventory_windows") return { windows: structuredClone(windows) };
        if (request.action === "place_windows") {
            windows = windows.map((window) =>
                request.windowIds.includes(window.windowId) ? { ...window, spaceIds: ["71"], displayIds: [42] } : window
            );
            return { performed: true };
        }
        if (request.action === "review_on_main") {
            windows = windows.map((window) =>
                request.allowedWindowIds.includes(window.windowId)
                    ? { ...window, spaceIds: ["1"], displayIds: [1] }
                    : window
            );
            return { performed: true, isActive: true };
        }
        if (request.action === "open_file") {
            windows.push({ windowId: 55, spaceIds: ["1"], displayIds: [1] });
            return { performed: true };
        }
        if (request.action === "app_alive") return { alive };
        if (request.action === "observe")
            return {
                treeFingerprint: "a".repeat(64),
                elements: [{ elementId: "44.1", windowId: 44, AXRole: "AXButton", AXTitle: "Save" }],
            };
        return { performed: true };
    }, provider as any);
    return {
        runtime,
        calls,
        owners,
        disposed,
        created,
        metadata,
        setAlive: (value: boolean) => {
            alive = value;
        },
    };
}

test("dedicated display and Space bind before launch, and exact startup windows move before enrollment", async () => {
    const { runtime, calls, created, metadata } = isolatedDisplaySetup();
    const { sessionId, desktop } = await runtime.perform("start", { taskId: "isolated" }, "owner-a");
    assert.deepEqual(desktop, metadata);
    assert.deepEqual(created, ["owner-a"]);
    const group = (await runtime.perform("list", {}, "owner-a")).workspaces[0];
    assert.deepEqual(group.spaceIds, ["71"]);
    assert.deepEqual(group.displayIds, [42]);
    assert.equal(calls.length, 0);
    const launched = await runtime.perform("launch", { sessionId, bundleId }, "owner-a");
    const placement = calls.findIndex((call) => call.action === "place_windows");
    assert.ok(placement > 0);
    assert.deepEqual(calls[placement].windowIds, [44]);
    assert.equal(calls[placement].displayId, 42);
    assert.deepEqual(calls[placement].enrolledWindowIds, []);
    assert.equal(calls[placement + 1].action, "inventory_windows");
    assert.deepEqual(launched.app.enrolledWindowIds, [44]);
    assert.deepEqual(launched.app.expectedWindowSpaces, { "44": ["71"] });
    assert.deepEqual(launched.app.expectedWindowDisplays, { "44": [42] });
});

test("file-created windows move to the dedicated display but require human approval", async () => {
    const { runtime, calls } = isolatedDisplaySetup();
    const { sessionId } = await runtime.perform("start", { taskId: "file" });
    await runtime.perform("launch", { sessionId, bundleId });
    const opened = await runtime.perform("open_file", { sessionId, bundleId, filePath: "/tmp/task.txt" });
    assert.equal(opened.paused, true);
    const placements = calls.filter((call) => call.action === "place_windows");
    assert.deepEqual(
        placements.map((call) => call.windowIds),
        [[44], [55]]
    );
    assert.deepEqual(placements[1].enrolledWindowIds, [44]);
    const group = (await runtime.perform("list", {})).workspaces[0];
    assert.deepEqual(group.apps[0].enrolledWindowIds, [44]);
    assert.deepEqual(group.apps[0].availableWindows.find((window: any) => window.windowId === 55).displayIds, [42]);
    assert.match(group.apps[0].blockedReason, /human approval/);
});

test("loss of the display host blocks actions before native dispatch", async () => {
    const { runtime, calls, owners } = isolatedDisplaySetup();
    const { sessionId } = await runtime.perform("start", { taskId: "host" }, "owner");
    await runtime.perform("launch", { sessionId, bundleId }, "owner");
    const { snapshotId } = await runtime.perform("observe", { sessionId, bundleId }, "owner");
    owners.delete("owner");
    const previous = calls.length;
    await assert.rejects(
        runtime.perform(
            "action",
            {
                sessionId,
                bundleId,
                snapshotId,
                elementId: "44.1",
                action: "press",
            },
            "owner"
        ),
        /display is unavailable/
    );
    assert.equal(calls.length, previous);
});

test("release preserves the owned display while apps live and reclaims it only after closure", async () => {
    const { runtime, disposed, setAlive } = isolatedDisplaySetup();
    const { sessionId } = await runtime.perform("start", { taskId: "preserve" }, "owner");
    await runtime.perform("launch", { sessionId, bundleId }, "owner");
    const result = await runtime.perform("finish", { sessionId }, "owner");
    assert.equal(result.stoppedApps, false);
    assert.equal(result.appsPreserved[0].pid, 123);
    assert.deepEqual(disposed, []);
    setAlive(false);
    await runtime.perform("start", { taskId: "next" }, "owner");
    assert.deepEqual(disposed, ["owner"]);
});

test("finishing an empty group disposes only that owner's dedicated display", async () => {
    const { runtime, disposed } = isolatedDisplaySetup();
    const { sessionId } = await runtime.perform("start", { taskId: "empty" }, "owner-a");
    await runtime.perform("finish", { sessionId }, "owner-a");
    assert.deepEqual(disposed, ["owner-a"]);
});

test("human review and return use only enrolled windows and preserve the original desktop boundary", async () => {
    const { runtime, calls } = isolatedDisplaySetup();
    const { sessionId } = await runtime.perform("start", { taskId: "handoff" }, "owner", "tab");
    await runtime.perform("launch", { sessionId, bundleId }, "owner", "tab");
    const before = await runtime.perform("observe", { sessionId, bundleId }, "owner", "tab");
    await assert.rejects(runtime.manage("return_windows", { scopeId: "other-tab", sessionId, bundleId }), /Unknown/);
    const review = await runtime.manage("reveal", { scopeId: "tab", sessionId, bundleId });
    assert.equal(review.paused, true);
    assert.equal(calls.at(-1)?.action, "review_on_main");
    assert.deepEqual(calls.at(-1)?.allowedWindowIds, [44]);
    const returning = await runtime.manage("return_windows", { scopeId: "tab", sessionId, bundleId });
    assert.equal(returning.paused, true);
    const placement = calls.filter((call) => call.action === "place_windows").at(-1);
    assert.deepEqual(placement.windowIds, [44]);
    assert.equal(placement.displayId, 42);
    assert.deepEqual(returning.app.enrolledWindowIds, [44]);
    assert.deepEqual(returning.app.expectedWindowSpaces, { "44": ["71"] });
    assert.deepEqual(returning.app.expectedWindowDisplays, { "44": [42] });
    const previous = calls.length;
    await assert.rejects(
        runtime.perform(
            "action",
            {
                sessionId,
                bundleId,
                snapshotId: before.snapshotId,
                elementId: "44.1",
                action: "press",
            },
            "owner",
            "tab"
        ),
        /paused|stale/
    );
    assert.equal(calls.length, previous);
    const server = new McpServer({ name: "test", version: "1" });
    registerBackgroundWorkspaceTools(server);
    assert.equal((server as any)._registeredTools.kron_computer_background_workspace_return_windows, undefined);
});

test("return refuses a changed native Space instead of widening the approved boundary", async () => {
    let spaceIds = ["71"];
    let returning = false;
    const metadata = { displayId: 42, spaceIds: ["71"], bounds: { x: 1920, y: 0, width: 1280, height: 800 } };
    const runtime = new NativeBackgroundWorkspaces(
        async (request) => {
            if (request.action === "launch") return { pid: 123, bundleId, launchTime: 1 };
            if (request.action === "inventory_windows")
                return { windows: [{ windowId: 44, spaceIds, displayIds: [42] }] };
            if (request.action === "place_windows") {
                spaceIds = returning ? ["99"] : ["71"];
                return {};
            }
            return {};
        },
        { create: async () => metadata, get: () => metadata, dispose: () => {} } as any
    );
    const { sessionId } = await runtime.perform("start", { taskId: "return-boundary" }, "owner", "tab");
    await runtime.perform("launch", { sessionId, bundleId }, "owner", "tab");
    returning = true;
    await assert.rejects(runtime.manage("return_windows", { scopeId: "tab", sessionId, bundleId }), /assigned Space/);
    const group = (await runtime.perform("list", {}, "owner", "tab")).workspaces[0];
    assert.equal(group.paused, true);
    assert.deepEqual(group.spaceIds, ["71"]);
    assert.deepEqual(group.apps[0].expectedWindowSpaces, { "44": ["71"] });
});

test("human preview uses only enrolled windows without consuming or replacing the agent snapshot", async () => {
    const { runtime, calls } = setup();
    const { sessionId } = await runtime.perform("start", { taskId: "preview" }, "owner", "tab");
    await runtime.perform("launch", { sessionId, bundleId }, "owner", "tab");
    const observation = await runtime.perform("observe", { sessionId, bundleId }, "owner", "tab");
    await assert.rejects(runtime.manage("preview", { scopeId: "other", sessionId, bundleId }), /Unknown/);
    const preview = await runtime.manage("preview", { scopeId: "tab", sessionId, bundleId });
    assert.deepEqual(calls.at(-1)?.allowedWindowIds, [44]);
    assert.equal(calls.at(-1)?.action, "observe");
    assert.equal(preview.paused, false);
    assert.equal("snapshotId" in preview, false);
    assert.equal("elements" in preview, false);
    await runtime.perform(
        "action",
        {
            sessionId,
            bundleId,
            snapshotId: observation.snapshotId,
            elementId: "44.1",
            action: "press",
        },
        "owner",
        "tab"
    );
    assert.equal(calls.at(-1)?.action, "press");
    const server = new McpServer({ name: "test", version: "1" });
    registerBackgroundWorkspaceTools(server);
    assert.equal((server as any)._registeredTools.kron_computer_background_workspace_preview, undefined);
});

test("released dedicated apps remain human-reviewable while all agent session access is revoked", async () => {
    const { runtime, calls, disposed } = isolatedDisplaySetup();
    const { sessionId } = await runtime.perform("start", { taskId: "released-review" }, "owner", "tab");
    await runtime.perform("launch", { sessionId, bundleId }, "owner", "tab");
    await runtime.perform("finish", { sessionId }, "owner", "tab");
    assert.deepEqual((await runtime.perform("list", {}, "owner", "tab")).workspaces, []);
    const group = (await runtime.manage("list", { scopeId: "tab" })).workspaces[0];
    assert.equal(group.sessionId, sessionId);
    assert.equal(group.released, true);
    assert.equal(group.paused, true);
    assert.deepEqual(disposed, []);
    for (const operation of ["observe", "resume", "reveal", "launch", "finish", "action"]) {
        await assert.rejects(
            runtime.perform(operation, { sessionId, bundleId }, "owner", "tab"),
            /Unknown or finished/
        );
    }
    await assert.rejects(runtime.manage("preview", { scopeId: "other", sessionId, bundleId }), /Unknown/);
    await runtime.manage("preview", { scopeId: "tab", sessionId, bundleId });
    assert.equal(calls.at(-1)?.action, "observe");
    await runtime.manage("reveal", { scopeId: "tab", sessionId, bundleId });
    assert.equal(calls.at(-1)?.action, "review_on_main");
    assert.deepEqual(calls.at(-1)?.allowedWindowIds, [44]);
});

test("unavailable or malformed inventories never remove live window membership", async () => {
    let response: Record<string, unknown> = { windows: [{ windowId: 44, spaceIds: ["3"], displayIds: [1] }] };
    const runtime = new NativeBackgroundWorkspaces(async (request) => {
        if (request.action === "launch") return { pid: 123, bundleId, launchTime: 123.45 };
        if (request.action === "inventory_windows") return response;
        return {};
    });
    const { sessionId } = await runtime.perform("start", { taskId: "inventory" }, "owner", "tab");
    await runtime.perform("launch", { sessionId, bundleId }, "owner", "tab");
    for (const invalid of [
        {},
        { windows: null },
        { windows: [{ windowId: "44" }] },
        { windows: [{ windowId: 44 }, { windowId: 44 }] },
    ]) {
        response = invalid;
        await assert.rejects(
            runtime.manage("remove_window", { scopeId: "tab", sessionId, bundleId, windowId: 44 }),
            /inventory/
        );
        const group = (await runtime.manage("list", { scopeId: "tab" })).workspaces[0];
        assert.equal(group.apps[0].inventoryVerified, false);
        assert.deepEqual(group.apps[0].enrolledWindowIds, [44]);
    }
});
