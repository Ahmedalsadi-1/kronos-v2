// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PackNames = new Set(["diagram-design", "product-management", "productivity"]);

export async function installHermesWorkflowPack(body: unknown, hermesHome: string): Promise<{ installed: string }> {
    const input = body as { pack?: string; reviewed?: boolean };
    if (!input || !PackNames.has(input.pack) || input.reviewed !== true) {
        throw new Error("Choose a supported workflow pack and review its source and license before installing.");
    }
    if (!hermesHome || !path.isAbsolute(hermesHome)) {
        throw new Error("Hermes did not report an absolute profile directory. Nothing was installed.");
    }
    const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const candidates = [
        resourcesPath ? path.join(resourcesPath, "workflow-packs", "import-workflow-pack.py") : "",
        path.resolve(import.meta.dirname, "..", "scripts", "import-workflow-pack.py"),
        path.resolve(import.meta.dirname, "..", "..", "scripts", "import-workflow-pack.py"),
    ];
    const importer = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!importer) {
        throw new Error("The workflow importer is missing from this installation.");
    }
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile(
                "python3",
                [importer, input.pack, "--reviewed", "--skills-dir", path.join(hermesHome, "skills")],
                { timeout: 120_000, maxBuffer: 1024 * 1024 },
                (error, output, stderr) => {
                    if (error) {
                        reject(new Error(stderr.trim() || error.message));
                        return;
                    }
                    resolve(output);
                }
            );
        });
        return { installed: stdout.trim() };
    } catch (error) {
        const failure = error as Error & { stderr?: string };
        throw new Error(failure.stderr?.trim() || failure.message);
    }
}
