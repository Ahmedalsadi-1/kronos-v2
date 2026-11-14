// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type LoginPreference = {
    origin: string;
    account: string;
    computerId: string;
    policy: "ask" | "automatic";
    credential?: { itemId: string; vaultId: string };
};

export function loginOrigin(value: string): string {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/")
        throw new Error("Use an HTTPS website origin without credentials, paths, queries or fragments.");
    return url.origin;
}

export class LoginPreferences {
    constructor(
        private file: string,
        private codec?: { encode: (value: string) => string; decode: (value: string) => string }
    ) {}

    private read(): LoginPreference[] {
        if (!existsSync(this.file)) return [];
        const raw = readFileSync(this.file, "utf8");
        const rows = JSON.parse(this.codec ? this.codec.decode(raw) : raw);
        if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid login preference store.");
        for (const row of rows) {
            if (
                !row ||
                loginOrigin(row.origin) !== row.origin ||
                typeof row.account !== "string" ||
                !row.account.trim() ||
                row.account.length > 160 ||
                typeof row.computerId !== "string" ||
                !row.computerId ||
                !["ask", "automatic"].includes(row.policy)
            )
                throw new Error("Invalid login preference record.");
            if (
                row.credential &&
                ![row.credential.itemId, row.credential.vaultId].every(
                    (id) => typeof id === "string" && /^[a-z0-9]{26}$/i.test(id)
                )
            )
                throw new Error("Invalid credential reference.");
        }
        return rows;
    }

    list(computerId: string, origin?: string): LoginPreference[] {
        const normalized = origin ? loginOrigin(origin) : undefined;
        return this.read().filter((row) => row.computerId === computerId && (!normalized || row.origin === normalized));
    }

    remember(preference: LoginPreference, recoverUnreadable = false): LoginPreference {
        const origin = loginOrigin(preference.origin);
        const account = preference.account?.trim();
        if (
            !account ||
            account.length > 160 ||
            !preference.computerId ||
            !["ask", "automatic"].includes(preference.policy)
        )
            throw new Error("Invalid login preference.");
        // Only these fields may reach disk; tool arguments must never persist secret values.
        const saved: LoginPreference = {
            origin,
            account,
            computerId: preference.computerId,
            policy: preference.policy,
        };
        if (preference.credential) {
            const { itemId, vaultId } = preference.credential;
            if (![itemId, vaultId].every((id) => typeof id === "string" && /^[a-z0-9]{26}$/i.test(id)))
                throw new Error("Invalid credential reference.");
            saved.credential = { itemId, vaultId };
        }
        let existing: LoginPreference[];
        let backup = false;
        try {
            existing = this.read();
        } catch (error) {
            if (!recoverUnreadable || !this.codec) throw error;
            existing = [];
            backup = true;
        }
        const rows = existing.filter(
            (row) => row.origin !== origin || row.account !== account || row.computerId !== saved.computerId
        );
        if (rows.length >= 1000) throw new Error("Login preference limit reached.");
        this.write([...rows, saved], backup);
        return saved;
    }

    forget(computerId: string, origin: string, account: string): void {
        const normalized = loginOrigin(origin);
        this.write(
            this.read().filter(
                (row) => row.computerId !== computerId || row.origin !== normalized || row.account !== account
            )
        );
    }

    private write(rows: LoginPreference[], backup = false): void {
        mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.tmp`;
        const value = JSON.stringify(rows);
        const encoded = this.codec ? this.codec.encode(value) : value;
        // A new, explicitly chosen policy can replace an unreadable store; keep the original ciphertext.
        if (backup) copyFileSync(this.file, `${this.file}.backup-${randomUUID()}`, constants.COPYFILE_EXCL);
        writeFileSync(temporary, encoded, { mode: 0o600 });
        renameSync(temporary, this.file);
    }
}
