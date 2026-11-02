import assert from "node:assert/strict";
import test from "node:test";
import { startFixture } from "./fixture.mjs";

test("browser evidence requires an interaction result and explicit desktop isolation result", async () => {
    const proofs = [];
    const server = await startFixture((proof) => proofs.push(proof), 0);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const invalid = await fetch(`${origin}/proof`, { method: "POST", body: JSON.stringify({ interaction: true }) });
        assert.equal(invalid.status, 400);
        assert.equal(proofs.length, 0);
        const valid = await fetch(`${origin}/proof`, {
            method: "POST",
            body: JSON.stringify({ interaction: true, desktopDenied: true }),
        });
        assert.equal(valid.status, 200);
        assert.deepEqual(proofs, [{ interaction: true, desktopDenied: true }]);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
