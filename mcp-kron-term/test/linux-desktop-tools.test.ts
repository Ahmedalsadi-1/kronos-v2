import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    linuxDesktopResult,
    registerLinuxDesktopTools,
    setLinuxDesktopToolBridge,
} from "../src/linux-desktop-tools.js";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";

const assigned = { desktopId: "linux:work", assignedAgentId: "research-agent", expectedGeneration: 4 };
function tools() {
    const server = new McpServer({ name: "test", version: "1" });
    registerLinuxDesktopTools(server);
    return (server as any)._registeredTools;
}

test("Linux tools bind every targeted operation to an assigned desktop and generation", () => {
    const registered = tools();
    for (const name of ["start", "stop", "screenshot", "click", "type", "key", "scroll", "exec"]) {
        const schema = registered[`linux_desktop_${name}`].inputSchema;
        assert.equal(schema.safeParse({ desktopId: assigned.desktopId }).success, false);
        assert.equal(schema.safeParse({ ...assigned, assignedAgentId: "" }).success, false);
    }
    assert.equal(registered.linux_desktop_click.inputSchema.safeParse({ ...assigned, x: 16385, y: 0 }).success, false);
    assert.equal(
        registered.linux_desktop_exec.inputSchema.safeParse({ ...assigned, command: "x".repeat(4097) }).success,
        false
    );
    assert.equal(
        registered.linux_desktop_scroll.inputSchema.safeParse({ ...assigned, deltaX: 0, deltaY: 2001 }).success,
        false
    );
    assert.equal(registered.linux_desktop_assign, undefined);
    assert.equal(registered.linux_desktop_resume, undefined);
});

test("runtime lease rejection is preserved and actions carry exact reservation", async () => {
    const registered = tools();
    const actions: unknown[] = [];
    setLinuxDesktopToolBridge({
        list: async () => [assigned],
        perform: async (action) => {
            actions.push(action);
            if (action.expectedGeneration !== 4 || action.assignedAgentId !== assigned.assignedAgentId)
                throw new Error("Desktop reservation changed");
            return { desktop: { id: action.desktopId } };
        },
    });
    try {
        const good = await registered.linux_desktop_click.handler({ ...assigned, x: 640, y: 360 });
        assert.equal(good.isError, undefined);
        assert.deepEqual(actions[0], { ...assigned, x: 640, y: 360, action: "click" });
        const stale = await registered.linux_desktop_screenshot.handler({ ...assigned, expectedGeneration: 3 });
        assert.equal(stale.isError, true);
        assert.match(stale.content[0].text, /reservation changed/);
    } finally {
        setLinuxDesktopToolBridge(undefined);
    }
});

test("Linux screenshots return native MCP image blocks without duplicate image data", () => {
    for (const mime of ["png", "jpeg"]) {
        const result = linuxDesktopResult({ desktop: assigned, imageDataUrl: `data:image/${mime};base64,aGVsbG8=` });
        assert.equal(result.content[1].type, "image");
        assert.equal((result.content[1] as any).mimeType, `image/${mime}`);
        assert.equal((result.content[0] as any).text.includes("imageDataUrl"), false);
    }
    assert.throws(() => linuxDesktopResult({ imageDataUrl: "https://untrusted/image.png" }), /Invalid/);
});

test("fullscreen contexts require computer-control capability for Linux desktop tools", () => {
    assert.equal(isToolAllowedBySurfaceCapability("linux_desktop_exec", { hostMode: "web-fullscreen" } as any), false);
    assert.equal(
        isToolAllowedBySurfaceCapability("linux_desktop_list", {
            hostMode: "web-fullscreen",
            capabilities: { computerControl: true },
        } as any),
        true
    );
});

test("standalone Linux transport refuses nonlocal endpoints before fetching", async () => {
    const originalUrl = process.env.KRONTERM_NATIVE_TOOL_URL;
    const originalToken = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
    process.env.KRONTERM_NATIVE_TOOL_URL = "https://remote.example/native";
    process.env.KRONTERM_NATIVE_TOOL_TOKEN = "test-token";
    try {
        const result = await tools().linux_desktop_list.handler({});
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /local HTTP endpoint/);
    } finally {
        if (originalUrl == null) delete process.env.KRONTERM_NATIVE_TOOL_URL;
        else process.env.KRONTERM_NATIVE_TOOL_URL = originalUrl;
        if (originalToken == null) delete process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        else process.env.KRONTERM_NATIVE_TOOL_TOKEN = originalToken;
    }
});

test("task lifecycle routes exact sessions and requires computer-control authority", async () => {
    const registered = tools();
    const calls: unknown[] = [];
    const sessionId = "1d5244bd-433c-44c2-83b2-4f83e4a770f4";
    setLinuxDesktopToolBridge({
        list: async () => [],
        perform: async () => ({}),
        startTask: async (args) => {
            calls.push(args);
            return { sessionId };
        },
        finishTask: async (id) => {
            calls.push(id);
            return { finished: true };
        },
    });
    try {
        assert.equal(registered.sandbox_task_start.inputSchema.safeParse({ ...assigned }).success, false);
        assert.equal(registered.sandbox_task_finish.inputSchema.safeParse({ sessionId: "arbitrary" }).success, false);
        await registered.sandbox_task_start.handler({ ...assigned, taskId: "demo" });
        await registered.sandbox_task_finish.handler({ sessionId });
        assert.deepEqual(calls, [{ ...assigned, taskId: "demo" }, sessionId]);
        assert.equal(
            isToolAllowedBySurfaceCapability("sandbox_task_start", {
                hostMode: "web-fullscreen",
                capabilities: { sandbox: true },
            } as any),
            false
        );
        assert.equal(
            isToolAllowedBySurfaceCapability("sandbox_task_finish", {
                hostMode: "web-fullscreen",
                capabilities: { computerControl: true },
            } as any),
            true
        );
    } finally {
        setLinuxDesktopToolBridge(undefined);
    }
});

test("shortcut and URL tools route only into the assigned guest", async () => {
    const registered = tools();
    const actions: any[] = [];
    setLinuxDesktopToolBridge({
        list: async () => [],
        perform: async (action) => {
            actions.push(action);
            return {};
        },
    });
    try {
        await registered.linux_desktop_shortcut.handler({ ...assigned, shortcut: "terminal" });
        assert.deepEqual(actions[0], { ...assigned, action: "key", key: "ctrl+alt+t" });
        assert.equal(
            registered.linux_desktop_open_url.inputSchema.safeParse({ ...assigned, url: "file:///etc/passwd" }).success,
            false
        );
        await registered.linux_desktop_open_url.handler({
            ...assigned,
            url: "https://example.com/?q='$(touch /tmp/no)'",
        });
        assert.match(actions[1].command, /xdg-open/);
        assert.ok(actions[1].command.includes("'\\''"));
    } finally {
        setLinuxDesktopToolBridge(undefined);
    }
});

test("batch stops after a failed action and retains exact authority for each action", async () => {
    const registered = tools();
    const actions: any[] = [];
    setLinuxDesktopToolBridge({
        list: async () => [],
        perform: async (action) => {
            actions.push(action);
            if (action.action === "type") throw new Error("Control changed");
            return {};
        },
    });
    try {
        const result = await registered.linux_desktop_batch.handler({
            ...assigned,
            actions: [
                { action: "click", x: 1, y: 2 },
                { action: "type", text: "hello" },
                { action: "key", key: "Return" },
            ],
        });
        assert.equal(result.isError, true);
        assert.equal(actions.length, 2);
        assert.ok(actions.every((action) => action.expectedGeneration === assigned.expectedGeneration));
        assert.match(result.content[0].text, /action 2/);
    } finally {
        setLinuxDesktopToolBridge(undefined);
    }
});

test("background GUI launch preserves guest authority and rejects shell syntax", async () => {
    const registered = tools();
    const actions: any[] = [];
    setLinuxDesktopToolBridge({
        list: async () => [],
        perform: async (action) => {
            actions.push(action);
            if (action.expectedGeneration !== assigned.expectedGeneration) throw new Error("Control changed");
            return { exitCode: 0 };
        },
    });
    try {
        for (const appId of ["../firefox.desktop", "--help.desktop", "x'; touch /tmp/no.desktop", "$(id).desktop"]) {
            assert.equal(
                registered.linux_desktop_launch_app.inputSchema.safeParse({ ...assigned, appId }).success,
                false
            );
        }
        assert.equal(
            registered.linux_desktop_apps.inputSchema.safeParse({ desktopId: assigned.desktopId }).success,
            false
        );
        await registered.linux_desktop_apps.handler(assigned);
        assert.match(actions[0].command, /find \/usr\/share\/applications/);
        await registered.linux_desktop_launch_app.handler({ ...assigned, appId: "org.gnome.Terminal.desktop" });
        assert.equal(actions[1].desktopId, assigned.desktopId);
        assert.equal(actions[1].assignedAgentId, assigned.assignedAgentId);
        assert.equal(actions[1].expectedGeneration, assigned.expectedGeneration);
        assert.equal(actions[1].action, "exec");
        assert.match(actions[1].command, /gtk-launch 'org.gnome.Terminal.desktop'/);
        assert.match(actions[1].command, /command -v gtk-launch/);
        assert.match(actions[1].command, /mktemp/);
        assert.match(actions[1].command, /DBUS_SESSION_BUS_ADDRESS/);
        assert.match(actions[1].command, /cat "\$launch_log" >&2; exit "\$launch_status"/);
        const denied = await registered.linux_desktop_launch_app.handler({
            ...assigned,
            expectedGeneration: 3,
            appId: "firefox.desktop",
        });
        assert.equal(denied.isError, true);
        assert.match(denied.content[0].text, /Control changed/);
        assert.equal(
            isToolAllowedBySurfaceCapability("linux_desktop_launch_app", { hostMode: "web-fullscreen" } as any),
            false
        );
    } finally {
        setLinuxDesktopToolBridge(undefined);
    }
});

test("guest launcher returns its diagnostic and exit status and cleans its temporary log", async () => {
    const { mkdtemp, writeFile, rm, readdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const directory = await mkdtemp(join(tmpdir(), "kronterm-launch-test-"));
    let command = "";
    setLinuxDesktopToolBridge({
        list: async () => [],
        perform: async (action) => {
            command = action.command!;
            return {};
        },
    });
    try {
        await writeFile(
            join(directory, "gtk-launch"),
            "#!/bin/sh\necho 'desktop entry could not start: diagnostic' >&2\nexit 42\n",
            { mode: 0o700 }
        );
        await tools().linux_desktop_launch_app.handler({ ...assigned, appId: "test.desktop" });
        const result = spawnSync("/bin/sh", ["-c", command], {
            encoding: "utf8",
            env: { ...process.env, PATH: directory + ":/usr/bin:/bin", TMPDIR: directory },
        });
        assert.equal(result.status, 42);
        assert.match(result.stderr, /desktop entry could not start: diagnostic/);
        assert.deepEqual(await readdir(directory), ["gtk-launch"]);
    } finally {
        setLinuxDesktopToolBridge(undefined);
        await rm(directory, { recursive: true, force: true });
    }
});
