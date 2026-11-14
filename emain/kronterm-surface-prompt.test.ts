import { describe, expect, it } from "vitest";
import { ACP_BACKENDS_ALL } from "./acp/acp-types";
import { KronTermAcpSurfaceSystemPrompt, KronTermSurfaceSystemPrompt } from "./kronterm-surface-prompt";

describe("ACP harness context", () => {
    it("routes Hermes commands to its headless shell without promising that tool to ACP", () => {
        expect(KronTermSurfaceSystemPrompt).toContain("existing headless terminal tool");
        expect(KronTermSurfaceSystemPrompt).toContain("require visible=true in Hermes");
        expect(KronTermSurfaceSystemPrompt).toContain("use process_manage");
        expect(KronTermSurfaceSystemPrompt).toContain("Assigned sandbox work uses sandbox_vm_exec");
        expect(KronTermSurfaceSystemPrompt).toContain("read_file, write_file, patch and search_files");
        expect(KronTermSurfaceSystemPrompt).toContain("even when an external coding-agent executable is missing");
        expect(KronTermSurfaceSystemPrompt).toContain("do not silently open a terminal widget");
        expect(KronTermAcpSurfaceSystemPrompt).not.toContain("existing headless terminal tool");
        expect(KronTermAcpSurfaceSystemPrompt).not.toContain("visible=true");
    });

    it("keeps discovery, task context and audit recovery grounded in current scope", () => {
        for (const prompt of [KronTermSurfaceSystemPrompt, KronTermAcpSurfaceSystemPrompt]) {
            expect(prompt).toContain("nextOffset");
            expect(prompt).toContain("Enabled means permitted");
            expect(prompt).toContain("verified outputs; unresolved failure; next action");
            expect(prompt).toContain("OS view/overview requires OS presentation");
            expect(prompt).toContain("Do not invent missing workflow_run, ai_append");
        }
        expect(KronTermSurfaceSystemPrompt).toContain("compatibility operations use the bundled CLI internally");
    });
    it("gives external agents the shared operating protocol with accurate MCP routing", () => {
        expect(KronTermAcpSurfaceSystemPrompt).toContain("ACP specialist");
        expect(KronTermAcpSurfaceSystemPrompt).toContain("kron-term MCP server");
        expect(KronTermAcpSurfaceSystemPrompt).toContain("@app:");
        expect(KronTermAcpSurfaceSystemPrompt).not.toContain("do not use MCP discovery");
        expect(KronTermAcpSurfaceSystemPrompt).not.toContain("Every KronOS tool is direct");
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
