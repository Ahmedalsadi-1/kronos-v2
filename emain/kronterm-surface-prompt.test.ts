import { describe, expect, it } from "vitest";
import { ACP_BACKENDS_ALL } from "./acp/acp-types";
import { KronTermAcpSurfaceSystemPrompt, KronTermSurfaceSystemPrompt } from "./kronterm-surface-prompt";

describe("ACP harness context", () => {
    it("gives external agents the shared operating protocol with accurate MCP routing", () => {
        expect(KronTermAcpSurfaceSystemPrompt).toContain("ACP specialist");
        expect(KronTermAcpSurfaceSystemPrompt).toContain("kron-term MCP server");
        expect(KronTermAcpSurfaceSystemPrompt).toContain("@app:");
        expect(KronTermAcpSurfaceSystemPrompt).not.toContain("do not use MCP discovery");
        expect(KronTermAcpSurfaceSystemPrompt).not.toContain("Every KronTerm tool is direct");
        expect(KronTermSurfaceSystemPrompt).toContain("built-in persistent agent");
    });

    it("launches Kilo through its native ACP command", () => {
        expect(ACP_BACKENDS_ALL.kilo).toMatchObject({
            cliCommand: "kilo",
            acpArgs: ["acp"],
            enabled: true,
            skillsDirs: [".kilocode/skills", ".agents/skills"],
        });
    });
});
