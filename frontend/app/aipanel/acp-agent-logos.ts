// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import claudeLogo from "./agent-logos/claude.png";
import codebuddyLogo from "./agent-logos/codebuddy.svg?url";
import codexLogo from "./agent-logos/codex.svg?url";
import droidLogo from "./agent-logos/droid.svg?url";
import geminiLogo from "./agent-logos/gemini.png";
import hermesLogo from "./agent-logos/hermes.svg?url";
import kiroLogo from "./agent-logos/kiro.ico";
import kronoscodeLogo from "./agent-logos/kronoscode.svg?url";
import opencodeLogo from "./agent-logos/opencode.svg?url";
import qwenLogo from "./agent-logos/qwen.svg?url";

const AgentLogos: Record<string, string> = {
    claude: claudeLogo,
    "claude-code": claudeLogo,
    codebuddy: codebuddyLogo,
    codex: codexLogo,
    droid: droidLogo,
    gemini: geminiLogo,
    hermes: hermesLogo,
    kiro: kiroLogo,
    kronoscode: kronoscodeLogo,
    opencode: opencodeLogo,
    qwen: qwenLogo,
};

export function acpAgentLogo(backend: string): string | undefined {
    return AgentLogos[backend.toLowerCase()];
}
