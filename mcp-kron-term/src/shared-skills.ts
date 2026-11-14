import { existsSync, readFileSync, readdirSync, realpathSync, statSync, type Dirent } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { discoveryWords, matchesDiscoveryQuery } from "./discovery-query.js";

export const SharedSkillDirsEnv = "KRONTERM_SHARED_SKILL_DIRS";

export type SharedSkillSummary = {
    id: string;
    name: string;
    description: string;
    source: string;
};

type SharedSkillRecord = SharedSkillSummary & {
    filePath: string;
};

function frontmatterValue(content: string, key: string): string {
    if (!content.startsWith("---")) {
        return "";
    }
    const closing = content.indexOf("\n---", 3);
    if (closing === -1) {
        return "";
    }
    const lines = content.slice(3, closing).split(/\r?\n/);
    const index = lines.findIndex((line) => line.startsWith(`${key}:`));
    if (index < 0) return "";
    const value = lines[index].slice(key.length + 1).trim();
    if (/^[>|][-+]?\d?$/.test(value)) {
        const block: string[] = [];
        for (const line of lines.slice(index + 1)) {
            if (line.trim() && !/^\s/.test(line)) break;
            block.push(line.trim());
        }
        return block.join(value.startsWith(">") ? " " : "\n").trim();
    }
    return value.replace(/^(["'])(.*)\1$/, "$2");
}

function sourceName(root: string): string {
    const parent = basename(dirname(root));
    if (parent.startsWith(".")) {
        return parent.slice(1);
    }
    return basename(root);
}

function isWithinRoot(root: string, candidate: string): boolean {
    return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function skillRecord(root: string, directory: string): SharedSkillRecord | null {
    const rootPath = realpathSync(root);
    const skillDirectory = realpathSync(directory);
    if (!isWithinRoot(rootPath, skillDirectory)) {
        return null;
    }
    const filePath = join(skillDirectory, "SKILL.md");
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return null;
    }
    const resolvedFile = realpathSync(filePath);
    if (!isWithinRoot(rootPath, resolvedFile)) return null;
    const content = readFileSync(resolvedFile, "utf8");
    const fallbackName = basename(skillDirectory);
    const source = sourceName(rootPath);
    return {
        id: `${source}/${fallbackName}`,
        name: frontmatterValue(content, "name") || fallbackName,
        description: frontmatterValue(content, "description"),
        source,
        filePath: resolvedFile,
    };
}

export class SharedSkillCatalog {
    constructor(private readonly value: string | (() => string) = process.env[SharedSkillDirsEnv] ?? "") {}

    list(query = ""): SharedSkillSummary[] {
        const terms = discoveryWords(query, true);
        return this.records()
            .filter((skill) => {
                return matchesDiscoveryQuery(`${skill.id} ${skill.name} ${skill.description}`, terms);
            })
            .map(({ filePath: _, ...skill }) => skill);
    }

    read(id: string): { skill: SharedSkillSummary; content: string } {
        const record = this.records().find((skill) => skill.id === id);
        if (!record) {
            throw new Error(`Unknown shared skill: ${id}`);
        }
        const { filePath, ...skill } = record;
        return { skill, content: readFileSync(filePath, "utf8") };
    }

    configuredRoots(): string[] {
        const value = typeof this.value === "function" ? this.value() : this.value;
        return Array.from(
            new Set(
                value
                    .split(process.platform === "win32" ? ";" : ":")
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                    .map((entry) => resolve(entry))
            )
        );
    }

    private records(): SharedSkillRecord[] {
        const records: SharedSkillRecord[] = [];
        for (const root of this.configuredRoots()) {
            let entries: Dirent[];
            try {
                const rootSkill = skillRecord(root, root);
                if (rootSkill) records.push(rootSkill);
                entries = readdirSync(root, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const entry of entries) {
                if (!entry.isDirectory() && !entry.isSymbolicLink()) {
                    continue;
                }
                try {
                    const record = skillRecord(root, join(root, entry.name));
                    if (record) {
                        records.push(record);
                    }
                } catch {
                    continue;
                }
            }
        }
        // Preserve the same first-root precedence for discovery and exact-ID reads.
        const unique = new Map<string, SharedSkillRecord>();
        for (const record of records) {
            if (!unique.has(record.id)) unique.set(record.id, record);
        }
        return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
    }
}
