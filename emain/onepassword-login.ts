// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { loginOrigin } from "./login-preferences";

export type VaultLogin = { id: string; vaultId: string; title: string };
export type LoginCredentials = { username: string; password: string };

function itemMatches(item: any, origin: string): boolean {
    return (
        item?.category === "LOGIN" &&
        Array.isArray(item.urls) &&
        item.urls.some((entry: any) => {
            try {
                return new URL(entry.href).origin === origin;
            } catch {
                return false;
            }
        })
    );
}

export class OnePasswordLogin {
    private binary(): string {
        // Other products also ship an `op` binary; never resolve this credential tool through PATH.
        const binary = [
            "/opt/homebrew/bin/op",
            "/usr/local/bin/op",
            "/Applications/1Password CLI.app/Contents/MacOS/op",
        ].find(existsSync);
        if (!binary)
            throw new Error(
                "Install 1Password CLI and enable its desktop app integration to use 1Password. You can sign in manually now."
            );
        return binary;
    }
    available(): boolean {
        try {
            this.binary();
            return true;
        } catch {
            return false;
        }
    }
    private run(args: string[]): Promise<string> {
        const binary = this.binary();
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("OP_")));
        env.OP_BIOMETRIC_UNLOCK_ENABLED = "true";
        return new Promise((resolve, reject) => {
            execFile(binary, args, { env, timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
                if (error)
                    reject(
                        new Error(
                            "1Password did not authorize this request. Unlock its desktop app and enable CLI integration, then try again."
                        )
                    );
                else resolve(stdout);
            });
        });
    }
    async list(origin: string): Promise<VaultLogin[]> {
        origin = loginOrigin(origin);
        try {
            const items = JSON.parse(await this.run(["item", "list", "--categories", "Login", "--format", "json"]));
            if (!Array.isArray(items)) throw new Error();
            return items
                .filter((item) => itemMatches(item, origin))
                .slice(0, 100)
                .map((item) => ({
                    id: String(item.id),
                    vaultId: String(item.vault?.id),
                    title: String(item.title).slice(0, 160),
                }));
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("1Password did not")) throw error;
            throw new Error("Could not read matching 1Password login items.");
        }
    }
    async credentials(origin: string, item: VaultLogin): Promise<LoginCredentials> {
        origin = loginOrigin(origin);
        if (![item.id, item.vaultId].every((id) => /^[a-z0-9]{26}$/i.test(id)))
            throw new Error("Invalid 1Password item reference.");
        let value: any;
        try {
            value = JSON.parse(await this.run(["item", "get", item.id, "--vault", item.vaultId, "--format", "json"]));
        } catch {
            throw new Error("1Password could not unlock this login item.");
        }
        if (!itemMatches(value, origin) || value.id !== item.id || value.vault?.id !== item.vaultId)
            throw new Error("The 1Password login does not match this exact website.");
        const field = (purpose: string, id: string) =>
            value.fields?.find((entry: any) => entry.purpose === purpose || entry.id === id)?.value;
        const username = field("USERNAME", "username");
        const password = field("PASSWORD", "password");
        if (typeof username !== "string" || typeof password !== "string" || !password || password.length > 8192)
            throw new Error("This item needs manual sign-in; a username/password login was not found.");
        return { username, password };
    }
}
