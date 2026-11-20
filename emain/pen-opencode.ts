// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

export async function recoverOpenCodeText(endpoint: string, sessionId: string, cwd: string, signal: AbortSignal) {
    const url = new URL(`/session/${encodeURIComponent(sessionId)}/message`, endpoint);
    url.searchParams.set("directory", cwd);
    const password = process.env.OPENCODE_SERVER_PASSWORD;
    const user = process.env.OPENCODE_SERVER_USERNAME || "opencode";
    const response = await fetch(url, {
        signal,
        headers: password ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` } : {},
    });
    if (!response.ok) throw new Error(`Could not recover OpenCode's reply (HTTP ${response.status}).`);
    const messages = await response.json() as {
        info: { role: string };
        parts: { id: string; type: string; text?: string }[];
    }[];
    return messages.filter(({ info }) => info.role === "assistant")
        .flatMap(({ parts }) => parts.filter((part) => part.type === "text" && part.text?.trim()));
}

export async function streamPenOpenCode(
    cwd: string,
    prompt: string,
    config: { model: string; provider: string; baseUrl: string; apiKey?: string; reasoning: string; signal: AbortSignal },
    onText: (text: string) => void,
    onTool?: (tool: PenAgentToolUpdate) => void
) {
    config.signal.throwIfAborted();
    const codexSubscription = config.provider === "openai-codex";
    let authHome: string;
    if (codexSubscription) {
        const claims = JSON.parse(Buffer.from(config.apiKey.split(".")[1], "base64url").toString());
        const accountId = claims["https://api.openai.com/auth"]?.chatgpt_account_id;
        if (!accountId || claims.exp * 1000 <= Date.now()) throw new Error("Hermes has no current Codex subscription token.");
        authHome = await mkdtemp(join(tmpdir(), "pen-opencode-"));
        try {
            await mkdir(join(authHome, "opencode"), { mode: 0o700 });
            await writeFile(join(authHome, "opencode", "auth.json"), JSON.stringify({ openai: {
                type: "oauth", access: config.apiKey, refresh: "", expires: claims.exp * 1000, accountId,
            } }), { mode: 0o600 });
        } catch (error) {
            await rm(authHome, { recursive: true, force: true });
            throw error;
        }
    }
    const openRouter = config.provider === "openrouter" && new URL(config.baseUrl).origin === "https://openrouter.ai";
    const endpoint = openRouter ? process.env.KRONOS_OPENCODE_SERVER : undefined;
    const model = `${openRouter ? "openrouter" : codexSubscription ? "openai" : "kronos-hermes"}/${config.model}`;
    const customConfig = openRouter || codexSubscription ? undefined : JSON.stringify({
        provider: { "kronos-hermes": {
            npm: "@ai-sdk/openai-compatible", name: "Hermes provider",
            options: { baseURL: config.baseUrl, ...(config.apiKey && { apiKey: "{env:KRONOS_OPENCODE_PROVIDER_KEY}" }) },
            models: { [config.model]: { name: config.model, reasoning: config.reasoning !== "off",
                variants: { [config.reasoning]: { reasoningEffort: config.reasoning } } } },
        } },
    });
    const child = spawn(process.env.KRONOS_OPENCODE_BIN || "opencode", [
        "run", "--pure", "--format", "json", "--dir", cwd, "--model", model,
        ...(config.reasoning === "off" ? [] : ["--variant", config.reasoning]),
        ...(endpoint ? ["--attach", endpoint] : []), "--", prompt,
    ], {
        env: {
            ...process.env,
            ...(customConfig && { OPENCODE_CONFIG_CONTENT: customConfig }),
            ...(authHome && { XDG_DATA_HOME: authHome }),
            ...(!codexSubscription && config.apiKey && (openRouter ? { OPENROUTER_API_KEY: config.apiKey } : { KRONOS_OPENCODE_PROVIDER_KEY: config.apiKey })),
        },
        detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    const stopped = new Promise<{ code: number; error?: Error }>((resolve) => {
        child.once("error", (error) => resolve({ code: 1, error }));
        child.once("close", (code) => resolve({ code: code ?? 1 }));
    });
    const abort = () => {
        if (!child.pid) return;
        try {
            if (process.platform === "win32") child.kill();
            else process.kill(-child.pid, "SIGTERM");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
    };
    config.signal.addEventListener("abort", abort, { once: true });
    let stderr = "";
    let failure = "";
    let sessionId: string;
    const displayed = new Set<string>();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-1500); });
    const lines = createInterface({ input: child.stdout });
    try {
        for await (const line of lines) {
            let event;
            try { event = JSON.parse(line); }
            catch { continue; }
            sessionId ??= event.sessionID ?? event.part?.sessionID;
            if (event.type === "text" && event.part?.text && !displayed.has(event.part.id)) {
                displayed.add(event.part.id);
                onText(event.part.text);
            }
            if (event.type === "error") {
                failure = event.error?.data?.message || event.error?.message || event.error?.name || "OpenCode returned an error.";
            }
            if (event.type !== "tool_use" || !event.part?.state) continue;
            const { tool, callID, state } = event.part;
            onTool?.({ id: callID, name: tool, done: false, input: state.input });
            onTool?.({ id: callID, name: tool, done: true, failed: state.status === "error",
                output: String(state.error ?? state.output ?? state.title ?? "").slice(0, 12000) });
        }
        const { code, error } = await stopped;
        config.signal.throwIfAborted();
        if (failure || code) {
            const reason = failure || error?.message || stderr.trim() || `OpenCode exited with code ${code}.`;
            throw new Error(config.apiKey ? reason.replaceAll(config.apiKey, "[redacted]") : reason);
        }
        // The attach stream can close on session idle before the last text event arrives.
        if (endpoint && sessionId) {
            try {
                for (const part of await recoverOpenCodeText(endpoint, sessionId, cwd,
                    AbortSignal.any([config.signal, AbortSignal.timeout(5000)]))) {
                    if (!displayed.has(part.id)) onText(part.text);
                }
            } catch (error) {
                if (!displayed.size || config.signal.aborted) throw error;
            }
        }
        return "done" as const;
    } finally {
        config.signal.removeEventListener("abort", abort);
        lines.close();
        if (authHome) await rm(authHome, { recursive: true, force: true });
    }
}
