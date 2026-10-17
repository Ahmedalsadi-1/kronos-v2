import { chromium } from "playwright-core";
import fs from "fs";
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const [mode, ...rest] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", e => console.error("PAGEERR", e.message));
await page.goto("file://" + process.cwd() + "/index.html");
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
if (mode === "stills") {
  fs.mkdirSync("stills", { recursive: true });
  for (const t of rest) { await page.evaluate(t => render(+t), t); await page.screenshot({ path: `stills/t${t}.jpg`, type: "jpeg", quality: 80 }); }
} else {
  fs.mkdirSync("frames", { recursive: true });
  const N = Math.round(22 * 30);
  for (let f = 0; f < N; f++) { await page.evaluate(t => render(t), f / 30); await page.screenshot({ path: `frames/f${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 93 }); }
}
await browser.close();
