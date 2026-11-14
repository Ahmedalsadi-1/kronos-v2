// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

const { randomBytes, timingSafeEqual } = require("node:crypto");

function installManagedSession(server, { token, ownership, auth }) {
    if (!/^[a-f0-9]{64}$/.test(token || "")) throw new Error("Invalid managed workflow session capability.");
    const expected = Buffer.from(`Bearer ${token}`);
    let pendingOwner;
    const owner = () => {
        pendingOwner ??= (async () => {
            if (await ownership.hasInstanceOwner()) return ownership.getInstanceOwner();
            return ownership.setupOwner({
                email: "hermes@kronterm.invalid",
                firstName: "Hermes",
                lastName: "Workspace",
                password: `Aa1!${randomBytes(32).toString("hex")}`,
            });
        })().finally(() => {
            pendingOwner = undefined;
        });
        return pendingOwner;
    };
    server.app.post(`/${server.restEndpoint}/kronterm/session`, async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        const provided = Buffer.from(String(req.headers.authorization || ""));
        if (
            !["127.0.0.1", "::ffff:127.0.0.1", "::1"].includes(req.socket.remoteAddress) ||
            req.headers.origin ||
            provided.length !== expected.length ||
            !timingSafeEqual(provided, expected)
        ) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const browserId = req.headers["browser-id"];
        if (typeof browserId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(browserId)) {
            res.status(400).json({ message: "A managed browser identity is required." });
            return;
        }
        try {
            // Keep existing owner IDs, projects, credentials, and MFA requirements during migration.
            const user = await owner();
            if (user.mfaEnabled) {
                res.status(403).json({ message: "The local workflow owner requires MFA." });
                return;
            }
            auth.issueCookie(res, user, false, browserId);
            res.json({ data: { connected: true } });
        } catch {
            res.status(503).json({ message: "The managed workflow session is unavailable." });
        }
    });
}

module.exports = { installManagedSession };
