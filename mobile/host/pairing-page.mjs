import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

export function pairingHostAddress(port, interfaces = networkInterfaces()) {
  const addresses = Object.values(interfaces)
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal);
  const preferred = addresses.find((entry) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address));
  return `http://${preferred?.address ?? "127.0.0.1"}:${port}`;
}

export async function renderPairingPage({ baseUrl, code, expiresAt }) {
  const link = new URL("kronterm://pair");
  link.searchParams.set("host", baseUrl);
  link.searchParams.set("expires", String(expiresAt));
  const svg = await QRCode.toString(link.href, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
    );
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Pair KronTerm iPhone</title><style>body{margin:0;font:16px system-ui;background:#f5f5f7;color:#17171b;display:grid;place-items:center;min-height:100vh}main{max-width:360px;padding:28px;background:white;border-radius:20px;text-align:center}svg{width:240px;height:240px}strong{display:block;font:32px ui-monospace;letter-spacing:8px;margin:20px}p{line-height:1.6;font-size:14px}a{color:#17171b}</style>
    <main><h1>Connect your iPhone</h1><p>Scan with the iPhone camera, then enter this Mac's pairing code in KronTerm.</p>${svg}
    <strong>${escape(code)}</strong><p>Code expires ${escape(new Date(expiresAt).toLocaleTimeString())}.</p>
    <p>Same local network required. Your phone keeps its own local workspace.</p><a href="${escape(link.href)}">Open pairing link</a>
    <p>${escape(baseUrl)}</p></main></html>`;
}
