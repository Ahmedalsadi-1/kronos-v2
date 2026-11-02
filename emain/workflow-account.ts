import { safeStorage, session } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshManagedRuntimeSocketHeaders } from "./authkey";

const AccountFile = path.join(os.homedir(), ".kronterm", "account.enc");
const Sessions = new Map<string, string>();
const Pending = new Map<string, Promise<string>>();
const Generations = new Map<string, number>();
export const WorkflowBrowserId = randomUUID();
export function forgetWorkflowSession(origin: string, cookie?: string): void {
    origin = new URL(origin).origin;
    if (cookie && Sessions.get(origin) !== cookie) return;
    Sessions.delete(origin);
    Pending.delete(origin);
    Generations.set(origin, (Generations.get(origin) ?? 0) + 1);
}
export function releaseWorkflowSession(origin: string): void {
    origin = new URL(origin).origin;
    const cookie = Sessions.get(origin);
    forgetWorkflowSession(origin);
    if (!cookie) return;
    const cookies = session.defaultSession.cookies;
    if (!cookies.get || !cookies.remove) return;
    void cookies
        .get({ url: origin })
        .then(async (stored) => {
            for (const value of stored) {
                if (cookie.split("; ").includes(`${value.name}=${value.value}`))
                    await cookies.remove(origin, value.name);
            }
        })
        .catch(() => {});
}
export function hasKronTermAccount() {
    return fs.existsSync(AccountFile);
}
type WorkflowAccount = { email: string; password: string; firstName: string; lastName: string };
export function workflowAccount(origin: string, account?: WorkflowAccount): Promise<string> {
    origin = new URL(origin).origin;
    if (Sessions.has(origin) && !account) return Promise.resolve(Sessions.get(origin));
    if (!account && Pending.has(origin)) return Pending.get(origin);
    if (account) forgetWorkflowSession(origin);
    const generation = Generations.get(origin) ?? 0;
    const pending = connectAccount(origin, account, generation);
    Pending.set(origin, pending);
    void pending
        .finally(() => {
            if (Pending.get(origin) === pending) Pending.delete(origin);
        })
        .catch(() => {});
    return pending;
}
async function connectAccount(origin: string, account: WorkflowAccount, generation: number): Promise<string> {
    if (!safeStorage.isEncryptionAvailable())
        throw new Error("Unlock the system keychain to connect your KronTerm account.");
    const saved =
        account ?? (hasKronTermAccount() ? JSON.parse(safeStorage.decryptString(fs.readFileSync(AccountFile))) : null);
    if (!saved) throw new Error("Create your KronTerm account first.");
    const signal = AbortSignal.timeout(30000);
    const headers = { "content-type": "application/json", "browser-id": WorkflowBrowserId };
    let response = await fetch(`${origin}/rest/login`, {
        method: "POST",
        signal,
        headers,
        body: JSON.stringify({ emailOrLdapLoginId: saved.email, password: saved.password }),
    });
    if (!response.ok) {
        const settings = (await (await fetch(`${origin}/rest/settings`, { signal })).json()) as any;
        if (!settings.data?.userManagement?.showSetupOnFirstLoad)
            throw new Error("KronTerm account could not sign in. Check your account details.");
        response = await fetch(`${origin}/rest/owner/setup`, {
            method: "POST",
            signal,
            headers,
            body: JSON.stringify(saved),
        });
    }
    if (!response.ok)
        throw new Error(
            "Account setup failed. Use a valid email and a password of at least eight characters including a number and capital letter."
        );
    if ((Generations.get(origin) ?? 0) !== generation) throw new Error("Workflow account connection was cancelled.");
    const cookies = response.headers.getSetCookie();
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    if (!cookie) throw new Error("Account server did not create a session.");
    for (const value of cookies) {
        const pair = value.split(";")[0];
        const index = pair.indexOf("=");
        await session.defaultSession.cookies.set({
            url: origin,
            name: pair.slice(0, index),
            value: pair.slice(index + 1),
            httpOnly: true,
            sameSite: "lax",
        });
    }
    if ((Generations.get(origin) ?? 0) !== generation) throw new Error("Workflow account connection was cancelled.");
    if (account) {
        fs.mkdirSync(path.dirname(AccountFile), { recursive: true, mode: 0o700 });
        fs.writeFileSync(AccountFile, safeStorage.encryptString(JSON.stringify(account)), { mode: 0o600 });
    }
    Sessions.set(origin, cookie);
    refreshManagedRuntimeSocketHeaders(origin.replace(/^http/, "ws"), {
        Origin: new URL(origin).origin,
        Cookie: cookie,
    });
    return cookie;
}
