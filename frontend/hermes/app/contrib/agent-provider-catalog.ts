/**
 * CLI agent launch catalog adapted from CleanCode's MIT-licensed built-in
 * provider catalog. KronTerm keeps this declarative: launching a provider
 * creates an ordinary command terminal, so providers remain inspectable and
 * inherit the workspace's normal process lifecycle.
 */
export interface AgentCliProvider {
    arguments?: readonly string[];
    documentationUrl: string;
    executable: string;
    id: string;
    label: string;
}

const provider = (
    id: string,
    label: string,
    executable: string,
    documentationUrl: string,
    args?: readonly string[]
): AgentCliProvider => ({ id, label, executable, documentationUrl, ...(args ? { arguments: args } : {}) });

export const AgentCliProviders: readonly AgentCliProvider[] = [
    provider("hermes", "Hermes", "hermes", "https://github.com/NousResearch/hermes-agent"),
    provider("codex", "Codex", "codex", "https://developers.openai.com/codex/cli"),
    provider("claude-code", "Claude Code", "claude", "https://docs.anthropic.com/en/docs/claude-code/overview"),
    provider("gemini", "Gemini CLI", "gemini", "https://github.com/google-gemini/gemini-cli"),
    provider("kronterm-agent", "KronTerm Agent", "opencode", "https://opencode.ai/docs"),
    provider("pi", "Pi", "pi", "https://github.com/badlogic/pi-mono"),
    provider("openclaw", "OpenClaw", "openclaw", "https://docs.openclaw.ai"),
    provider("aider", "Aider", "aider", "https://aider.chat/docs/"),
    provider("amp", "Amp", "amp", "https://ampcode.com/manual"),
    provider("ante", "Ante", "ante", "https://github.com/AntigmaLabs/ante-preview"),
    provider("antigravity", "Antigravity", "agy", "https://antigravity.google/docs/cli-overview"),
    provider("aug", "Auggie", "auggie", "https://docs.augmentcode.com/cli/overview"),
    provider("autohand", "Autohand Code", "autohand", "https://github.com/autohandai/code-cli"),
    provider("cline", "Cline", "cline", "https://docs.cline.bot/cline-cli/overview"),
    provider("codebuff", "Codebuff", "codebuff", "https://www.codebuff.com/docs/help/quick-start"),
    provider("command-code", "Command Code", "cmd", "https://commandcode.ai/docs/quickstart", ["--trust"]),
    provider("continue", "Continue", "cn", "https://docs.continue.dev/guides/cli"),
    provider(
        "copilot",
        "GitHub Copilot",
        "copilot",
        "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"
    ),
    provider("crush", "Charm", "crush", "https://github.com/charmbracelet/crush"),
    provider("cursor", "Cursor", "cursor-agent", "https://cursor.com/cli"),
    provider("devin", "Devin", "devin", "https://devin.ai/cli"),
    provider("droid", "Droid", "droid", "https://docs.factory.ai/cli/getting-started/quickstart"),
    provider("goose", "Goose", "goose", "https://block.github.io/goose/docs/quickstart/"),
    provider("grok", "Grok", "grok", "https://x.ai/cli"),
    provider("kilo", "Kilocode", "kilo", "https://kilo.ai/docs/cli"),
    provider("kimi", "Kimi", "kimi", "https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"),
    provider("kiro", "Kiro", "kiro-cli", "https://kiro.dev/docs/cli/", ["chat"]),
    provider("mimo-code", "MiMo Code", "mimo", "https://mimo.xiaomi.com/coder"),
    provider("mistral-vibe", "Mistral Vibe", "vibe", "https://github.com/mistralai/mistral-vibe"),
    provider("omp", "OMP", "omp", "https://omp.sh"),
    provider("openclaude", "OpenClaude", "openclaude", "https://openclaude.gitlawb.com/"),
    provider("qwen-code", "Qwen Code", "qwen", "https://github.com/QwenLM/qwen-code"),
    provider("rovo", "Rovo Dev", "acli", "https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli/", [
        "rovodev",
        "run",
    ]),
];

export function makeAgentTerminalMeta(provider: AgentCliProvider): Record<string, unknown> {
    return {
        view: "term",
        controller: "cmd",
        cmd: provider.executable,
        "cmd:args": [...(provider.arguments ?? [])],
        "cmd:runonstart": true,
    };
}
