// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

const { createRequire } = require("node:module");
const path = require("node:path");
const { installManagedSession } = require("./managed-session.cjs");

module.exports = {
    n8n: {
        ready: [
            async function (server) {
                if (process.env.N8N_LISTEN_ADDRESS !== "127.0.0.1")
                    throw new Error("Managed workflow sessions require a loopback-only runtime.");
                const bin = process.env.KRONTERM_N8N_BIN;
                const runtimeRequire = createRequire(bin);
                const dist = path.resolve(path.dirname(bin), "../dist");
                const { Container } = runtimeRequire("@n8n/di");
                const { OwnershipService } = runtimeRequire(path.join(dist, "services/ownership.service.js"));
                const { AuthService } = runtimeRequire(path.join(dist, "auth/auth.service.js"));
                installManagedSession(server, {
                    token: process.env.KRONTERM_N8N_SESSION_TOKEN,
                    ownership: Container.get(OwnershipService),
                    auth: Container.get(AuthService),
                });
            },
        ],
    },
};
