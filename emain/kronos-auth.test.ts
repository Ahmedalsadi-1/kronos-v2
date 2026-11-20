// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ path: "", openExternal: vi.fn() }));
vi.mock("electron", () => ({
    app: { getPath: () => mock.path },
    safeStorage: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => "keychain",
        encryptString: (text: string) => Buffer.from("fixture:" + text),
        decryptString: (contents: Buffer) => contents.toString().slice("fixture:".length),
    },
    shell: { openExternal: mock.openExternal },
}));

const session = {
    access_token: "fixture-access",
    refresh_token: "fixture-refresh",
    user: { id: "fixture", email: "test@example.com" },
};
const publicStatus = { configured: true, account: { email: "test@example.com" } };

it.each([
    ["https://lh3.googleusercontent.com/a/avatar", true],
    ["https://avatars.githubusercontent.com/u/123", true],
    ["http://127.0.0.1/private", false],
    ["https://untrusted.example/avatar", false],
])("only returns supported public provider photos: %s", async (avatarURL, allowed) => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            Response.json({
                ...session,
                user: { ...session.user, user_metadata: { full_name: "Test User", avatar_url: avatarURL } },
            })
        )
    );
    const { kronosAccount } = await import("./kronos-auth");
    await kronosAccount({ action: "send-code", email: "test@example.com" });
    const status = await kronosAccount({ action: "verify-code", code: "123456" });
    expect(status.account.name).toBe("Test User");
    expect(status.account.avatarURL).toBe(allowed ? avatarURL : undefined);
    expect(JSON.stringify(status)).not.toContain("fixture-refresh");
    expect(JSON.stringify(status)).not.toContain("fixture-access");
});

beforeEach(async () => {
    vi.resetModules();
    mock.path = await mkdtemp(path.join(os.tmpdir(), "kronos-auth-test-"));
    vi.stubEnv("KRONOS_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("KRONOS_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
    mock.openExternal.mockReset();
});

afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(mock.path, { recursive: true, force: true });
});

it.each(["google", "github"] as const)(
    "accepts a %s callback and exchanges the matching PKCE verifier",
    async (provider) => {
        const network = globalThis.fetch;
        let challenge = "";
        mock.openExternal.mockImplementation(async (href: string) => {
            const authorization = new URL(href);
            expect(authorization.origin).toBe("https://fixture.supabase.co");
            expect(authorization.searchParams.get("provider")).toBe(provider);
            challenge = authorization.searchParams.get("code_challenge");
            const redirect = new URL(authorization.searchParams.get("redirect_to"));
            expect(redirect.hostname).toBe("127.0.0.1");
            expect((await network(new URL("/incorrect", redirect))).status).toBe(404);
            redirect.searchParams.set("code", "fixture-code");
            expect((await network(redirect)).status).toBe(200);
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                expect(url).toBe("https://fixture.supabase.co/auth/v1/token?grant_type=pkce");
                const payload = JSON.parse(options.body);
                expect(payload.auth_code).toBe("fixture-code");
                expect(createHash("sha256").update(payload.code_verifier).digest("base64url")).toBe(challenge);
                return Response.json(session);
            })
        );
        const { kronosAccount } = await import("./kronos-auth");
        expect(await kronosAccount({ action: "provider", provider })).toEqual(publicStatus);
        const saved = await readFile(path.join(mock.path, "kronos-account"), "utf8");
        expect(saved).toContain("fixture-refresh");
        expect(saved).not.toContain("fixture-access");
    }
);

it("verifies the email code, restores the session, and removes it on sign-out", async () => {
    const fetcher = vi.fn(async (url: string) =>
        url.endsWith("/otp") || url.includes("/logout") ? new Response(null, { status: 204 }) : Response.json(session)
    );
    vi.stubGlobal("fetch", fetcher);
    const { kronosAccount } = await import("./kronos-auth");
    await expect(kronosAccount({ action: "verify-code", code: "123456" })).rejects.toThrow("code sent");
    await kronosAccount({ action: "send-code", email: "Test@Example.com" });
    expect(await kronosAccount({ action: "verify-code", code: "123456" })).toEqual(publicStatus);
    expect(fetcher).toHaveBeenCalledWith(
        "https://fixture.supabase.co/auth/v1/verify",
        expect.objectContaining({
            body: JSON.stringify({ email: "test@example.com", token: "123456", type: "email" }),
        })
    );
    vi.resetModules();
    const restored = await import("./kronos-auth");
    expect(await restored.kronosAccount({ action: "status" })).toEqual(publicStatus);
    expect(await restored.kronosAccount({ action: "sign-out" })).toEqual({ configured: true, account: null });
    await expect(readFile(path.join(mock.path, "kronos-account"))).rejects.toMatchObject({ code: "ENOENT" });
});
