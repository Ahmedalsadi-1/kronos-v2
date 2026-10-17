import { expect, it } from "vitest";
import { parsePairingLink } from "./pairing-link";
const now = 1_000_000;
const link = (host: string, expires = now + 60_000) =>
    `kronterm://pair?host=${encodeURIComponent(host)}&expires=${expires}`;
it("accepts a fresh LAN QR without connecting automatically", () => {
    expect(parsePairingLink(link("http://192.168.1.10:4119"), now)?.baseUrl).toBe("http://192.168.1.10:4119");
});
it("rejects expiry, credentials, URL paths, and misleading public hostnames", () => {
    for (const host of [
        "http://10.evil.com",
        "http://example.com",
        "http://localhost:4119",
        "file:///tmp/x",
        "http://user:secret@192.168.1.1",
        "http://192.168.1.1/path",
    ]) {
        expect(parsePairingLink(link(host), now)).toBeNull();
    }
    expect(parsePairingLink(link("http://192.168.1.1", now - 1), now)).toBeNull();
    expect(parsePairingLink(link("http://192.168.1.1", now + 16 * 60_000), now)).toBeNull();
});
