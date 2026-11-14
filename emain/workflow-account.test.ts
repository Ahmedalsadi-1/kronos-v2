import { afterEach, expect, it, vi } from "vitest";
import {
    forgetWorkflowSession,
    registerWorkflowSession,
    releaseWorkflowSession,
    workflowAccount,
} from "./workflow-account";

const mocks = vi.hoisted(() => ({ set: vi.fn(), refresh: vi.fn() }));
vi.mock("./authkey", () => ({ refreshManagedRuntimeSocketHeaders: mocks.refresh }));
vi.mock("electron", () => ({ session: { defaultSession: { cookies: { set: mocks.set } } } }));
const origins = new Set<string>();
function register(port: number, token = "a".repeat(64)) {
    const origin = `http://127.0.0.1:${port}`;
    registerWorkflowSession(origin, token);
    origins.add(origin);
    return origin;
}
afterEach(() => {
    for (const origin of origins) releaseWorkflowSession(origin);
    origins.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});
const response = (cookie = "current") => ({
    ok: true,
    headers: { getSetCookie: () => [`n8n-auth=${cookie}; HttpOnly`] },
});

it("exchanges the managed Hermes runtime capability without a saved password or keychain", async () => {
    const origin = register(12345);
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    expect(await workflowAccount(origin)).toBe("n8n-auth=current");
    expect(fetch).toHaveBeenCalledWith(
        `${origin}/rest/kronterm/session`,
        expect.objectContaining({
            method: "POST",
            redirect: "error",
            headers: expect.objectContaining({ authorization: `Bearer ${"a".repeat(64)}` }),
        })
    );
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
    expect(await workflowAccount(origin)).toBe("n8n-auth=current");
    expect(fetch).toHaveBeenCalledTimes(1);
});

it("refuses unregistered and non-loopback origins before sending a capability", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(workflowAccount("http://127.0.0.1:12346")).rejects.toThrow("Start the workflow canvas");
    for (const origin of ["https://example.com", "http://localhost:12346", "http://127.0.0.1:12346/path"])
        expect(() => registerWorkflowSession(origin, "a".repeat(64))).toThrow("loopback");
    expect(fetch).not.toHaveBeenCalled();
});

it("shares an in-flight exchange and cancels it on runtime release", async () => {
    const origin = register(12347);
    let finish: (value: unknown) => void;
    vi.stubGlobal(
        "fetch",
        vi.fn(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        )
    );
    const pending = workflowAccount(origin);
    expect(workflowAccount(origin)).toBe(pending);
    releaseWorkflowSession(origin);
    finish(response("expired"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(mocks.set).not.toHaveBeenCalled();
    await expect(workflowAccount(origin)).rejects.toThrow("Start the workflow canvas");
});

it("renews expired sessions without invalidating a newer cookie on a stale 401", async () => {
    const origin = register(12348);
    const fetch = vi.fn().mockResolvedValueOnce(response("old")).mockResolvedValueOnce(response("new"));
    vi.stubGlobal("fetch", fetch);
    await workflowAccount(origin);
    forgetWorkflowSession(origin, "n8n-auth=old");
    expect(await workflowAccount(origin)).toBe("n8n-auth=new");
    forgetWorkflowSession(origin, "n8n-auth=old");
    expect(await workflowAccount(origin)).toBe("n8n-auth=new");
    expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not install cookies after token rotation or failed exchanges", async () => {
    const origin = register(12349);
    let finish: (value: unknown) => void;
    vi.stubGlobal(
        "fetch",
        vi.fn(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        )
    );
    const pending = workflowAccount(origin);
    registerWorkflowSession(origin, "b".repeat(64));
    finish(response());
    await expect(pending).rejects.toThrow("cancelled");
    expect(mocks.set).not.toHaveBeenCalled();
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, status: 403 }))
    );
    await expect(workflowAccount(origin)).rejects.toThrow("requires MFA");
    expect(mocks.refresh).not.toHaveBeenCalled();
});
