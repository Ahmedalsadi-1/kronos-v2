// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export async function streamPenCodex(
    cwd: string,
    prompt: string,
    options: { signal: AbortSignal; model: string; baseUrl?: string; providerKey?: string; reasoning: string },
    onText: (text: string) => void,
    onTool?: (tool: PenAgentToolUpdate) => void
) {
    options.signal.throwIfAborted();
    const baseUrl = JSON.stringify(options.baseUrl);
    const auth = options.providerKey ? ',env_key="KRONOS_CODEX_PROVIDER_KEY"' : "";
    const provider = options.baseUrl ? [
        "-c", 'model_provider="kronos_hermes"',
        "-c", `model_providers.kronos_hermes={name="Hermes provider",base_url=${baseUrl},wire_api="responses"${auth}}`,
    ] : [];
    const effort = JSON.stringify(options.reasoning === "off" ? "none" : options.reasoning);
    const env = { ...process.env };
    if (!options.baseUrl) {
        delete env.OPENAI_API_KEY;
        delete env.CODEX_API_KEY;
    }
    if (options.providerKey) env.KRONOS_CODEX_PROVIDER_KEY = options.providerKey;
    const child = spawn(process.env.KRONOS_CODEX_BIN || "codex", [
        "exec", "--json", "--ignore-user-config", "--skip-git-repo-check",
        "--sandbox", "workspace-write", "-C", cwd, ...provider, "-c", `model_reasoning_effort=${effort}`,
        "--model", options.model, "-",
    ], {
        cwd,
        env,
        signal: options.signal,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const stopped = new Promise<{ code: number; error?: Error }>((resolve) => {
        child.once("error", (error) => resolve({ code: 1, error }));
        child.once("close", (code) => resolve({ code: code ?? 1 }));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
    const lines = createInterface({ input: child.stdout });
    let stderr = "";
    let failure = "";
    let hasText = false;
    const activeTools = new Set<string>();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => { stderr = (stderr + text).slice(-1500); });
    try {
        for await (const line of lines) {
            let event;
            try { event = JSON.parse(line); }
            catch { continue; }
            if (event.type === "turn.failed") failure = event.error?.message ?? "Codex turn failed.";
            if (event.type === "error" && !failure) failure = event.message ?? "Codex returned an error.";
            if (event.type === "turn.completed") failure = "";
            const item = event.item;
            if (event.type === "item.completed" && item?.type === "agent_message" && item.text) {
                onText((hasText ? "\n\n" : "") + item.text);
                hasText = true;
            }
            if (!item || !["command_execution", "file_change", "mcp_tool_call"].includes(item.type)) continue;
            if ((event.type === "item.started" || event.type === "item.completed") && !activeTools.has(item.id)) {
                activeTools.add(item.id);
                onTool?.({ id: item.id, name: item.type, done: false, input: item.command ?? item.arguments ?? item.changes });
            }
            if (event.type === "item.completed") {
                activeTools.delete(item.id);
                onTool?.({ id: item.id, name: item.type, done: true,
                    failed: item.status === "failed" || (item.exit_code != null && item.exit_code !== 0),
                    output: String(item.error?.message ?? item.aggregated_output ?? JSON.stringify(item.changes ?? item.result ?? {})).slice(-12000) });
            }
        }
        const { code, error } = await stopped;
        options.signal.throwIfAborted();
        if (failure || code) {
            const message = failure || error?.message || stderr || `Codex exited with code ${code}.`;
            throw new Error(options.providerKey ? message.replaceAll(options.providerKey, "[redacted]") : message);
        }
        return "done" as const;
    } finally {
        lines.close();
    }
}
