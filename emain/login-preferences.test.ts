import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loginOrigin, LoginPreferences } from "./login-preferences";

const Roots: string[] = [];
afterEach(() => Roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
    const root = mkdtempSync(join(tmpdir(), "login-preferences-"));
    Roots.push(root);
    const file = join(root, "preferences.json");
    return { file, store: new LoginPreferences(file) };
}

it("persists account policy scoped to exact origin and computer, without secret fields", () => {
    const { file, store } = fixture();
    store.remember({
        origin: "https://EXAMPLE.com:443/",
        account: "Work",
        computerId: "vm-one",
        policy: "automatic",
        password: "must-not-persist",
        cookies: "must-not-persist",
    } as any);
    const restarted = new LoginPreferences(file);
    expect(restarted.list("vm-one", "https://example.com")).toEqual([
        { origin: "https://example.com", account: "Work", computerId: "vm-one", policy: "automatic" },
    ]);
    expect(restarted.list("vm-two")).toEqual([]);
    expect(restarted.list("vm-one", "https://other.example.com")).toEqual([]);
    expect(readFileSync(file, "utf8")).not.toContain("must-not-persist");
    store.remember({ origin: "https://example.com", account: "Personal", computerId: "vm-one", policy: "ask" });
    store.forget("vm-one", "https://example.com", "Work");
    expect(store.list("vm-one").map((row) => row.account)).toEqual(["Personal"]);
});

it("rejects insecure or credential-bearing website identifiers", () => {
    for (const origin of [
        "http://example.com",
        "https://user:password@example.com",
        "https://example.com/login",
        "https://example.com?token=secret",
        "https://example.com#secret",
        "javascript:alert(1)",
    ])
        expect(() => loginOrigin(origin)).toThrow();
});

it("fails closed on invalid persisted policy", () => {
    const { file, store } = fixture();
    writeFileSync(
        file,
        JSON.stringify([{ origin: "https://example.com", account: "Work", computerId: "vm", policy: "yes" }])
    );
    expect(() => store.list("vm")).toThrow("Invalid login preference record");
});

it("preserves unreadable ciphertext and stores only a newly approved policy using the current codec", () => {
    const { file } = fixture();
    const previous = "previous-key-ciphertext";
    writeFileSync(file, previous, { mode: 0o600 });
    const store = new LoginPreferences(file, {
        encode: (value) => "current-key:" + Buffer.from(value).toString("base64"),
        decode: (value) => {
            if (!value.startsWith("current-key:")) throw Error("Key changed");
            return Buffer.from(value.slice("current-key:".length), "base64").toString();
        },
    });
    const record = { origin: "https://example.com", computerId: "vm", account: "Work", policy: "ask" } as const;
    expect(() => store.remember(record)).toThrow("Key changed");
    expect(readFileSync(file, "utf8")).toBe(previous);
    store.remember(record, true);
    expect(store.list("vm")).toEqual([record]);
    const root = dirname(file);
    const backup = readdirSync(root).find((name) => name.startsWith("preferences.json.backup-"));
    expect(readFileSync(join(root, backup), "utf8")).toBe(previous);
});
