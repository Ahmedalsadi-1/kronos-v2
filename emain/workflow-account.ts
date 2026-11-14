import { session } from "electron";
import { randomUUID } from "node:crypto";
import { refreshManagedRuntimeSocketHeaders } from "./authkey";

const Capabilities = new Map<string, string>();
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
    Capabilities.delete(origin);
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
export function registerWorkflowSession(origin: string, token: string): void {
    const url = new URL(origin);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.origin !== origin)
        throw new Error("Managed workflow sessions require an exact loopback origin.");
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid workflow session capability.");
    forgetWorkflowSession(origin);
    Capabilities.set(origin, token);
}
export function workflowAccount(origin: string): Promise<string> {
    origin = new URL(origin).origin;
    if (!Capabilities.has(origin)) return Promise.reject(new Error("Start the workflow canvas in Hermes first."));
    if (Sessions.has(origin)) return Promise.resolve(Sessions.get(origin));
    if (Pending.has(origin)) return Pending.get(origin);
    const generation = Generations.get(origin) ?? 0;
    const pending = connectAccount(origin, generation);
    Pending.set(origin, pending);
    void pending
        .finally(() => {
            if (Pending.get(origin) === pending) Pending.delete(origin);
        })
        .catch(() => {});
    return pending;
}
async function connectAccount(origin: string, generation: number): Promise<string> {
    const response = await fetch(`${origin}/rest/kronterm/session`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: { authorization: `Bearer ${Capabilities.get(origin)}`, "browser-id": WorkflowBrowserId },
    });
    if (!response.ok) {
        const message =
            response.status === 403
                ? "The existing workflow owner requires MFA. Complete its MFA recovery before connecting through Hermes."
                : `Hermes workflow session could not connect (${response.status}). Restart the workflow runtime.`;
        throw Object.assign(new Error(message), { status: response.status });
    }
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
    Sessions.set(origin, cookie);
    refreshManagedRuntimeSocketHeaders(origin.replace(/^http/, "ws"), {
        Origin: new URL(origin).origin,
        Cookie: cookie,
    });
    return cookie;
}
