// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import {
    SandboxLoginProviders,
    type SandboxLoginState,
    type SandboxLoginUiCommand,
    type SandboxLoginUiResult,
} from "../frontend/types/sandbox-login";
import { holdComputerInteraction, sameComputerChat, sandboxComputerForTab } from "./computer-access-policy";
import type { PrivateBrowserResult } from "./guest-login";
import { getLinuxDesktopsRuntime, type LinuxDesktopFleetRuntime } from "./linux-desktops-runtime";
import { loginOrigin } from "./login-preferences";
import { getLoginPreferences } from "./login-preferences-store";
import { OnePasswordLogin, type VaultLogin } from "./onepassword-login";

type Request = SandboxLoginState & {
    tabId: string;
    sessionId: string;
    generation: number;
    expires: number;
    credential?: { itemId: string; vaultId: string };
    items?: VaultLogin[];
    nextInspection?: number;
};

export class SandboxLoginBroker {
    private requests = new Map<string, Request>();
    private starting = new Set<string>();
    constructor(
        private fleet: LinuxDesktopFleetRuntime = getLinuxDesktopsRuntime(),
        private preferences = getLoginPreferences(),
        private vault = new OnePasswordLogin()
    ) {}
    private desktop(id: string) {
        return this.fleet.desktop
            ? this.fleet.desktop(id)
            : this.fleet.list().then((items) => items.find((item) => item.id === id));
    }

    private public(request: Request): SandboxLoginState {
        const {
            id,
            origin,
            computerId,
            computerName,
            phase,
            account,
            policy,
            providers,
            registration,
            signUpAvailable,
            passwordVisible,
            error,
            memoryNotice,
            reusedSession,
        } = request;
        return {
            id,
            origin,
            computerId,
            computerName,
            phase,
            account,
            policy,
            providers,
            registration,
            signUpAvailable,
            passwordVisible,
            error,
            memoryNotice,
            reusedSession,
            onePasswordAvailable: this.vault.available(),
        };
    }
    private active(request: Request): boolean {
        return !["complete", "cancelled", "unverified"].includes(request.phase) && request.expires > Date.now();
    }
    blocksComputer(computerId: string): boolean {
        return [...this.requests.values()].some((request) => request.computerId === computerId && this.active(request));
    }
    blocksTab(tabId: string): boolean {
        return [...this.requests.values()].some((request) => request.tabId === tabId && this.active(request));
    }
    async request(tabId: string, sessionId: string, origin: string, account?: string): Promise<SandboxLoginState> {
        const computerId = sandboxComputerForTab(tabId, sessionId);
        if (this.starting.has(computerId))
            throw new Error("A sign-in request is starting. Check login status before retrying.");
        this.starting.add(computerId);
        try {
            return await this.create(tabId, sessionId, origin, account);
        } finally {
            this.starting.delete(computerId);
        }
    }
    private async create(
        tabId: string,
        sessionId: string,
        origin: string,
        account?: string
    ): Promise<SandboxLoginState> {
        origin = loginOrigin(origin);
        if (!tabId || !sessionId) throw new Error("Open this chat in KronOS before requesting sign-in.");
        const computerId = sandboxComputerForTab(tabId, sessionId);
        if (!computerId) throw new Error("Select a sandbox computer first.");
        const existing = [...this.requests.values()].find(
            (item) => item.computerId === computerId && this.active(item)
        );
        if (existing) {
            if (existing.tabId !== tabId || !sameComputerChat(existing.sessionId, sessionId))
                throw new Error("Another chat has a sign-in request on this computer.");
            if (existing.origin !== origin)
                throw new Error("Finish or cancel the current sign-in before changing websites.");
            return this.public(existing);
        }
        const desktop = await this.desktop(computerId);
        if (!desktop?.ready) throw new Error("Start the selected computer before signing in.");
        if (
            (desktop.controlOwner === "agent" || desktop.assignedAgentId?.startsWith("sandbox:")) &&
            desktop.assignedAgentId !== `sandbox:${tabId}`
        )
            throw new Error("The selected computer belongs to another workspace.");
        let page: PrivateBrowserResult;
        try {
            page = await this.fleet.privateBrowser(computerId, desktop.controlGeneration, {
                origin,
                action: "inspect",
                ...(desktop.controlOwner === "agent" ? { agentId: desktop.assignedAgentId } : {}),
            });
        } catch {
            // A missing or ambiguous tab is not evidence of either a login gate or an authenticated session.
        }
        let saved: ReturnType<typeof this.preferences.list>[number];
        if (page?.status === "required") {
            try {
                const remembered = this.preferences
                    .list(computerId, origin)
                    .filter((item) => !account || item.account === account);
                if (remembered.length === 1) saved = remembered[0];
            } catch {
                // No unreadable policy may authorize automatic credential submission.
            }
        }
        const request: Request = {
            id: randomUUID(),
            origin,
            computerId,
            computerName: desktop.name,
            tabId,
            sessionId,
            generation: desktop.controlGeneration,
            expires: Date.now() + 15 * 60_000,
            phase:
                page?.status === "required" ? "choose" : page?.status === "authenticated" ? "complete" : "unverified",
            account: saved?.account || account || "",
            policy: saved?.policy || "ask",
            passwordVisible: page?.passwordVisible,
            providers: page?.providers,
            registration: page?.registration,
            signUpAvailable: page?.signUpAvailable,
            reusedSession: page?.status === "authenticated" || undefined,
            error: !page ? "Open one tab for this website in the VM and check its sign-in state again." : undefined,
            onePasswordAvailable: this.vault.available(),
        };
        if (sandboxComputerForTab(tabId, sessionId) !== computerId)
            throw new Error("The selected computer changed. Request sign-in again.");
        if (request.phase === "choose" && desktop.controlOwner === "agent") {
            const released = await this.fleet.takeover(computerId, {
                agentId: desktop.assignedAgentId,
                generation: desktop.controlGeneration,
            });
            request.generation = released.controlGeneration;
        }
        this.requests.set(request.id, request);
        for (const [id, item] of this.requests) if (item.expires < Date.now()) this.requests.delete(id);
        if (request.phase !== "choose") return this.public(request);
        request.nextInspection = Date.now() + 3000;
        holdComputerInteraction(computerId, request.expires);
        if (
            saved?.policy === "automatic" &&
            saved.credential &&
            page.passwordVisible &&
            desktop.controlOwner === "agent"
        ) {
            try {
                request.phase = "submitting";
                const credentials = await this.vault.credentials(origin, {
                    id: saved.credential.itemId,
                    vaultId: saved.credential.vaultId,
                    title: saved.account,
                });
                const result = await this.fleet.privateBrowser(computerId, request.generation, {
                    origin,
                    action: "fill",
                    ...credentials,
                });
                credentials.password = "";
                if (result.phase === "submitted" && result.status === "authenticated")
                    await this.finish(request, false);
                else request.phase = "review";
            } catch {
                request.phase = "choose";
                request.error = "Automatic sign-in could not finish. Complete sign-in in the VM.";
            }
        }
        return this.public(request);
    }
    status(tabId: string, sessionId: string, requestId: string): SandboxLoginState {
        return this.public(this.owned(tabId, [sessionId], requestId));
    }
    private owned(tabId: string, sessionIds: string[], requestId: string): Request {
        const request = this.requests.get(requestId);
        if (!request || request.tabId !== tabId || !sessionIds.some((id) => sameComputerChat(id, request.sessionId)))
            throw new Error("This login request belongs to another chat.");
        if (request.expires <= Date.now())
            throw new Error("This login request expired. Ask the agent to request sign-in again.");
        if (sandboxComputerForTab(tabId, request.sessionId) !== request.computerId)
            throw new Error("The selected computer changed. Request sign-in again.");
        return request;
    }
    async ui(tabId: string, command: SandboxLoginUiCommand): Promise<SandboxLoginUiResult> {
        if (
            !Array.isArray(command?.sessionIds) ||
            command.sessionIds.length > 4 ||
            command.sessionIds.some((id) => typeof id !== "string" || id.length > 256)
        )
            throw new Error("Invalid chat identity.");
        if (command.action === "poll") {
            const request = [...this.requests.values()]
                .reverse()
                .find(
                    (item) =>
                        item.tabId === tabId &&
                        command.sessionIds.some((id) => sameComputerChat(id, item.sessionId)) &&
                        item.expires > Date.now() &&
                        this.active(item)
                );
            if (request?.phase === "choose" && Date.now() >= request.nextInspection) {
                request.nextInspection = Infinity;
                void this.refreshOptions(request);
            }
            return { request: request ? this.public(request) : undefined };
        }
        const request = this.owned(tabId, command.sessionIds, command.requestId);
        if (!this.active(request)) throw new Error("This login request has already finished.");
        if (request.phase === "submitting") throw new Error("Sign-in is already in progress.");
        if (command.action === "cancel") {
            request.phase = "cancelled";
            holdComputerInteraction(request.computerId);
            return { request: this.public(request) };
        }
        if (command.action === "provider" || command.action === "signup") {
            const provider = SandboxLoginProviders.find((value) => value === command.provider);
            const signup = command.action === "signup";
            if (signup ? !request.signUpAvailable : !provider || !request.providers?.includes(provider))
                throw new Error("That sign-in option is no longer available.");
            request.phase = "submitting";
            request.error = undefined;
            request.credential = undefined;
            try {
                await this.fleet.privateBrowser(request.computerId, request.generation, {
                    origin: request.origin,
                    ...(signup ? { action: "signup" } : { action: "provider", provider }),
                });
                request.phase = "review";
            } catch {
                request.phase = "choose";
                throw new Error("That sign-in option could not open. Try again or continue in the VM browser.");
            }
            return { request: this.public(request) };
        }
        if (command.action === "accounts") {
            const items = await this.vault.list(request.origin);
            request.items = items;
            return { request: this.public(request), accounts: items };
        }
        if (command.action === "complete") {
            const previousPhase = request.phase;
            request.phase = "submitting";
            try {
                const page = await this.fleet.privateBrowser(request.computerId, request.generation, {
                    origin: request.origin,
                    action: "inspect",
                });
                if (page.status === "required")
                    throw new Error(
                        "The website still shows a sign-in or verification step. Finish it in the VM first."
                    );
                request.account = String(command.account || request.account).trim();
                const remember = command.remember === true;
                if (remember && (!request.account || request.account.length > 160))
                    throw new Error("Enter an account label to remember this login.");
                request.policy = command.policy === "automatic" ? "automatic" : "ask";
                await this.finish(request, remember);
                return { request: this.public(request) };
            } catch (error) {
                request.phase = previousPhase;
                throw error;
            }
        }
        if (command.action !== "submit") throw new Error("Unknown login action.");
        request.phase = "submitting";
        request.error = "";
        request.credential = undefined;
        try {
            let credentials;
            if (command.provider === "1password") {
                const item = request.items?.find(
                    (item) => item.id === command.itemId && item.vaultId === command.vaultId
                );
                if (!item) throw new Error("Choose a matching 1Password account first.");
                credentials = await this.vault.credentials(request.origin, item);
                request.credential = { itemId: item.id, vaultId: item.vaultId };
                request.account = item.title;
            } else if (command.provider === "manual") {
                if (
                    typeof command.username !== "string" ||
                    typeof command.password !== "string" ||
                    !command.password ||
                    command.password.length > 8192 ||
                    command.username.length > 320
                )
                    throw new Error("Enter a username and password, or sign in directly in the VM.");
                credentials = { username: command.username, password: command.password };
                request.account = command.username;
            } else throw new Error("Choose a login method.");
            const result = await this.fleet.privateBrowser(request.computerId, request.generation, {
                origin: request.origin,
                action: "fill",
                ...credentials,
            });
            credentials.password = "";
            request.phase = "review";
            if (result.phase !== "submitted" || result.status === "required")
                request.error = "Finish the website's sign-in or MFA in the VM, then return control below.";
            return { request: this.public(request) };
        } catch {
            request.phase = "choose";
            request.error =
                "Sign-in did not finish. Check the website and 1Password, or sign in directly in the VM. Credentials were not saved.";
            return { request: this.public(request) };
        }
    }
    private async refreshOptions(request: Request): Promise<void> {
        try {
            const page = await this.fleet.privateBrowser(request.computerId, request.generation, {
                origin: request.origin,
                action: "inspect",
            });
            if (request.phase !== "choose") return;
            request.providers = page.providers;
            request.registration = page.registration;
            request.signUpAvailable = page.signUpAvailable;
            request.passwordVisible = page.passwordVisible;
        } catch {
            // Provider redirects may briefly leave the original origin.
        } finally {
            request.nextInspection = Date.now() + 3000;
        }
    }
    private async finish(request: Request, remember: boolean): Promise<void> {
        const desktop = await this.desktop(request.computerId);
        if (!desktop || desktop.controlOwner !== "user" || desktop.controlGeneration !== request.generation)
            throw new Error("Computer control changed during sign-in. Request sign-in again.");
        if (sandboxComputerForTab(request.tabId, request.sessionId) !== request.computerId)
            throw new Error("Selected computer changed.");
        if (remember) {
            try {
                this.preferences.remember(
                    {
                        origin: request.origin,
                        account: request.account,
                        computerId: request.computerId,
                        policy: request.policy,
                        credential: request.credential,
                    },
                    true
                );
            } catch {
                request.memoryNotice = "This account could not be remembered. Your browser session is still available.";
            }
        }
        await this.fleet.assign(request.computerId, `sandbox:${request.tabId}`, request.generation);
        request.phase = "complete";
        holdComputerInteraction(request.computerId);
    }
}

let broker: SandboxLoginBroker;
export function getSandboxLoginBroker(): SandboxLoginBroker {
    return (broker ??= new SandboxLoginBroker());
}
