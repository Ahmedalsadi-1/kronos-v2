import { beforeEach, expect, it, vi } from "vitest";
import { OnePasswordLogin } from "./onepassword-login";

const fixture = vi.hoisted(() => ({ installed: true, args: [] as string[][], env: null as any, response: null as any, failure: false }));
vi.mock("node:fs", () => ({ existsSync: (value: string) => fixture.installed && value === "/opt/homebrew/bin/op" }));
vi.mock("node:child_process", () => ({ execFile: (_binary, args, options, callback) => {
    fixture.args.push(args); fixture.env = options.env;
    callback(fixture.failure ? new Error("raw secret must not escape") : null, JSON.stringify(fixture.response));
} }));
beforeEach(() => { fixture.installed = true; fixture.args = []; fixture.failure = false; });
const Item = { id: "a".repeat(26), vault: { id: "b".repeat(26) }, category: "LOGIN", title: "Work", urls: [{ href: "https://example.com/login" }], fields: [{ id: "username", value: "fixture-user" }, { id: "password", value: "fixture-secret" }] };

it("selects only exact-origin login metadata and never returns fields", async () => {
    fixture.response = [Item, { ...Item, urls: [{ href: "https://evil.example.com" }] }];
    const logins = await new OnePasswordLogin().list("https://example.com");
    expect(logins).toEqual([{ id: Item.id, vaultId: Item.vault.id, title: "Work" }]);
    expect(JSON.stringify(logins)).not.toContain("fixture-secret");
});
it("checks the vault item origin again and drops automation tokens from the child environment", async () => {
    fixture.response = Item;
    vi.stubEnv("OP_SERVICE_ACCOUNT_TOKEN", "must-not-use");
    try {
        const provider = new OnePasswordLogin();
        const credentials = await provider.credentials("https://example.com", { id: Item.id, vaultId: Item.vault.id, title: "Work" });
        expect(credentials.password).toBe("fixture-secret");
        expect(fixture.env.OP_SERVICE_ACCOUNT_TOKEN).toBeUndefined();
        expect(JSON.stringify(fixture.args)).not.toContain("fixture-secret");
        await expect(provider.credentials("https://other.example.com", { id: Item.id, vaultId: Item.vault.id, title: "Work" })).rejects.toThrow("exact website");
    } finally { vi.unstubAllEnvs(); }
});
it("does not use an unrelated op binary on PATH and redacts subprocess failures", async () => {
    fixture.installed = false;
    const provider = new OnePasswordLogin();
    expect(provider.available()).toBe(false);
    await expect(provider.list("https://example.com")).rejects.not.toThrow("raw secret");
    expect(fixture.args).toEqual([]);
    fixture.installed = true; fixture.failure = true;
    await expect(provider.list("https://example.com")).rejects.toThrow("1Password did not authorize");
});
