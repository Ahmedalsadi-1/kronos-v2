// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, safeStorage, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import type { AccountCommand, AccountStatus } from "../frontend/types/kronos-account";
import { KronOSAuthProject } from "./kronos-auth-config";

type TokenResponse = {
    access_token: string;
    refresh_token: string;
    user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
};

function authConfiguration() {
    const overrideUrl = process.env.KRONOS_SUPABASE_URL;
    const overrideKey = process.env.KRONOS_SUPABASE_PUBLISHABLE_KEY;
    const override = Boolean(overrideUrl || overrideKey);
    const url = override ? overrideUrl : KronOSAuthProject.origin;
    const key = override ? overrideKey : KronOSAuthProject.publishableKey;
    if (!url || !key?.startsWith("sb_publishable_") || !URL.canParse(url)) return null;
    const project = new URL(url);
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(project.origin) || project.href !== project.origin + "/") {
        return null;
    }
    return { origin: project.origin, key };
}

export function isKronosAccountConfigured() {
    return authConfiguration() != null;
}

function sessionPath() {
    return path.join(app.getPath("userData"), "kronos-account");
}

let tokens: TokenResponse;
let restoring: Promise<void>;
let pendingOAuth: AbortController;
let pendingEmail: string;
let signInGeneration = 0;

async function request<T>(endpoint: string, body?: Record<string, string>, accessToken?: string): Promise<T> {
    const configuration = authConfiguration();
    if (!configuration) throw new Error("KronOS account sign-in is not configured.");
    const response = await fetch(configuration.origin + "/auth/v1/" + endpoint, {
        method: body ? "POST" : "GET",
        headers: {
            apikey: configuration.key,
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        if (response.status === 429) throw new Error("Too many attempts. Wait a moment and try again.");
        const error = new Error("The account service could not complete this request.");
        throw Object.assign(error, { status: response.status });
    }
    const content = await response.text();
    return (content ? JSON.parse(content) : null) as T;
}

async function saveSession(session: TokenResponse) {
    if (!session?.user?.id || !session.access_token || !session.refresh_token) {
        throw new Error("The account service did not return a session.");
    }
    const cryptoAvailable =
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
    if (cryptoAvailable) {
        const destination = sessionPath();
        const temporary = destination + "." + randomBytes(8).toString("hex");
        try {
            const saved = JSON.stringify({ origin: authConfiguration().origin, refreshToken: session.refresh_token });
            await writeFile(temporary, safeStorage.encryptString(saved), { flag: "wx", mode: 0o600 });
            await rename(temporary, destination);
        } finally {
            await rm(temporary, { force: true });
        }
    }
    tokens = session;
}

async function restoreSession() {
    if (!authConfiguration() || tokens || !safeStorage.isEncryptionAvailable()) return;
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") return;
    restoring ??= (async () => {
        try {
            const encrypted = await readFile(sessionPath());
            const saved = JSON.parse(safeStorage.decryptString(encrypted));
            if (saved.origin !== authConfiguration().origin || typeof saved.refreshToken !== "string") return;
            const refresh_token = saved.refreshToken;
            await saveSession(await request<TokenResponse>("token?grant_type=refresh_token", { refresh_token }));
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 400 || status === 401) await rm(sessionPath(), { force: true });
        }
    })().finally(() => {
        restoring = undefined;
    });
    await restoring;
}

async function signInWithProvider(provider: "google" | "github") {
    if (pendingOAuth) throw new Error("Finish or cancel the current sign-in first.");
    const configuration = authConfiguration();
    if (!configuration) throw new Error("KronOS account sign-in is not configured.");
    const controller = new AbortController();
    pendingOAuth = controller;
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const callbackPath = "/kronos-auth/" + randomBytes(24).toString("base64url");
    let accept: (code: string) => void;
    let reject: (error: Error) => void;
    let callbackUsed = false;
    const result = new Promise<string>((resolve, fail) => {
        accept = resolve;
        reject = fail;
    });
    void result.catch(() => {});
    const server = createServer((incoming, outgoing) => {
        const address = server.address();
        const host = address && typeof address !== "string" ? `127.0.0.1:${address.port}` : "";
        const requestPath = incoming.url ?? "/";
        const callback =
            requestPath.startsWith("/") && URL.canParse(requestPath, "http://localhost")
                ? new URL(requestPath, "http://localhost")
                : null;
        if (
            incoming.method !== "GET" ||
            incoming.headers.host !== host ||
            callback?.pathname !== callbackPath ||
            callbackUsed
        ) {
            outgoing.writeHead(404).end();
            return;
        }
        const codes = callback.searchParams.getAll("code");
        const code = codes.length === 1 && codes[0].length <= 2048 ? codes[0] : null;
        callbackUsed = true;
        outgoing
            .writeHead(code ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
            .end(
                code ? "Return to KronOS to finish signing in." : "Sign-in did not complete. Return to KronOS to retry."
            );
        if (code) accept(code);
        else reject(new Error("The provider did not complete sign-in."));
    });
    server.requestTimeout = 10000;
    server.keepAliveTimeout = 1000;
    const cancel = () => reject(new Error("Sign-in was cancelled or timed out."));
    controller.signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
        await new Promise<void>((resolve, fail) => {
            server.once("error", fail);
            server.listen(0, "127.0.0.1", resolve);
        });
        controller.signal.throwIfAborted();
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Could not open the sign-in callback.");
        const authorization = new URL(configuration.origin + "/auth/v1/authorize");
        authorization.search = new URLSearchParams({
            provider,
            redirect_to: `http://127.0.0.1:${address.port}${callbackPath}`,
            code_challenge: challenge,
            code_challenge_method: "s256",
        }).toString();
        await shell.openExternal(authorization.href);
        const auth_code = await result;
        const session = await request<TokenResponse>("token?grant_type=pkce", { auth_code, code_verifier: verifier });
        controller.signal.throwIfAborted();
        await saveSession(session);
    } finally {
        clearTimeout(timer);
        server.close();
        if (pendingOAuth === controller) pendingOAuth = undefined;
    }
}

function accountStatus(): AccountStatus {
    const metadata = tokens?.user.user_metadata ?? {};
    const displayName = metadata.full_name ?? metadata.name ?? metadata.user_name;
    const photo = metadata.avatar_url ?? metadata.picture;
    let avatarURL: string;
    if (typeof photo === "string" && URL.canParse(photo)) {
        const url = new URL(photo);
        if (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            (url.hostname === "avatars.githubusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))
        )
            avatarURL = url.href;
    }
    return {
        configured: Boolean(authConfiguration()),
        account: tokens
            ? {
                  email: tokens.user.email ?? "",
                  ...(typeof displayName === "string" && displayName.trim() ? { name: displayName.slice(0, 160) } : {}),
                  ...(avatarURL ? { avatarURL } : {}),
              }
            : null,
    };
}

export function cancelKronosSignIn() {
    signInGeneration++;
    pendingOAuth?.abort();
    pendingEmail = undefined;
}

export async function kronosAccount(command: AccountCommand): Promise<AccountStatus> {
    if (command?.action === "cancel") {
        cancelKronosSignIn();
        return accountStatus();
    }
    const generation = signInGeneration;
    await restoreSession();
    if (generation !== signInGeneration) return accountStatus();
    switch (command?.action) {
        case "status":
            return accountStatus();
        case "provider":
            if (command.provider !== "google" && command.provider !== "github") throw new Error("Unknown provider.");
            await signInWithProvider(command.provider);
            break;
        case "send-code": {
            const email = typeof command.email === "string" ? command.email.trim().toLowerCase() : "";
            if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                throw new Error("Enter a valid email address.");
            await request("otp", { email });
            if (generation === signInGeneration) pendingEmail = email;
            break;
        }
        case "verify-code": {
            if (!pendingEmail || typeof command.code !== "string" || !/^\d{6,10}$/.test(command.code)) {
                throw new Error("Enter the code sent to your email address.");
            }
            const session = await request<TokenResponse>("verify", {
                email: pendingEmail,
                token: command.code,
                type: "email",
            });
            if (generation !== signInGeneration) return accountStatus();
            await saveSession(session);
            pendingEmail = undefined;
            break;
        }
        case "sign-out": {
            const access = tokens?.access_token;
            await rm(sessionPath(), { force: true });
            tokens = undefined;
            if (access) await request("logout?scope=local", {}, access).catch(() => {});
            break;
        }
        default:
            throw new Error("Invalid account action.");
    }
    return accountStatus();
}
