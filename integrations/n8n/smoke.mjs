import { inspectOriginalComponents } from "./component-fixture.mjs";
import { verifyNativeOSWorkflow } from "./native-os-smoke.mjs";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { writeN8nWidgetNodes } from "../../emain/n8n-widget-nodes.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const data = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-n8n-smoke-"));
const extensions = path.join(data, "extensions");
writeN8nWidgetNodes(extensions, path.join(extensions, "bridge.js"), { smoke: { label: "Smoke widget" } });
for (const filename of fs.readdirSync(path.join(root, "nodes"))) {
  if (filename.endsWith(".node.js") || filename === "bridge.js")
    fs.copyFileSync(path.join(root, "nodes", filename), path.join(extensions, filename));
}
const bin = path.join(root, "upstream/packages/cli/bin/n8n");
const token = randomBytes(24).toString("hex");
const sessionToken = randomBytes(32).toString("hex");
const browserId = "component-fixture";
const calls = [];
const bridge = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString());
  calls.push(payload);
  const image = { filename: "smoke.png", subfolder: "", type: "output" };
  const render = payload.name === "comfyui_submit"
    ? { id: "smoke-prompt", status: "queued", images: [] }
    : payload.name === "comfyui_job"
      ? { id: "smoke-prompt", status: "completed", images: [image] }
      : undefined;
  const text = render ? JSON.stringify({ origin: "http://127.0.0.1:8190", jobs: [render] }) : "smoke-ok";
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ content: [{ type: "text", text }] }));
});
const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const bridgePort = await listen(bridge);
const port = await freePort();
const brokerPort = await freePort();
const url = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  N8N_USER_FOLDER: data,
  N8N_LISTEN_ADDRESS: "127.0.0.1",
  N8N_HOST: "127.0.0.1",
  N8N_PORT: String(port),
  N8N_RUNNERS_BROKER_PORT: String(brokerPort),
  N8N_RUNNERS_MODE: "internal",
  N8N_CUSTOM_EXTENSIONS: extensions,
  N8N_SECURE_COOKIE: "false",
  N8N_CANVAS_ONLY: "true",
  N8N_TEMPLATES_ENABLED: "false",
  N8N_DIAGNOSTICS_ENABLED: "false",
  N8N_PERSONALIZATION_ENABLED: "false",
  EXTERNAL_HOOK_FILES: path.join(root, "session-hook.cjs"),
  EXTERNAL_HOOK_FILES_SEPARATOR: path.delimiter,
  KRONTERM_N8N_BIN: bin,
  KRONTERM_N8N_SESSION_TOKEN: sessionToken,
  KRONTERM_N8N_TOOL_URL: `http://127.0.0.1:${bridgePort}/native`,
  KRONTERM_N8N_TOOL_TOKEN: token,
};
let server;
function launch(args, logName) {
  const log = fs.openSync(path.join(data, logName), "w");
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: path.join(root, "upstream/packages/cli"),
    env,
    stdio: ["ignore", log, log],
    detached: process.platform !== "win32",
  });
  fs.closeSync(log);
  return child;
}
async function stop(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const kill = (signal) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {
      return;
    }
  };
  kill("SIGTERM");
  const timer = setTimeout(() => kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}
async function command(args, log) {
  const child = launch(args, log);
  const timer = setTimeout(() => {
    void stop(child);
  }, 90000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    assert.equal(code, 0, `n8n command failed; see ${path.join(data, log)}`);
  } finally {
    clearTimeout(timer);
  }
}
try {
  server = launch(["start"], "server.log");
  let ready = false;
  for (let attempt = 0; attempt < 180; attempt++) {
    assert.equal(server.exitCode, null, `n8n exited; see ${data}/server.log`);
    try {
      ready = (await fetch(`${url}/healthz/readiness`, { signal: AbortSignal.timeout(500) })).ok;
    } catch {
      ready = false;
    }
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, `n8n did not become ready; see ${data}/server.log`);
  const html = await (await fetch(url)).text();
  assert.match(html, /<html/i);
  const sessionUrl = `${url}/rest/kronterm/session`;
  assert.equal((await fetch(sessionUrl, { method: "POST" })).status, 401);
  assert.equal((await fetch(sessionUrl, {
    method: "POST", headers: { authorization: `Bearer ${"b".repeat(64)}`, "browser-id": browserId },
  })).status, 401);
  const setup = await fetch(sessionUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}`, "browser-id": browserId },
  });
  assert.equal(setup.status, 200, `Managed session failed: ${await setup.text()}`);
  const cookie = setup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const authenticated = { cookie, "browser-id": browserId };
  assert.equal((await fetch(`${url}/rest/workflows`, { headers: { cookie, "browser-id": "wrong-browser" } })).status, 401);
  assert.equal((await fetch(`${url}/rest/workflows`, { headers: authenticated })).status, 200);
  const renewed = await fetch(sessionUrl, {
    method: "POST", headers: { authorization: `Bearer ${sessionToken}`, "browser-id": browserId },
  });
  assert.equal(renewed.status, 200);
  console.log("Managed Hermes workflow access: no account form, capability guard and browser binding verified.");
  let nodes;
  for (let attempt = 0; attempt < 60; attempt++) {
    const types = await fetch(`${url}/types/nodes.json`, { headers: { cookie, "browser-id": browserId } });
    assert.equal(types.status, 200);
    try {
      nodes = await types.json();
    } catch {
      nodes = undefined;
    }
    if (Array.isArray(nodes) && nodes.some((node) => node.name === "CUSTOM.kronTermTool")) break;
    await delay(500);
  }
  assert.ok(Array.isArray(nodes), "The n8n node catalog did not finish writing.");
  for (const name of ["CUSTOM.kronTermTool", "CUSTOM.kronTermHarness", "CUSTOM.kronTermWidget", "CUSTOM.hermesAgent", "CUSTOM.comfyUiWorkflow"]) {
    assert.ok(
      nodes.some((node) => node.name === name),
      `Missing custom node ${name}`
    );
  }
  const widgetNode = nodes.find(
    (node) => /^CUSTOM\.kronTermWidget[0-9a-f]{12}$/.test(node.name) && node.defaults?.name === "Smoke widget"
  );
  assert.ok(widgetNode, "Generated widget node missing");
  console.log(`n8n editor and backend ready; ${nodes.length} node types, including KronOS ComfyUI.`);
  const nativeWorkflowId = await verifyNativeOSWorkflow(url, cookie, nodes);
  if (process.argv.includes("--components")) await inspectOriginalComponents(url, cookie, nativeWorkflowId);
  const widgetNodeType = widgetNode.name;
  await stop(server);
  if (calls.length) console.log("Component fixture tool calls:", calls.map((call) => call.name));
  calls.length = 0;
  const workflow = {
    id: "KronTermSmoke001",
    name: "KronTerm smoke",
    active: false,
    settings: { executionOrder: "v1" },
    nodes: [
      {
        id: "start",
        name: "Start",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        id: "launch",
        name: "Launch widget",
        type: widgetNodeType,
        typeVersion: 1,
        position: [100, 0],
        parameters: { magnified: false },
      },
      {
        id: "harness",
        name: "Harness",
        type: "CUSTOM.hermesAgent",
        typeVersion: 1,
        position: [200, 0],
        parameters: { task: "Smoke test", timeoutSeconds: 15 },
      },
      {
        id: "widget",
        name: "Widget",
        type: "CUSTOM.kronTermWidget",
        typeVersion: 1,
        position: [400, 0],
        parameters: { operation: "widget_snapshot", arguments: '{"blockId":"smoke-widget"}' },
      },
      {
        id: "tool",
        name: "Tool",
        type: "CUSTOM.kronTermTool",
        typeVersion: 1,
        position: [600, 0],
        parameters: { operation: "call", tool: "list_blocks", arguments: "{}" },
      },
      {
        id: "queue",
        name: "Queue render",
        type: "CUSTOM.comfyUiWorkflow",
        typeVersion: 1,
        position: [800, 0],
        parameters: {
          operation: "submit",
          origin: "http://127.0.0.1:8190",
          workflow: JSON.stringify({ 1: { class_type: "CLIPTextEncode", inputs: { text: "Smoke test" } } }),
        },
      },
      {
        id: "check",
        name: "Check render",
        type: "CUSTOM.comfyUiWorkflow",
        typeVersion: 1,
        position: [1000, 0],
        parameters: { operation: "job", promptId: "={{ $json.promptId }}" },
      },
    ],
    connections: {
      Start: { main: [[{ node: "Launch widget", type: "main", index: 0 }]] },
      "Launch widget": { main: [[{ node: "Harness", type: "main", index: 0 }]] },
      Harness: { main: [[{ node: "Widget", type: "main", index: 0 }]] },
      Widget: { main: [[{ node: "Tool", type: "main", index: 0 }]] },
      Tool: { main: [[{ node: "Queue render", type: "main", index: 0 }]] },
      "Queue render": { main: [[{ node: "Check render", type: "main", index: 0 }]] },
    },
  };
  const filename = path.join(data, "workflow.json");
  fs.writeFileSync(filename, JSON.stringify(workflow));
  await command(["import:workflow", `--input=${filename}`], "import.log");
  await command(["execute", `--id=${workflow.id}`, "--rawOutput"], "execute.log");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["trigger_widget", "n8n_run_agent", "widget_snapshot", "list_blocks", "comfyui_submit", "comfyui_job"]
  );
  assert.equal(calls[2].arguments.blockId, "smoke-widget");
  assert.equal(calls[5].arguments.id, "smoke-prompt");
  assert.equal(calls[5].arguments.origin, "http://127.0.0.1:8190");
  const execution = fs.readFileSync(path.join(data, "execute.log"), "utf8");
  assert.match(execution, /"finished": true/);
  assert.match(execution, /"filename": "smoke\.png"/);
  console.log(
    "Full n8n workflow executed widget, Hermes, tool, and ComfyUI nodes through the authenticated test bridge."
  );
} catch (error) {
  console.error(`Smoke diagnostics: ${data}`);
  throw error;
} finally {
  await stop(server);
  bridge.closeAllConnections();
  await new Promise((resolve) => bridge.close(resolve));
}
fs.rmSync(data, { recursive: true, force: true });
