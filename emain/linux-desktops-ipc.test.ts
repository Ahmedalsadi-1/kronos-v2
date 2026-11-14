import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
    initializeComputerAccessPersistence,
    resolveComputerChatContext,
    sandboxComputerForTab,
} from "./computer-access-policy";
import { registerLinuxDesktopsIpc } from "./linux-desktops-ipc";
const fixture = vi.hoisted(() => ({
    handlers: new Map<string, (...args: any[]) => any>(),
    activeExternal: false,
    confirmMove: vi.fn(async () => ({ response: 0 })),
    desktop: {
        id: "linux-vm:ubuntu",
        controlOwner: "user",
        controlGeneration: 0,
        assignedAgentId: "",
        status: "running",
        imagePrepared: true,
    },
    second: {
        id: "linux-container:second",
        controlOwner: "user",
        controlGeneration: 0,
        assignedAgentId: "",
        status: "running",
        imagePrepared: true,
    },
}));
const fleet = vi.hoisted(() => ({
    list: vi.fn(async () => [{ ...fixture.desktop }, { ...fixture.second }]),
    assign: vi.fn(async (id, label, generation) => {
        const desktop = id === fixture.second.id ? fixture.second : fixture.desktop;
        if (desktop.controlGeneration !== generation) throw new Error("Stale generation");
        desktop.controlOwner = "agent";
        desktop.assignedAgentId = label;
        desktop.controlGeneration++;
        return { ...desktop };
    }),
    takeover: vi.fn(async (id) => {
        const desktop = id === fixture.second.id ? fixture.second : fixture.desktop;
        desktop.controlOwner = "user";
        desktop.controlGeneration++;
        return { ...desktop };
    }),
    manage: vi.fn(),
    perform: vi.fn(),
    performAgent: vi.fn(async () => ({ desktop: { ...fixture.desktop, status: "running" } })),
    resume: vi.fn(),
}));
vi.mock("electron", () => ({
    BrowserWindow: { fromWebContents: () => null },
    dialog: { showMessageBox: fixture.confirmMove },
    ipcMain: { handle: (name, handler) => fixture.handlers.set(name, handler) },
}));
vi.mock("./emain-tabview", () => ({
    getWaveTabViewByWebContentsId: (id) =>
        id === 1
            ? { waveTabId: "sandbox-tab", savedInitOpts: { workspaceId: "sandbox-workspace" } }
            : id === 2
              ? { waveTabId: "other-tab", savedInitOpts: { workspaceId: "other-workspace" } }
              : undefined,
}));
vi.mock("./emain-hud", () => ({
    isTrustedNativeHudSender: (id) => id === 3,
    nativeHudTaskContext: (id) => (id === 3 ? { tabId: "sandbox-tab", workspaceId: "sandbox-workspace" } : undefined),
}));
vi.mock("./acp/acp-agent-manager", () => ({ hasRunningExternalAgentForTab: () => fixture.activeExternal }));
vi.mock("./linux-desktops-runtime", () => ({ getLinuxDesktopsRuntime: () => fleet }));
const frame = {};
const event = { sender: { id: 1, mainFrame: frame }, senderFrame: frame };
beforeEach(() => {
    fixture.activeExternal = false;
    for (const desktop of [fixture.desktop, fixture.second]) {
        desktop.controlOwner = "user";
        desktop.assignedAgentId = "";
        desktop.status = "running";
        desktop.imagePrepared = true;
    }
    fixture.handlers.clear();
    registerLinuxDesktopsIpc();
});
afterEach(() => {
    initializeComputerAccessPersistence();
    vi.clearAllMocks();
});
it("grants the selected VM to its owning workspace and revokes it on disable", async () => {
    const call = fixture.handlers.get("computer-access");
    expect(await call(event, { enabled: true, desktopId: "linux-vm:ubuntu" })).toEqual({
        enabled: true,
        desktopId: "linux-vm:ubuntu",
        mode: "sandbox",
    });
    expect(fleet.assign).toHaveBeenCalledWith("linux-vm:ubuntu", "sandbox:sandbox-tab", expect.any(Number));
    expect(sandboxComputerForTab("sandbox-tab")).toBe("linux-vm:ubuntu");
    expect(await call(event, { enabled: false })).toEqual({ enabled: false, desktopId: "", mode: "sandbox" });
    expect(fleet.takeover).toHaveBeenCalled();
});
it("keeps a repeated selection and a passive refresh in another workspace from invalidating the chat's grant", async () => {
    const call = fixture.handlers.get("computer-access");
    const input = { enabled: true, desktopId: "linux-vm:ubuntu", sessionIds: ["stable-chat"] };
    await call(event, input);
    const generation = fixture.desktop.controlGeneration;
    await call(event, input);
    expect(fleet.assign).toHaveBeenCalledTimes(1);
    expect(fixture.desktop.controlGeneration).toBe(generation);
    const otherEvent = { ...event, sender: { ...event.sender, id: 2 } };
    expect(await call(otherEvent, { sessionIds: ["stable-chat"] })).toMatchObject({
        enabled: true,
        desktopId: "linux-vm:ubuntu",
    });
    expect(fleet.assign).toHaveBeenCalledTimes(1);
    expect(resolveComputerChatContext({ agentRuntime: "hermes" }, "stable-chat").workspaceId).toBe("sandbox-workspace");
});

it("preserves the owning workspace for a chat attached through the HUD", async () => {
    const call = fixture.handlers.get("computer-access");
    await call({ ...event, sender: { ...event.sender, id: 3 } }, { sessionIds: ["hud-live", "hud-stored"] });
    expect(resolveComputerChatContext({ agentRuntime: "hermes" }, "hud-live")).toMatchObject({
        tabId: "sandbox-tab",
        workspaceId: "sandbox-workspace",
        chatId: "hud-stored",
    });
});
it("rejects subframes, unknown computers, running external agents and another workspace's reservation", async () => {
    const call = fixture.handlers.get("computer-access");
    await expect(call({ ...event, senderFrame: {} }, { enabled: true, desktopId: "linux-vm:ubuntu" })).rejects.toThrow(
        "Only a workspace"
    );
    await expect(call(event, { enabled: true, desktopId: "unknown" })).rejects.toThrow("Choose an available");
    fixture.activeExternal = true;
    await expect(call(event, { enabled: true, desktopId: "linux-vm:ubuntu" })).rejects.toThrow("external ACP");
    fixture.activeExternal = false;
    fixture.desktop.controlOwner = "agent";
    fixture.desktop.assignedAgentId = "sandbox:other";
    await expect(call(event, { enabled: true, desktopId: "linux-vm:ubuntu" })).rejects.toThrow("another workspace");
    expect(fleet.assign).not.toHaveBeenCalled();
});

it("enables Hybrid only through an explicit workspace grant and rejects unknown modes", async () => {
    const call = fixture.handlers.get("computer-access");
    await expect(call(event, { enabled: true, desktopId: "linux-vm:ubuntu", mode: "root" })).rejects.toThrow(
        "Invalid computer access mode"
    );
    expect(fleet.assign).not.toHaveBeenCalled();
    expect(await call(event, { enabled: true, desktopId: "linux-vm:ubuntu", mode: "hybrid" })).toMatchObject({
        enabled: true,
        mode: "hybrid",
    });
    expect(await call(event)).toMatchObject({ mode: "hybrid" });
    expect(await call(event, { enabled: false })).toMatchObject({ enabled: false, mode: "sandbox" });
});

it("keeps one workspace selection unless the user grants a separate sandbox to a chat", async () => {
    const call = fixture.handlers.get("computer-access");
    const first = { enabled: true, desktopId: fixture.desktop.id, sessionIds: ["first-live", "first"] };
    const second = { enabled: true, desktopId: fixture.second.id, sessionIds: ["second-live", "second"] };
    await call(event, first);
    await call(event, second);
    expect(fixture.desktop.controlOwner).toBe("user");
    expect(sandboxComputerForTab("sandbox-tab", "first-live")).toBe(fixture.second.id);
    await call(event, first);

    await expect(call(event, { ...second, desktopId: first.desktopId, separateChat: true })).rejects.toThrow(
        "already granted"
    );
    await expect(call(event, { ...second, sessionIds: [], separateChat: true })).rejects.toThrow("owning workspace");
    expect(await call(event, { ...second, separateChat: true })).toMatchObject({
        desktopId: second.desktopId,
        separateChat: true,
    });
    expect(fixture.desktop.controlOwner).toBe("agent");
    expect(fixture.second.controlOwner).toBe("agent");
    expect(sandboxComputerForTab("sandbox-tab", "first-live")).toBe(first.desktopId);
    expect(resolveComputerChatContext({ agentRuntime: "hermes" }, "second-live").sandboxComputerId).toBe(
        second.desktopId
    );
    await expect(call(event, { ...first, desktopId: second.desktopId })).rejects.toThrow("already granted");
    const other = { ...event, sender: { ...event.sender, id: 2 } };
    await expect(call(other, second)).rejects.toThrow("owning workspace");
    await expect(call(other, { enabled: false, sessionIds: ["second"] })).rejects.toThrow("owning workspace");
    expect(await call(event, { enabled: false, sessionIds: ["second"] })).toMatchObject({
        enabled: true,
        desktopId: first.desktopId,
    });
    expect(fixture.desktop.controlOwner).toBe("agent");
    expect(fixture.second.controlOwner).toBe("user");
});

it("serializes concurrent permission changes in a workspace", async () => {
    const call = fixture.handlers.get("computer-access");
    const first = call(event, { enabled: true, desktopId: fixture.desktop.id });
    await expect(
        call(event, { enabled: true, desktopId: fixture.second.id, sessionIds: ["chat"], separateChat: true })
    ).rejects.toThrow("in progress");
    await first;
    expect(fleet.assign).toHaveBeenCalledTimes(1);
});

it("keeps an unprepared VM under user control for setup", async () => {
    const call = fixture.handlers.get("computer-access");
    fixture.second.status = "missing";
    fixture.second.imagePrepared = false;
    await expect(call(event, { enabled: true, desktopId: fixture.second.id })).rejects.toThrow("Prepare");
    expect(fleet.assign).not.toHaveBeenCalled();
    expect(fixture.second.controlOwner).toBe("user");
});

it("moves control of a desktop only after confirmation and keeps the previous scope pinned", async () => {
    const call = fixture.handlers.get("computer-access");
    const other = { ...event, sender: { ...event.sender, id: 2 } };
    const desktopId = fixture.desktop.id;
    await call(other, { enabled: true, desktopId });
    const generation = fixture.desktop.controlGeneration;
    await expect(call(event, { enabled: true, desktopId })).rejects.toThrow("another workspace");
    expect(fixture.desktop.controlGeneration).toBe(generation);

    fixture.confirmMove.mockResolvedValueOnce({ response: 1 });
    expect(await call(event, { enabled: true, desktopId })).toMatchObject({ desktopId, enabled: true });
    expect(fixture.desktop.assignedAgentId).toBe("sandbox:sandbox-tab");
    expect(fixture.desktop.controlGeneration).toBe(generation + 1);
    expect(sandboxComputerForTab("other-tab")).toBe(desktopId);
    await call(other, { enabled: false });
    expect(fixture.desktop.controlOwner).toBe("agent");
    expect(fleet.takeover).not.toHaveBeenCalled();
});

it("starts a stopped VM with its current grant when reselected from the picker", async () => {
    const call = fixture.handlers.get("computer-access");
    const selection = { enabled: true, desktopId: fixture.desktop.id, startIfStopped: true };
    await call(event, selection);
    fixture.desktop.status = "stopped";
    await call(event, selection);
    expect(fleet.performAgent).toHaveBeenCalledWith({
        desktopId: fixture.desktop.id,
        action: "start",
        expectedGeneration: fixture.desktop.controlGeneration,
        assignedAgentId: "sandbox:sandbox-tab",
    });
    expect(fleet.perform).not.toHaveBeenCalled();
    expect(fleet.assign).toHaveBeenCalledTimes(1);
});
