import assert from "node:assert/strict";
import { test } from "node:test";
import { pairingHostAddress, renderPairingPage } from "./pairing-page.mjs";
test("selects a private LAN address and embeds a QR plus manual Mac code", async () => {
  assert.equal(
    pairingHostAddress(4119, { en0: [{ family: "IPv4", address: "192.168.1.8", internal: false }] }),
    "http://192.168.1.8:4119"
  );
  const page = await renderPairingPage({
    baseUrl: "http://192.168.1.8:4119",
    code: "123456",
    expiresAt: Date.now() + 60_000,
  });
  assert.match(page, /<svg/);
  assert.match(page, /123456/);
  assert.match(page, /kronterm:\/\/pair\?host=/);
  assert.doesNotMatch(page, /code=123456|token=/);
});
