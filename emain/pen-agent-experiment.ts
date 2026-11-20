// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { streamPenCodex } from "./pen-codex";
import { streamPenOpenCode } from "./pen-opencode";
import { makePenProcessTools } from "./pen-process-tools";
import { resolveHermesBinary } from "./hermes-runtime";
import { revokeKronTermToolCaller, startKronTermToolServer } from "./kronterm-tool-server";

const Ollama = "http://127.0.0.1:11434";
const Model = "qwen2.5:1.5b";
function penProject(agent: "pi" | "opencode" | "codex") {
    const project = process.env.KRONOS_COMPARE_PROJECT;
    if (!project) return process.cwd();
    return process.env.KRONOS_COMPARE_AGENT === "sequential" ? join(project, agent, "project") : project;
}

const WorkspaceMarker = "WORKSPACE_REQUIRED";
const WorkspaceAction = /\b(?:open|close|edit|update|write|read|run|find|show|check|fix|build|launch|delete|move|inspect|list|create|rename|restart|switch|continue)\b.{0,80}\b(?:workspace|widget|project|repo|file|folder|canvas|pen|terminal|tab|browser|server|build|code|app|task)\b/i;
const VoicePrompt = `You are KronOS in a live voice conversation. Answer ordinary questions directly in one or two short, natural sentences. If the request needs action, project files, current workspace state, a continuation of workspace work, or external lookup, reply with exactly ${WorkspaceMarker}. When uncertain about whether the user is referring to a workspace task, reply with the marker. Never claim you performed an action.`;
const PiPrompt = "You are KronOS in Pen. Answer concisely. For questions about the current KronOS workspace, call workspace_snapshot before answering. Use widget_snapshot with the exact block ID when you need widget detail. Find additional KronOS tools with tool_search, then invoke them with call_kronos_tool and the exact schema. Use tools to carry out authorized tasks and verify the outcome.";

type PenMessage = { role: "user" | "assistant"; content: string };
type PenRunOptions = {
    mode: "voice" | "pi" | "opencode" | "codex";
    messages: PenMessage[];
    signal: AbortSignal;
    onDelta: (text: string) => void;
    onTool?: (tool: PenAgentToolUpdate) => void;
    tabId: string;
    caller: string;
    selection?: PenModelSelection;
};

async function streamVoice({ messages, signal, onDelta }: PenRunOptions) {
    if (WorkspaceAction.test(messages.at(-1).content)) return "hermes";
    const response = await fetch(Ollama + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: Model, stream: true, keep_alive: "30m",
            messages: [{ role: "system", content: VoicePrompt }, ...messages],
            options: { num_predict: 100, num_ctx: 2048, temperature: 0.2 },
        }),
        signal,
    });
    if (!response.ok || !response.body) throw new Error("Local conversation model is unavailable.");
    let lines = "";
    let prefix = "";
    let routed = false;
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream()) as unknown as AsyncIterable<string>) {
        lines += chunk;
        let newline: number;
        while ((newline = lines.indexOf("\n")) >= 0) {
            const line = lines.slice(0, newline);
            lines = lines.slice(newline + 1);
            if (!line.trim()) continue;
            const result = JSON.parse(line);
            if (result.error) throw new Error("Local conversation generation failed.");
            const delta = result.message?.content ?? "";
            if (routed) {
                if (delta) onDelta(delta);
                continue;
            }
            prefix += delta;
            const candidate = prefix.trimStart();
            if (candidate.startsWith(WorkspaceMarker)) {
                return "hermes";
            }
            if (result.done || (candidate && !WorkspaceMarker.startsWith(candidate))) {
                routed = true;
                if (candidate) onDelta(candidate);
            }
        }
    }
    if (!routed && prefix.trim()) return "hermes";
    return "done";
}

async function loadPi() {
    for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
        const cli = await realpath(join(directory, "pi")).catch(() => null);
        if (!cli) continue;
        const entry = join(dirname(cli), "index.js");
        if (await access(entry).then(() => true, () => false)) return import(pathToFileURL(entry).href);
    }
    throw new Error("Install Pi and start KronOS with Pi on PATH.");
}

const ResolveHermesProvider = `
import json, sys
from hermes_cli.config import load_config
from hermes_cli.env_loader import load_hermes_dotenv
from hermes_cli.runtime_provider import resolve_runtime_provider
load_hermes_dotenv()
config = load_config()
cfg = config.get("model", {})
cfg = cfg if isinstance(cfg, dict) else {"default": cfg}
provider, model = sys.argv[1:]
model = model or cfg.get("default")
r = resolve_runtime_provider(requested=provider or None, target_model=model)
print(json.dumps({"provider": r.get("provider"), "mode": r.get("api_mode"),
                  "url": r.get("base_url"), "key": r.get("api_key"), "model": model,
                  "reasoning": (config.get("agent") or {}).get("reasoning_effort")}))
`;

async function resolvePenModel(selection: PenRunOptions["selection"], signal: AbortSignal) {
    const binary = await resolveHermesBinary();
    const python = join(dirname(binary), process.platform === "win32" ? "python.exe" : "python");
    const result = await promisify(execFile)(
        python, ["-c", ResolveHermesProvider, selection?.provider ?? "", selection?.model ?? ""],
        { signal, timeout: 12000, maxBuffer: 64_000, env: { ...process.env, HERMES_DISABLE_LAZY_INSTALLS: "1" } }
    ).catch(() => { throw new Error("Could not resolve the active Hermes model provider."); });
    const profile = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)) as {
        provider: string; mode: string; url: string; key: string; model: string; reasoning?: string;
    };
    const api = {
        chat_completions: "openai-completions",
        codex_responses: "openai-codex-responses",
        openai_responses: "openai-responses",
        anthropic_messages: "anthropic-messages",
    }[profile.mode];
    if (!api || !profile.model || !profile.url || !profile.provider)
        throw new Error("The selected Pen harness does not support the active Hermes provider protocol.");
    const requestedEffort = selection?.reasoning || profile.reasoning || "medium";
    const reasoning = ["off", "minimal", "low", "medium", "high", "xhigh"].includes(requestedEffort)
        ? requestedEffort : "medium";
    return { ...profile, api, reasoning };
}

async function streamPi({ messages, signal, tabId, caller, onDelta, onTool, selection, cwd: delegatedCwd }: PenRunOptions & { cwd?: string }) {
    const pi = await loadPi();
    signal.throwIfAborted();
    const profile = await resolvePenModel(selection, signal);
    const authStorage = pi.AuthStorage.inMemory();
    const modelRegistry = new pi.ModelRegistry(authStorage);
    const registered = modelRegistry.find(profile.provider, profile.model);
    modelRegistry.registerProvider("kronos-hermes", {
        baseUrl: profile.url, apiKey: "kronos-hermes", api: profile.api,
        models: [{
            id: profile.model, name: profile.model, reasoning: registered?.reasoning ?? profile.mode === "codex_responses",
            input: registered?.input ?? ["text", "image"], contextWindow: registered?.contextWindow ?? 16384, maxTokens: 4096,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            ...(profile.api === "openai-completions" && registered?.compat ? { compat: registered.compat } : {}),
        }],
    });
    authStorage.setRuntimeApiKey("kronos-hermes", profile.key || "local");
    const bridge = await startKronTermToolServer(() => ({ tabId }), caller);
    const cwd = delegatedCwd ?? penProject("pi");
    const processes = makePenProcessTools(cwd);
    try {
        signal.throwIfAborted();
        type ManifestTool = { name: string; title?: string; description?: string; inputSchema: Record<string, unknown> };
        type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
        const nativeRequest = async (payload: Record<string, unknown>) => {
            const response = await fetch(bridge.nativeUrl, {
                method: "POST", signal,
                headers: { Authorization: `Bearer ${bridge.token}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (result.error || !response.ok) throw new Error(result.error || `KronOS tool returned HTTP ${response.status}.`);
            return result;
        };
        const { tools } = delegatedCwd ? { tools: [] as ManifestTool[] } :
            await nativeRequest({ method: "list" }) as { tools: ManifestTool[] };
        const catalog = new Map(tools.map((tool) => [tool.name, tool]));
        const executeNative = async (name: string, args: Record<string, unknown>) => {
            if (!catalog.has(name)) throw new Error(`${name} is unavailable in this workspace.`);
            const result = await nativeRequest({ method: "call", name, arguments: args });
            const content = (result.content ?? []) as ToolContent[];
            if (result.isError) {
                throw new Error(content.filter((item) => item.type === "text").map((item) => item.text).join("\n") ||
                    result.failure?.message || `${name} failed.`);
            }
            return { content: content.length ? content.map((item) => item.type === "text" ?
                { ...item, text: item.text.slice(0, 24000) } : item) :
                [{ type: "text", text: JSON.stringify(result).slice(0, 24000) }] };
        };
        const directNames = new Set(["tool_search", "workspace_snapshot", "widget_snapshot", "workspace_focus_widget",
            "workspace_open_file", "workspace_screenshot", "workspace_design_editor_state", "workspace_design_read_skill",
            "workspace_design_execute", "workspace_design_save", "widget_click", "widget_type", "widget_press",
            "kronterm_browser_navigate", "file_read", "terminal_open"]);
        const customTools = tools.filter((tool) => directNames.has(tool.name)).map((tool) => ({
            name: tool.name, label: tool.title ?? tool.name, description: tool.description ?? tool.name,
            parameters: tool.inputSchema,
            execute: (_id: string, args: Record<string, unknown>) => executeNative(tool.name, args),
        }));
        if (!delegatedCwd) customTools.push({
            name: "call_kronos_tool",
            label: "Call KronOS tool",
            description: "Call a KronOS tool discovered with tool_search. Pass the exact name and arguments from its schema.",
            parameters: {
                type: "object", required: ["name", "arguments"],
                properties: { name: { type: "string" }, arguments: { type: "object", additionalProperties: true } },
            },
            execute: (_id, args) => executeNative(String(args.name), args.arguments as Record<string, unknown>),
        });
        const scope = await nativeRequest({ method: "scope" }) as { builtinTools?: string[] };
        const permissions = new Set(scope.builtinTools);
        const codingTools = [
            ...(permissions.has("terminal") ? ["bash"] : []),
            ...(permissions.has("read_file") ? ["read", "grep", "find", "ls"] : []),
            ...(permissions.has("write_file") ? ["write"] : []),
            ...(permissions.has("patch") ? ["edit"] : []),
        ];
        const agentDir = pi.getAgentDir();
        const settingsManager = pi.SettingsManager.inMemory({ retry: { enabled: false } });
        const resourceLoader = new pi.DefaultResourceLoader({
            cwd, agentDir, settingsManager,
            systemPrompt: (delegatedCwd ? "You are Pi, a coding delegate for Hermes. Work in the assigned project. Verify your changes and report the result." : PiPrompt) + " For coding tasks, prefer native Pi read, edit, write and bash. Use process_manage for background jobs when available.", noExtensions: true, noSkills: true,
            noContextFiles: true, noPromptTemplates: true, noThemes: true,
        });
        await resourceLoader.reload();
        const { session } = await pi.createAgentSession({
            authStorage, modelRegistry, model: modelRegistry.find("kronos-hermes", profile.model),
            thinkingLevel: profile.reasoning, resourceLoader, cwd, agentDir, sessionManager: pi.SessionManager.inMemory(cwd),
            settingsManager,
            tools: [...codingTools, ...customTools.map((tool) => tool.name),
                ...(permissions.has("process_manage") ? ["process_manage"] : [])],
            customTools: [...customTools, ...(permissions.has("process_manage") ? [processes.tool] : [])],
        });
        let failure: string;
        let toolCalls = 0;
        const unsubscribe = session.subscribe((event: any) => {
            if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
                onDelta(event.assistantMessageEvent.delta);
            }
            if (event.type === "tool_execution_start") {
                onTool?.({ id: event.toolCallId, name: event.toolName === "call_kronos_tool" ? String(event.args?.name ?? event.toolName) : event.toolName, done: false, input: event.toolName === "call_kronos_tool" ? event.args?.arguments : event.args });
                if (++toolCalls > 24) void session.abort();
            }
            if (event.type === "tool_execution_end") {
                const output = event.result?.content?.filter((item) => item.type === "text")
                    .map((item) => item.text).join("\n");
                onTool?.({ id: event.toolCallId, name: event.toolName, done: true,
                    failed: event.isError, output: output || (event.isError ? "Tool execution failed." : "Completed.") });
            }
            if (event.type === "message_end" && event.message.stopReason === "error") failure = event.message.errorMessage;
        });
        const abort = () => { void session.abort(); };
        signal.addEventListener("abort", abort, { once: true });
        try {
            signal.throwIfAborted();
            const prompt = messages.map(({ role, content }) => `${role === "user" ? "User" : "KronOS"}: ${content}`).join("\n");
            await session.prompt(prompt, { expandPromptTemplates: false });
            if (failure) throw new Error(failure);
            if (toolCalls > 24) throw new Error("Pi exceeded the tool call limit.");
            return "done";
        } finally {
            signal.removeEventListener("abort", abort);
            unsubscribe();
            session.dispose();
        }
    } finally {
        processes.dispose();
        revokeKronTermToolCaller(caller);
    }
}

export async function runDelegatedPiCoding({ cwd, task, tabId, signal }: {
    cwd: string; task: string; tabId: string; signal: AbortSignal;
}) {
    let output = "";
    await streamPi({
        mode: "pi", cwd, tabId, signal, caller: "hermes-pi:" + randomUUID(),
        selection: { provider: "openai-codex", model: "gpt-6.1-sol" },
        messages: [{ role: "user", content: `Project directory: ${cwd}\n\n${task}` }],
        onDelta: (delta) => { output += delta; },
    });
    signal.throwIfAborted();
    if (!output.trim()) throw new Error("Pi returned no completion report.");
    return output.trim().slice(-20000);
}

export async function runPenAgent(options: PenRunOptions) {
    if (options.mode === "pi") return streamPi(options);
    if (options.mode === "voice") return streamVoice(options);
    const profile = await resolvePenModel(options.selection, options.signal);
    const prompt = options.messages.map(({ role, content }) => `${role === "user" ? "User" : "Assistant"}: ${content}`).join("\n");
    if (options.mode === "codex") {
        const gatewayUrl = process.env.KRONOS_CODEX_HERMES_URL;
        const gatewayKey = process.env.KRONOS_CODEX_HERMES_KEY;
        if (gatewayUrl && gatewayKey && profile.mode === "codex_responses") {
            const endpoint = new URL(gatewayUrl);
            if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1") {
                throw new Error("The local Hermes Responses gateway must use a loopback URL.");
            }
            return streamPenCodex(await realpath(penProject("codex")), prompt, {
                signal: options.signal, model: profile.model, baseUrl: endpoint.href,
                providerKey: gatewayKey, reasoning: profile.reasoning,
            }, options.onDelta, options.onTool);
        }
        if (profile.provider !== "openrouter" && profile.mode !== "openai_responses" && profile.mode !== "codex_responses") {
            throw new Error("Codex CLI requires a Hermes model served over the Codex subscription, OpenAI Responses, or OpenRouter.");
        }
        return streamPenCodex(await realpath(penProject("codex")), prompt, {
            signal: options.signal, model: profile.model, baseUrl: profile.mode === "codex_responses" ? undefined : profile.url,
            providerKey: profile.mode === "codex_responses" ? undefined : profile.key, reasoning: profile.reasoning,
        }, options.onDelta, options.onTool);
    }
    if (profile.provider !== "openrouter" && profile.mode !== "chat_completions" && profile.mode !== "codex_responses") {
        throw new Error("OpenCode requires a Codex subscription, OpenRouter, or OpenAI-compatible chat model from Hermes.");
    }
    return streamPenOpenCode(penProject("opencode"), prompt, {
        model: profile.model, provider: profile.provider, baseUrl: profile.url, apiKey: profile.key,
        reasoning: profile.reasoning, signal: options.signal,
    }, options.onDelta, options.onTool);
}
