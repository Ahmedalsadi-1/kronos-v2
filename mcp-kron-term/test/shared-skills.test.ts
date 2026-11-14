import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import test from "node:test";
import { server, setSharedSkillCatalog } from "../src/index.js";
import { SharedSkillCatalog } from "../src/shared-skills.js";

test("lists and reads allowlisted shared skills", () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-shared-skills-"));
    try {
        const skillDirectory = join(root, "surface-control");
        mkdirSync(skillDirectory);
        writeFileSync(
            join(skillDirectory, "SKILL.md"),
            "---\nname: surface-control\ndescription: Control KronOS surfaces safely.\n---\n\n# Surface Control\n"
        );

        const catalog = new SharedSkillCatalog(root);
        assert.deepEqual(catalog.list(), [
            {
                id: `${basename(root)}/surface-control`,
                name: "surface-control",
                description: "Control KronOS surfaces safely.",
                source: basename(root),
            },
        ]);
        const [skill] = catalog.list("surfaces safely");
        assert.equal(catalog.read(skill.id).content.includes("# Surface Control"), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("in-process MCP handlers use roots configured after module initialization", async () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-late-skills-"));
    try {
        mkdirSync(join(root, "project-work"));
        writeFileSync(
            join(root, "project-work", "SKILL.md"),
            "---\nname: project-work\ndescription: Shared project workflow\n---\nUse project evidence."
        );
        setSharedSkillCatalog(new SharedSkillCatalog(root));
        const tools = (server as any)._registeredTools;
        const listed = JSON.parse((await tools.shared_skill_list.handler({})).content[0].text);
        assert.equal(listed.length, 1);
        const read = JSON.parse((await tools.shared_skill_read.handler({ id: listed[0].id })).content[0].text);
        assert.match(read.content, /Use project evidence/);
    } finally {
        setSharedSkillCatalog(new SharedSkillCatalog());
        rmSync(root, { recursive: true, force: true });
    }
});

test("does not follow skill symlinks outside an allowlisted root", () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-shared-skills-"));
    const outside = mkdtempSync(join(tmpdir(), "kronterm-outside-skill-"));
    try {
        writeFileSync(join(outside, "SKILL.md"), "---\nname: outside\n---\n");
        symlinkSync(outside, join(root, "outside"));
        mkdirSync(join(root, "file-link"));
        symlinkSync(join(outside, "SKILL.md"), join(root, "file-link", "SKILL.md"));
        assert.deepEqual(new SharedSkillCatalog(root).list(), []);
    } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
    }
});

test("searches folded descriptions and tolerates a removed configured root", () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-skill-search-"));
    try {
        mkdirSync(join(root, "workflow"));
        writeFileSync(
            join(root, "workflow", "SKILL.md"),
            "---\nname: workflow\ndescription: >-\n  Inspect shared files and\n  verify workspace outputs.\n---\nUse file_read."
        );
        const catalog = new SharedSkillCatalog(root);
        const result = catalog.list("files outputs");
        assert.equal(result.length, 1);
        assert.equal(result[0].description, "Inspect shared files and verify workspace outputs.");
        assert.ok(catalog.read(result[0].id).content.includes("file_read"));
        rmSync(root, { recursive: true, force: true });
        assert.deepEqual(catalog.list(), []);
        assert.throws(() => catalog.read(result[0].id), /Unknown shared skill/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("keeps project skill IDs unambiguous when packaged skills share their source name", () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-skill-precedence-"));
    try {
        const roots = ["project", "bundled"].map((name) => join(root, name, ".agents", "skills"));
        for (const [index, directory] of roots.entries()) {
            mkdirSync(join(directory, "workflow"), { recursive: true });
            writeFileSync(
                join(directory, "workflow", "SKILL.md"),
                `---\nname: workflow\ndescription: Source ${index}\n---\n${index}`
            );
        }
        const catalog = new SharedSkillCatalog(roots.join(delimiter));
        assert.equal(catalog.list().length, 1);
        assert.equal(catalog.read("agents/workflow").skill.description, "Source 0");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
