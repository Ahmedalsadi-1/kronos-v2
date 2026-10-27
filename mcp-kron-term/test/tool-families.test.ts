import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { KronTermToolsets, formatAcpCapabilityLease, makeAcpCapabilityLease } from "../../emain/acp/acp-harness.ts";
import { nativeToolManifest } from "../src/index.ts";
import { SharedSkillCatalog } from "../src/shared-skills.ts";
import { groupKronTermTools, kronTermToolFamily } from "../src/tool-families.ts";

it("classifies every registered tool exactly once and rejects unknown tool names", () => {
    const names = nativeToolManifest(() => true).map((tool) => tool.name);
    const groups = groupKronTermTools(names);
    assert.deepEqual(
        names.filter((name) => !kronTermToolFamily(name)),
        []
    );
    assert.deepEqual(Object.values(groups).flat().sort(), [...names].sort());
    assert.equal(kronTermToolFamily("imaginary_tool"), null);
    for (const family of ["canvas", "lsp", "sandbox", "desktop", "agents", "workflow"])
        assert.ok(groups[family].length);
    assert.ok(groups.workspace.includes("workspace_os_action"));
    assert.ok(groups.sandbox.includes("linux_desktop_batch"));
    const registered = new Set(names);
    for (const toolset of Object.values(KronTermToolsets)) {
        assert.deepEqual(
            toolset.tools.filter((name) => !registered.has(name)),
            [],
            toolset.id
        );
    }
    const lease = makeAcpCapabilityLease({
        backend: "kronoscode",
        content: "Inspect the repository",
        surfaceAvailable: true,
        workspace: "/tmp/project",
    });
    const prompt = formatAcpCapabilityLease(lease, names);
    for (const name of names) assert.ok(prompt.includes(name), `ACP omitted ${name}`);
});

it("discovers and reads the packaged workflow guide through the allowlisted skill catalog", () => {
    const catalog = new SharedSkillCatalog(fileURLToPath(new URL("../../.agents/skills", import.meta.url)));
    const skill = catalog.list("kronterm-tool-workflows").find((entry) => entry.name === "kronterm-tool-workflows");
    assert.ok(skill);
    const loaded = catalog.read(skill.id);
    assert.match(loaded.content, /tool_search/);
    assert.match(loaded.content, /lsp_/);
    assert.match(loaded.content, /canvas_/);
    assert.throws(() => catalog.read("../../auth.json"), /Unknown shared skill/);
});
