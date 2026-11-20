import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";

const output = new URL("../dist/", import.meta.url);
const index = new URL("index.html", output);
const routes = [
  "capabilities",
  "capabilities/workspace-canvas",
  "capabilities/kronoscode",
  "capabilities/terminal",
  "capabilities/browser-automation",
  "capabilities/sandbox-vms",
  "capabilities/desktop-control",
  "capabilities/remote-sessions",
  "capabilities/acp-agents",
  "capabilities/voice",
  "docs",
  "blog",
  "blog/workspace-is-the-context",
  "blog/browser-automation-should-leave-evidence",
  "blog/give-risky-work-a-room-of-its-own",
  "security",
  "pricing",
  "download",
  "contact-sales",
  "product",
  "kronoscode",
  "terminal",
];

await Promise.all(
  routes.map(async (route) => {
    const directory = new URL(`${route}/`, output);
    await mkdir(directory, { recursive: true });
    await copyFile(index, new URL("index.html", directory));
  })
);
await copyFile(index, new URL("404.html", output));
await writeFile(new URL(".nojekyll", output), "");
