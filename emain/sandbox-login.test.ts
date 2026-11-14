import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { bindSandboxComputer, registerComputerChats } from "./computer-access-policy";
import { LoginPreferences } from "./login-preferences";
import { SandboxLoginBroker } from "./sandbox-login";

const Roots: string[] = [];
vi.mock("./linux-desktops-runtime", () => ({ getLinuxDesktopsRuntime: () => undefined }));
afterEach(() => {
    bindSandboxComputer("login-tab");
    for (const root of Roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
    const root = mkdtempSync(join(tmpdir(), "sandbox-login-"));
    Roots.push(root);
    const file = join(root, "logins.json");
    const preferences = new LoginPreferences(file);
    const desktop = {
        id: "linux-vm:test",
        name: "Test VM",
        ready: true,
        controlOwner: "agent",
        assignedAgentId: "sandbox:login-tab",
        controlGeneration: 1,
    };
    const fleet = {
        list: vi.fn(async () => [{ ...desktop }]),
        takeover: vi.fn(async (_id, expected) => {
            if (expected.agentId !== desktop.assignedAgentId || expected.generation !== desktop.controlGeneration)
                throw Error("Changed");
            desktop.controlOwner = "user";
            desktop.controlGeneration++;
            return { ...desktop };
        }),
        assign: vi.fn(async (_id, agent, generation) => {
            if (desktop.controlGeneration !== generation) throw Error("Changed");
            desktop.controlOwner = "agent";
            desktop.assignedAgentId = agent;
            desktop.controlGeneration++;
            return { ...desktop };
        }),
        privateBrowser: vi.fn(async (_id, _generation, input) => ({
            phase: input.action === "fill" ? "submitted" : "ready",
            passwordVisible: !!input.agentId,
            status: input.agentId ? "required" : "authenticated",
            providers: [],
        })),
    };
    const item = { id: "a".repeat(26), vaultId: "b".repeat(26), title: "Work" };
    const vault = {
        available: () => true,
        list: vi.fn(async () => [item]),
        credentials: vi.fn(async () => ({ username: "test-account", password: "fixture-secret" })),
    };
    bindSandboxComputer("login-tab", desktop.id, "hybrid");
    const broker = new SandboxLoginBroker(fleet as any, preferences, vault as any);
    return { broker, preferences, fleet, desktop, file, item, vault };
}

it("hands back, keeps default Ask policy, submits privately, remembers metadata and returns to the agent", async () => {
    const { broker, fleet, desktop, file } = fixture();
    const request = await broker.request("login-tab", "chat", "https://example.com");
    expect(request).toMatchObject({ phase: "choose", policy: "ask" });
    expect(desktop.controlOwner).toBe("user");
    expect(broker.blocksTab("login-tab")).toBe(true);
    expect(fleet.privateBrowser).toHaveBeenCalledExactlyOnceWith(desktop.id, 1, {
        action: "inspect",
        origin: "https://example.com",
        agentId: "sandbox:login-tab",
    });
    await broker.ui("login-tab", {
        action: "submit",
        sessionIds: ["chat"],
        requestId: request.id,
        provider: "manual",
        username: "test-account",
        password: "fixture-secret",
    });
    expect(fleet.privateBrowser).toHaveBeenCalledWith(desktop.id, 2, {
        action: "fill",
        origin: "https://example.com",
        username: "test-account",
        password: "fixture-secret",
    });
    const done = await broker.ui("login-tab", {
        action: "complete",
        sessionIds: ["chat"],
        requestId: request.id,
        account: "Test",
        remember: true,
    });
    expect(done.request.phase).toBe("complete");
    expect(broker.blocksTab("login-tab")).toBe(false);
    expect(desktop.controlOwner).toBe("agent");
    const memory = readFileSync(file, "utf8");
    expect(memory).toContain('"policy":"ask"');
    expect(memory).not.toContain("fixture-secret");
    expect(JSON.stringify(done)).not.toContain("fixture-secret");
});

it("isolates chats, origins, expired requests and manual ownership changes", async () => {
    const { broker, desktop, fleet } = fixture();
    const request = await broker.request("login-tab", "chat", "https://example.com");
    await expect(
        broker.ui("login-tab", { action: "complete", sessionIds: ["other-chat"], requestId: request.id })
    ).rejects.toThrow("another chat");
    await expect(broker.request("login-tab", "chat", "https://other.example.com")).rejects.toThrow("Finish or cancel");
    desktop.controlGeneration++;
    await expect(
        broker.ui("login-tab", { action: "complete", sessionIds: ["chat"], requestId: request.id })
    ).rejects.toThrow("control changed");
    expect(fleet.assign).not.toHaveBeenCalled();
    await broker.ui("login-tab", { action: "cancel", sessionIds: ["chat"], requestId: request.id });
    expect(broker.blocksComputer(desktop.id)).toBe(false);
    expect(desktop.controlOwner).toBe("user");
});

it("denies sign-in from the old workspace after the new owner takes human control", async () => {
    const { broker, desktop, fleet } = fixture();
    desktop.assignedAgentId = "sandbox:new-tab";
    desktop.controlOwner = "user";
    await expect(broker.request("login-tab", "chat", "https://example.com")).rejects.toThrow("another workspace");
    expect(fleet.privateBrowser).not.toHaveBeenCalled();
});

it("keeps agent control when a remembered session is already authenticated", async () => {
    const { broker, preferences, desktop, fleet, vault } = fixture();
    fleet.privateBrowser.mockResolvedValue({
        phase: "ready",
        status: "authenticated",
        passwordVisible: false,
        providers: [],
    });
    preferences.remember({
        origin: "https://example.com",
        account: "Work",
        computerId: desktop.id,
        policy: "automatic",
    });
    const result = await broker.request("login-tab", "chat", "https://example.com", "Work");
    expect(result).toMatchObject({ phase: "complete", reusedSession: true });
    expect(desktop.controlOwner).toBe("agent");
    expect(vault.credentials).not.toHaveBeenCalled();
    expect(fleet.takeover).not.toHaveBeenCalled();
});

it("uses only a remembered 1Password reference for automatic credential filling", async () => {
    const { broker, preferences, desktop, vault, item, fleet } = fixture();
    preferences.remember({
        origin: "https://example.com",
        account: "Work",
        computerId: desktop.id,
        policy: "automatic",
        credential: { itemId: item.id, vaultId: item.vaultId },
    });
    fleet.privateBrowser.mockImplementation(async (_id, _generation, input) => ({
        phase: input.action === "fill" ? "submitted" : "ready",
        passwordVisible: input.action === "inspect",
        status: input.action === "inspect" ? "required" : "authenticated",
        providers: [],
    }));
    const result = await broker.request("login-tab", "chat", "https://example.com", "Work");
    expect(vault.credentials).toHaveBeenCalledWith("https://example.com", item);
    expect(result.phase).toBe("complete");
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
});

it("does not remember failed login or return control while a password form is visible", async () => {
    const { broker, fleet, desktop, file } = fixture();
    const request = await broker.request("login-tab", "chat", "https://example.com");
    fleet.privateBrowser.mockResolvedValue({
        phase: "ready",
        passwordVisible: true,
        status: "required",
        providers: [],
    });
    await expect(
        broker.ui("login-tab", {
            action: "complete",
            sessionIds: ["chat"],
            requestId: request.id,
            remember: true,
            account: "Work",
        })
    ).rejects.toThrow("still shows a sign-in");
    expect(desktop.controlOwner).toBe("user");
    expect(fleet.assign).not.toHaveBeenCalled();
    expect(() => readFileSync(file)).toThrow();
});

it("redacts provider errors and rejects forged vault choices", async () => {
    const { broker, vault } = fixture();
    const request = await broker.request("login-tab", "chat", "https://example.com");
    const result = await broker.ui("login-tab", {
        action: "submit",
        sessionIds: ["chat"],
        requestId: request.id,
        provider: "1password",
        itemId: "forged",
        vaultId: "forged",
    });
    expect(vault.credentials).not.toHaveBeenCalled();
    expect(result.request.phase).toBe("choose");
    expect(result.request.error).toContain("Sign-in did not finish");
});
it("keeps a pending login reachable after the same stored chat gets a new runtime identity", async () => {
    const { broker } = fixture();
    registerComputerChats("login-tab", ["old-runtime", "stored-chat"]);
    const request = await broker.request("login-tab", "old-runtime", "https://example.com");
    registerComputerChats("login-tab", ["new-runtime", "stored-chat"]);
    expect(
        (await broker.ui("login-tab", { action: "poll", sessionIds: ["new-runtime", "stored-chat"] })).request.id
    ).toBe(request.id);
    await broker.ui("login-tab", { action: "cancel", sessionIds: ["new-runtime"], requestId: request.id });
    expect(broker.blocksTab("login-tab")).toBe(false);
});

it("can save a newly chosen policy after an unreadable prior policy", async () => {
    const { broker, preferences, desktop } = fixture();
    vi.spyOn(preferences, "list").mockImplementation(() => {
        throw new Error("Keychain locked");
    });
    const save = vi.spyOn(preferences, "remember");
    const request = await broker.request("login-tab", "chat", "https://example.com");
    expect(request).toMatchObject({ phase: "choose", policy: "ask" });
    expect(request.memoryNotice).toBeUndefined();
    const done = await broker.ui("login-tab", {
        action: "complete",
        sessionIds: ["chat"],
        requestId: request.id,
        account: "Work",
        remember: true,
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ account: "Work", policy: "ask" }), true);
    expect(done.request).toMatchObject({ phase: "complete" });
    expect(desktop.controlOwner).toBe("agent");
});

it("still returns control and reports an encrypted save failure", async () => {
    const { broker, preferences, desktop } = fixture();
    vi.spyOn(preferences, "remember").mockImplementation(() => {
        throw new Error("Keychain locked");
    });
    const request = await broker.request("login-tab", "chat", "https://example.com");
    const done = await broker.ui("login-tab", {
        action: "complete",
        sessionIds: ["chat"],
        requestId: request.id,
        account: "Work",
        remember: true,
    });
    expect(done.request).toMatchObject({ phase: "complete", memoryNotice: expect.any(String) });
    expect(desktop.controlOwner).toBe("agent");
});

it.each(["authenticated", "unknown"])(
    "leaves the agent in control without a prompt when the page is %s",
    async (status) => {
        const { broker, fleet, desktop } = fixture();
        fleet.privateBrowser.mockResolvedValue({ phase: "ready", status, passwordVisible: false, providers: [] });
        const result = await broker.request("login-tab", "chat", "https://example.com");
        expect(result.phase).toBe(status === "authenticated" ? "complete" : "unverified");
        expect(await broker.ui("login-tab", { action: "poll", sessionIds: ["chat"] })).toEqual({ request: undefined });
        expect(fleet.takeover).not.toHaveBeenCalled();
        expect(desktop.controlOwner).toBe("agent");
    }
);

it("starts only a detected provider from the matching user's card", async () => {
    const { broker, fleet, desktop } = fixture();
    fleet.privateBrowser.mockResolvedValueOnce({
        phase: "ready",
        status: "required",
        passwordVisible: false,
        providers: ["google"],
    });
    const request = await broker.request("login-tab", "chat", "https://example.com");
    const command = { action: "provider", sessionIds: ["chat"], requestId: request.id } as const;
    await expect(broker.ui("login-tab", { ...command, sessionIds: ["chat"], provider: "github" })).rejects.toThrow(
        "no longer available"
    );
    expect(fleet.privateBrowser).toHaveBeenCalledTimes(1);
    const result = await broker.ui("login-tab", { ...command, sessionIds: ["chat"], provider: "google" });
    expect(fleet.privateBrowser).toHaveBeenLastCalledWith(desktop.id, 2, {
        action: "provider",
        origin: "https://example.com",
        provider: "google",
    });
    expect(result.request.phase).toBe("review");
    expect(desktop.controlOwner).toBe("user");
});

it("discovers providers rendered after the login card first opens", async () => {
    const { broker, fleet } = fixture();
    fleet.privateBrowser.mockResolvedValueOnce({
        phase: "ready",
        status: "required",
        passwordVisible: false,
        providers: [],
    });
    const request = await broker.request("login-tab", "chat", "https://example.com");
    expect(request.providers).toEqual([]);
    fleet.privateBrowser.mockResolvedValueOnce({
        phase: "ready",
        status: "required",
        passwordVisible: false,
        providers: ["google"],
    });
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 4000);
    try {
        await broker.ui("login-tab", { action: "poll", sessionIds: ["chat"] });
        expect((await broker.ui("login-tab", { action: "poll", sessionIds: ["chat"] })).request.providers).toEqual([
            "google",
        ]);
        expect(fleet.privateBrowser).toHaveBeenCalledTimes(2);
    } finally {
        clock.mockRestore();
    }
});
