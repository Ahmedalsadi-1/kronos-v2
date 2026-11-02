import { afterEach, expect, it, vi } from "vitest";
import { forgetWorkflowSession, releaseWorkflowSession, workflowAccount } from "./workflow-account";
const mocks = vi.hoisted(() => ({ set: vi.fn(), write: vi.fn(), encrypt: vi.fn((value) => Buffer.from(value)) }));
vi.mock("./authkey", () => ({ refreshManagedRuntimeSocketHeaders: vi.fn() }));
vi.mock("electron", () => ({
    safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: mocks.encrypt,
        decryptString: (v: Buffer) => v.toString(),
    },
    session: { defaultSession: { cookies: { set: mocks.set } } },
}));
vi.mock("node:fs", () => ({ default: { existsSync: () => false, mkdirSync: vi.fn(), writeFileSync: mocks.write } }));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});
it("creates one shared account and keeps credentials encrypted outside renderer responses", async () => {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ json: async () => ({ data: { userManagement: { showSetupOnFirstLoad: true } } }) })
        .mockResolvedValueOnce({ ok: true, headers: { getSetCookie: () => ["n8n-auth=test-session; HttpOnly"] } });
    vi.stubGlobal("fetch", fetch);
    const account = { email: "test@example.invalid", password: "Example123!", firstName: "Test", lastName: "User" };
    expect(await workflowAccount("http://127.0.0.1:12345", account)).toBe("n8n-auth=test-session");
    expect(mocks.encrypt).toHaveBeenCalledWith(JSON.stringify(account));
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining("account.enc"), expect.any(Buffer), {
        mode: 0o600,
    });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
});
it("does not recreate or overwrite an existing account when login fails", async () => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({
                json: async () => ({ data: { userManagement: { showSetupOnFirstLoad: false } } }),
            })
    );
    await expect(
        workflowAccount("http://127.0.0.1:12346", {
            email: "test@example.invalid",
            password: "wrong",
            firstName: "Test",
            lastName: "User",
        })
    ).rejects.toThrow("could not sign in");
    expect(mocks.write).not.toHaveBeenCalled();
});

it("shares one in-flight account connection and invalidates it on runtime release", async () => {
    let finish: (response: any) => void;
    const fetchMock = vi.fn(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            })
    );
    vi.stubGlobal("fetch", fetchMock);
    const origin = "http://127.0.0.1:12347";
    const pending = workflowAccount(origin, {
        email: "test@example.invalid",
        password: "Example123!",
        firstName: "Test",
        lastName: "User",
    });
    const same = workflowAccount(origin);
    expect(pending).toBe(same);
    releaseWorkflowSession(origin);
    finish({ ok: true, headers: { getSetCookie: () => ["n8n-auth=expired; HttpOnly"] } });
    await expect(pending).rejects.toThrow("cancelled");
    expect(mocks.write).not.toHaveBeenCalled();
});
it("does not invalidate a newer session when an older request returns 401", async () => {
    const origin = "http://127.0.0.1:12348";
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, headers: { getSetCookie: () => ["n8n-auth=current; HttpOnly"] } }))
    );
    await workflowAccount(origin, {
        email: "test@example.invalid",
        password: "Example123!",
        firstName: "Test",
        lastName: "User",
    });
    forgetWorkflowSession(origin, "n8n-auth=old");
    expect(await workflowAccount(origin)).toBe("n8n-auth=current");
    expect(fetch).toHaveBeenCalledTimes(1);
    releaseWorkflowSession(origin);
});
