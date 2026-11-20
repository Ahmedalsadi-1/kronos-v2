const { createRequire } = require("node:module");
const { readFileSync, realpathSync, existsSync } = require("node:fs");
const { homedir } = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { parse } = require("yaml");

const provider = "openai-codex";
const endpoint = "https://chatgpt.com/backend-api/codex";

function kronosProfile() {
    const root = process.env.HERMES_HOME || path.join(homedir(), ".hermes");
    try {
        const { model } = parse(readFileSync(path.join(root, "config.yaml"), "utf8"), { maxAliasCount: 10 }) ?? {};
        if (model?.provider === provider && typeof model.default === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(model.default) &&
            (!model.base_url || model.base_url.replace(/\/$/, "") === endpoint)) return { root, id: model.default };
    } catch {}
    return null;
}

async function readPi(executable) {
    const resolve = createRequire(realpathSync(executable));
    const locations = resolve.resolve.paths("@mariozechner/pi-ai") ?? [];
    const entry = locations.map((folder) => path.join(folder, "@mariozechner", "pi-ai", "dist", "index.js")).find(existsSync);
    if (!entry) throw new Error("Pi SDK unavailable");
    return import(pathToFileURL(entry).href);
}

async function completeWithKronos(executable, profile, systemPrompt, prompt, { webSearch = false } = {}) {
    let accessToken;
    try {
        const auth = JSON.parse(readFileSync(path.join(profile.root, "auth.json"), "utf8"));
        accessToken = auth.providers?.[provider]?.tokens?.access_token;
    } catch {}
    if (typeof accessToken !== "string" || !accessToken) return { error: "KronOS has no Codex session. Sign in through Hermes and retry." };

    let sdk;
    try { sdk = await readPi(executable); } catch {
        return { error: "Pi's provider SDK could not be loaded. Check your Pi installation and retry." };
    }
    const known = sdk.getModels(provider);
    const template = known.find((model) => model.id === profile.id) ?? known.find((model) => model.reasoning);
    if (!template) return { error: "This Pi installation has no OpenAI Codex provider support." };
    const model = { ...template, id: profile.id, name: profile.id, baseUrl: endpoint };

    try {
        const message = await sdk.completeSimple(model, {
            systemPrompt,
            messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        }, { apiKey: accessToken, signal: AbortSignal.timeout(120_000), reasoning: "off", maxTokens: 3000,
            ...(webSearch ? { onPayload: (body) => ({
                ...body, tools: [{ type: "web_search" }], tool_choice: "required",
            }) } : {}),
        });
        if (message.stopReason === "error" || message.stopReason === "aborted") {
            const diagnostic = message.errorMessage ?? "";
            return { error: /401|unauthorized|expired|invalid token/i.test(diagnostic)
                ? "The KronOS Codex session was rejected. Sign in through Hermes and retry."
                : /model.+(not found|unsupported|does not exist)/i.test(diagnostic)
                  ? "The KronOS model is unavailable to this Codex account."
                  : "The KronOS provider could not complete the comparison. Try again." };
        }
        return { text: message.content.filter((part) => part.type === "text").map((part) => part.text).join("") };
    } catch {
        return { error: "The KronOS provider could not complete the comparison. Try again." };
    }
}

module.exports = { completeWithKronos, kronosProfile };
