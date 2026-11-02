import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const Here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Root = path.resolve(Here, "../..");
const Runtime = path.join(Here, ".runtime");
const Host = process.argv[2] ?? "tauri";
if (!["tauri", "electron", "server"].includes(Host)) throw new Error("Expected tauri, electron, or server");
await mkdir(path.join(Runtime, "config"), { recursive: true, mode: 0o700 });
await mkdir(path.join(Runtime, "data"), { recursive: true, mode: 0o700 });
await writeFile(
    path.join(Runtime, "config/settings.json"),
    JSON.stringify({
        "app:layoutmode": "os",
        "telemetry:enabled": false,
        "autoupdate:enabled": false,
        "window:transparent": false,
    })
);
await Promise.all(
    ["renderer-report.json", "browser-proof.json"].map((name) => rm(path.join(Runtime, name), { force: true }))
);
const Auth = randomUUID();
const Session = randomUUID();
const children = new Set();
let server;
let fixture;
const wss = new WebSocketServer({ noServer: true });
const sockets = wss;
let closing = false;
function child(command, args, options = {}) {
    const proc = spawn(command, args, { cwd: Root, stdio: ["pipe", "pipe", "pipe"], ...options });
    children.add(proc);
    proc.on("exit", () => children.delete(proc));
    proc.on("error", (error) => {
        console.error(error);
        process.exitCode = 1;
        shutdown();
    });
    return proc;
}
function shutdown() {
    if (closing) return;
    closing = true;
    for (const proc of children) {
        proc.stdin?.end();
        proc.kill("SIGTERM");
    }
    setTimeout(() => {
        for (const proc of children) proc.kill("SIGKILL");
        process.exit(process.exitCode ?? 0);
    }, 2000);
    server?.close();
    fixture?.close();
    for (const socket of wss.clients) socket.terminate();
    wss.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
    console.error(error);
    process.exitCode = 1;
    shutdown();
});
process.on("unhandledRejection", (error) => {
    console.error(error);
    process.exitCode = 1;
    shutdown();
});
const backend = child(path.join(Root, `dist/bin/wavesrv.${process.arch}`), [], {
    env: {
        ...process.env,
        KRONTERM_CONFIG_HOME: path.join(Runtime, "config"),
        KRONTERM_DATA_HOME: path.join(Runtime, "data"),
        WAVETERM_AUTH_KEY: Auth,
        WAVETERM_APP_PATH: path.join(Root, "dist"),
        WAVETERM_RESOURCES_PATH: path.join(Root, "dist"),
        WAVETERM_NOPING: "1",
    },
});
let backendLog = "";
const endpoints = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Backend startup timed out: ${backendLog.slice(-2000)}`)), 20000);
    const onStartupData = (chunk) => {
        backendLog = (backendLog + chunk).slice(-8192);
        const match = /WAVESRV-ESTART ws:([^ ]+) web:([^ ]+)/.exec(backendLog);
        if (match) {
            clearTimeout(timeout);
            backend.stderr.off("data", onStartupData);
            resolve({ ws: match[1], web: match[2] });
        }
    };
    backend.stderr.on("data", onStartupData);
    backend.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Backend exited ${code}: ${backendLog.slice(-2000)}`));
    });
});
backend.stderr.on("data", (chunk) => {
    void import("node:fs").then((fs) => fs.appendFileSync(path.join(Runtime, "backend.log"), chunk));
});
backend.stdout.resume();
let uiContext;
async function service(service, method, args = []) {
    const response = await fetch(`http://${endpoints.web}/wave/service`, {
        method: "POST",
        headers: { "X-AuthKey": Auth },
        body: JSON.stringify({ service, method, args, uicontext: uiContext }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(`${method}: ${result.error ?? response.status}`);
    return result.data;
}
const client = await service("client", "GetClientData");
const win = client.windowids?.length
    ? await service("window", "GetWindow", [client.windowids[0]])
    : await service("window", "CreateWindow", [null, ""]);
const workspace = await service("workspace", "GetWorkspace", [win.workspaceid]);
const tabId = workspace.activetabid ?? workspace.tabids[0];
uiContext = { windowid: win.oid, activetabid: tabId };
const tab = await service("client", "GetTab", [tabId]);
for (const blockId of tab.blockids ?? []) {
    const block = await service("object", "GetObject", [`block:${blockId}`]);
    if (block?.meta?.view === "web") {
        await service("object", "UpdateObjectMeta", [`block:${blockId}`, { url: "http://127.0.0.1:14291/" }]);
    }
}
const Init = { clientId: client.oid, windowId: win.oid, tabId, primaryTabStartup: false };
const Port = 14290;
const Origin = `http://127.0.0.1:${Port}`;

function authorized(req) {
    return (
        req.headers.host === `127.0.0.1:${Port}` &&
        req.headers.cookie?.split("; ").includes(`prototype=${Session}`) &&
        (!req.headers.origin || req.headers.origin === Origin)
    );
}
const Mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".wasm": "application/wasm",
};
server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, Origin);
        if (req.headers.host === `127.0.0.1:${Port}` && url.pathname === `/session/${Session}`) {
            res.writeHead(302, {
                "Set-Cookie": `prototype=${Session}; HttpOnly; SameSite=Strict; Path=/`,
                Location: "/",
            });
            res.end();
            return;
        }
        if (!authorized(req)) {
            res.writeHead(403);
            res.end("Prototype session required");
            return;
        }
        if (url.pathname === "/prototype/bootstrap") {
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    init: Init,
                    platform: process.platform,
                    home: os.homedir(),
                    data: path.join(Runtime, "data"),
                    config: path.join(Runtime, "config"),
                    user: os.userInfo().username,
                    hostname: os.hostname(),
                    host: Host,
                    development: process.env.KRONTERM_PROTOTYPE_DEV === "1",
                })
            );
            return;
        }
        if (url.pathname === "/prototype/report" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) {
                body += chunk;
                if (body.length > 1_000_000) throw new Error("Report too large");
            }
            const report = JSON.parse(body);
            delete report.dom;
            await writeFile(path.join(Runtime, "renderer-report.json"), JSON.stringify(report));
            res.end("ok");
            return;
        }
        if (/^\/(wave|api|vdom|stream|web|favicon)(\/|$)/.test(url.pathname)) {
            const proxy = http.request(
                `http://${endpoints.web}${req.url}`,
                { method: req.method, headers: { ...req.headers, host: endpoints.web, "x-authkey": Auth } },
                (response) => {
                    res.writeHead(response.statusCode, response.headers);
                    response.pipe(res);
                }
            );
            proxy.on("error", () => {
                res.writeHead(502);
                res.end();
            });
            req.pipe(proxy);
            return;
        }
        if (process.env.KRONTERM_PROTOTYPE_DEV === "1") {
            const proxy = http.request(`http://127.0.0.1:14292${req.url}`, { method: req.method }, (response) => {
                res.writeHead(response.statusCode, response.headers);
                response.pipe(res);
            });
            proxy.on("error", () => {
                res.writeHead(502);
                res.end();
            });
            req.pipe(proxy);
            return;
        }
        const file = path.resolve(
            Here,
            "web-dist",
            `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`
        );
        if (!file.startsWith(path.join(Here, "web-dist") + path.sep)) {
            res.writeHead(403);
            res.end();
            return;
        }
        res.setHeader("Content-Type", Mime[path.extname(file)] ?? "application/octet-stream");
        res.end(await readFile(file));
    } catch (error) {
        res.writeHead(500);
        res.end(String(error));
    }
});
server.on("upgrade", (req, socket, head) => {
    if (!authorized(req) || !req.url.startsWith("/ws?")) {
        socket.destroy();
        return;
    }
    sockets.handleUpgrade(req, socket, head, (downstream) => {
        const upstream = new WebSocket(`ws://${endpoints.ws}${req.url}`, { headers: { "X-AuthKey": Auth } });
        const queue = [];
        downstream.on("message", (data, binary) => {
            if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
            else queue.push([data, binary]);
        });
        upstream.on("open", () => {
            for (const [data, binary] of queue) upstream.send(data, { binary });
            queue.length = 0;
        });
        upstream.on("message", (data, binary) => {
            if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary });
        });
        upstream.on("error", () => downstream.close());
        downstream.on("error", () => upstream.close());
        downstream.on("close", () => upstream.close());
        upstream.on("close", () => downstream.close());
    });
});
fixture = await (
    await import("./fixture.mjs")
).startFixture((proof) => {
    void writeFile(
        path.join(Runtime, "browser-proof.json"),
        JSON.stringify({ host: Host, ...proof, timestamp: new Date().toISOString() })
    );
});
await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Port, "127.0.0.1", resolve);
});
const launchUrl = `${Origin}/session/${Session}`;
await writeFile(
    path.join(Runtime, "session.json"),
    JSON.stringify({
        host: Host,
        development: process.env.KRONTERM_PROTOTYPE_DEV === "1",
        launcherPid: process.pid,
        backendPid: backend.pid,
        tabId,
        workspaceId: workspace.oid,
    }),
    { mode: 0o600 }
);
console.log(`Prototype backend ready; host=${Host}; launcher PID=${process.pid}; backend PID=${backend.pid}`);
if (Host !== "server") {
    const proc =
        Host === "tauri"
            ? child(
                  path.join(
                      Here,
                      process.platform === "darwin"
                          ? ".runtime/KronTermTauriPrototype.app/Contents/MacOS/kronterm-tauri-os"
                          : "src-tauri/target/release/kronterm-tauri-os"
                  ),
                  [],
                  {
                      env: { ...process.env, KRONTERM_PROTOTYPE_URL: launchUrl },
                  }
              )
            : child(path.join(Root, "node_modules/.bin/electron"), [path.join(Here, "scripts/electron-host.cjs")], {
                  env: { ...process.env, KRONTERM_PROTOTYPE_URL: launchUrl },
              });
    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);
    proc.on("exit", shutdown);
    console.log(`Host PID=${proc.pid}`);
}
