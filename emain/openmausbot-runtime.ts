// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, utilityProcess, type UtilityProcess } from "electron";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { BotDesktopBridge } from "./agent-bot-desktop-bridge";
import { grantManagedRuntimeRequests, revokeManagedRuntimeRequests } from "./authkey";
import { getKronosCodeBinaryCandidates } from "./kronoscode-runtime";

export type OpenMausBotConnection = { origin: string; parentOrigin: string };
const OwnerHeader = "X-OpenMausBot-Desktop-Owner";
let desktopBridge: BotDesktopBridge;
let child: UtilityProcess;
let connection: OpenMausBotConnection;
let starting: Promise<OpenMausBotConnection>;
const ownerToken = randomBytes(32).toString("base64url");

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close((error) => (error ? reject(error) : resolve(port)));
        });
    });
}

export function stopOpenMausBotRuntime() {
    if (connection) revokeManagedRuntimeRequests(connection.origin);
    desktopBridge?.stop();
    desktopBridge = undefined;
    const running = child;
    child = undefined;
    connection = undefined;
    starting = undefined;
    running?.kill();
}

async function start(parentOrigin: string): Promise<OpenMausBotConnection> {
    const root = app.isPackaged
        ? path.join(process.resourcesPath, "openmausbot")
        : ([
              path.resolve(app.getAppPath(), "integrations/openmausbot/upstream"),
              path.resolve(process.cwd(), "integrations/openmausbot/upstream"),
              path.resolve(import.meta.dirname, "../../integrations/openmausbot/upstream"),
          ].find((candidate) => fs.existsSync(path.join(candidate, "package.json"))) ?? "");
    const entry = path.join(root, "dist-server/index.js");
    if (!fs.existsSync(entry) || !fs.existsSync(path.join(root, "dist/index.html"))) {
        throw new Error("Agent workspace source is not built. Run npm run build:agents.");
    }
    const dataDir = path.join(app.getPath("userData"), "agent-workspace");
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const config = path.join(dataDir, "config.json");
    if (!fs.existsSync(config)) {
        const cli = getKronosCodeBinaryCandidates().find((candidate) => fs.existsSync(candidate));
        if (!cli) throw new Error("KronosCode executable is unavailable.");
        const quotedCli = `'${cli.replace(/'/g, "'\\''")}' acp`;
        fs.writeFileSync(
            config,
            JSON.stringify({
                instances: {
                    kronoscode: { driver: "customAcp", displayName: "KronosCode", config: { cli: quotedCli } },
                },
                defaultModelSelection: { instanceId: "kronoscode", model: "agent-default" },
            }),
            { mode: 0o600, flag: "wx" }
        );
    }
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    desktopBridge = new BotDesktopBridge(async () => {
        const response = await fetch(`${origin}/api/bots`, {
            headers: { [OwnerHeader]: ownerToken },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Agent roster unavailable (${response.status})`);
        const state = await response.json();
        return state.bots.map((bot: { id: string; name: string; cwd?: string }) => ({
            id: bot.id,
            name: bot.name,
            cwd: bot.cwd,
        }));
    });
    const bridge = await desktopBridge.start();
    const running = utilityProcess.fork(entry, [], {
        cwd: root,
        stdio: "pipe",
        serviceName: "KronTerm Agent Workspace",
        env: {
            ...process.env,
            OMB_DATA_DIR: dataDir,
            KRONTERM_BOT_BRIDGE_URL: bridge.url,
            KRONTERM_BOT_BRIDGE_TOKEN: bridge.token,
            OMB_PORT: String(port),
            OMB_WEBHOOK_PORT: "0",
            OMB_STATIC_DIR: path.join(root, "dist"),
            OMB_DESKTOP_PARENT: "1",
            OMB_DEV_TRUST_LOCAL_BROWSER: "0",
            KRONTERM_EMBED_PARENT_ORIGIN: parentOrigin === "null" ? "file:" : parentOrigin,
        },
    });
    child = running;
    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };
        const timer = setTimeout(
            () => finish(new Error("Agent workspace did not become ready within 30 seconds.")),
            30_000
        );
        running.once("spawn", () =>
            running.postMessage({ type: "openmausbot:desktop-mutation-token", token: ownerToken })
        );
        running.on("message", (message) => {
            if (message?.type !== "kronterm:ready" || message.port !== port) return;
            void fetch(`${origin}/api/auth/stream-ticket`, {
                method: "POST",
                headers: { [OwnerHeader]: ownerToken },
                signal: AbortSignal.timeout(5000),
            }).then(
                (result) =>
                    finish(
                        result.ok ? undefined : new Error(`Agent workspace authentication failed (${result.status}).`)
                    ),
                () => finish(new Error("Agent workspace readiness check failed."))
            );
        });
        running.once("exit", (code) => {
            if (child === running) stopOpenMausBotRuntime();
            finish(new Error(`Agent workspace exited (${code}) before becoming ready.`));
        });
        running.stdout?.on("data", () => {});
        running.stderr?.on("data", () => {});
    });
    connection = { origin, parentOrigin };
    return connection;
}

export async function openMausBotConnection(sender: Electron.WebContents): Promise<OpenMausBotConnection> {
    const url = new URL(sender.getURL());
    if (
        url.protocol !== "file:" &&
        !(["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1"].includes(url.hostname))
    ) {
        throw new Error("Agent workspace can only be opened by the KronTerm renderer.");
    }
    if (!starting)
        starting = start(url.origin).catch((error) => {
            stopOpenMausBotRuntime();
            throw error;
        });
    const result = await starting;
    if (result.parentOrigin !== url.origin)
        throw new Error("Agent workspace is already bound to another renderer origin.");
    grantManagedRuntimeRequests(result.origin, OwnerHeader, ownerToken, sender.id);
    desktopBridge.synchronize();
    return result;
}

export async function openBotDesktop(sender: Electron.WebContents, botId: string) {
    await openMausBotConnection(sender);
    return desktopBridge.ensure(botId);
}

app.once("before-quit", stopOpenMausBotRuntime);
