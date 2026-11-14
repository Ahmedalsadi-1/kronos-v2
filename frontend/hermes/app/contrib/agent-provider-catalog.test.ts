import { describe, expect, it } from "vitest";

import { AgentCliProviders, makeAgentTerminalMeta } from "./agent-provider-catalog";

describe("agent CLI provider catalog", () => {
    it("keeps provider identities and executables unique", () => {
        expect(new Set(AgentCliProviders.map((provider) => provider.id)).size).toBe(AgentCliProviders.length);
        expect(new Set(AgentCliProviders.map((provider) => provider.executable)).size).toBe(AgentCliProviders.length);
    });

    it("launches providers as inspectable command terminals", () => {
        const rovo = AgentCliProviders.find((provider) => provider.id === "rovo");
        expect(rovo).toBeDefined();
        expect(makeAgentTerminalMeta(rovo!)).toEqual({
            view: "term",
            controller: "cmd",
            cmd: "acli",
            "cmd:args": ["rovodev", "run"],
            "cmd:runonstart": true,
        });
    });

    it("distinguishes the external OpenCode CLI from KronOS Agent", () => {
        expect(AgentCliProviders.find((provider) => provider.id === "kronterm-agent")).toMatchObject({
            label: "OpenCode",
            executable: "opencode",
        });
        expect(AgentCliProviders.some((provider) => provider.id === "opencode")).toBe(false);
    });
});
