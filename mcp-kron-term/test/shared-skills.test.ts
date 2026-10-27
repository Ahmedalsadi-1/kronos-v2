import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import test from "node:test";
import { SharedSkillCatalog } from "../src/shared-skills.js";

test("lists and reads allowlisted shared skills", () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-shared-skills-"));
    try {
        const skillDirectory = join(root, "surface-control");
        mkdirSync(skillDirectory);
        writeFileSync(
            join(skillDirectory, "SKILL.md"),
            "---\nname: surface-control\ndescription: Control KronTerm surfaces safely.\n---\n\n# Surface Control\n"
        );

        const catalog = new SharedSkillCatalog(root);
        assert.deepEqual(catalog.list(), [
            {
                id: `${basename(root)}/surface-control`,
                name: "surface-control",
                description: "Control KronTerm surfaces safely.",
                source: basename(root),
            },
        ]);
        const [skill] = catalog.list("surfaces safely");
        assert.equal(catalog.read(skill.id).content.includes("# Surface Control"), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("does not follow skill symlinks outside an allowlisted root", () => {
    const root = mkdtempSync(join(tmpdir(), "kronterm-shared-skills-"));
    const outside = mkdtempSync(join(tmpdir(), "kronterm-outside-skill-"));
    try {
        writeFileSync(join(outside, "SKILL.md"), "---\nname: outside\n---\n");
        symlinkSync(outside, join(root, "outside"));
        assert.deepEqual(new SharedSkillCatalog(root).list(), []);
    } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
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
