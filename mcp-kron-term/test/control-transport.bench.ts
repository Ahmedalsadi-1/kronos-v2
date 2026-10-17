// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { executeTool } from "../src/tool-execution.js";

const run = promisify(execFile);
const iterations = 50;
const fixture = { widgets: {}, defaultwidgets: { terminal: { blockdef: { meta: { view: "term" } } } } };
const directory = await mkdtemp(join(tmpdir(), "kronterm-control-bench-"));
const executable = join(directory, "wsh-fixture");

async function measure(operation: () => Promise<unknown>) {
    const samples: number[] = [];
    for (let index = 0; index < iterations; index++) {
        const start = performance.now();
        await operation();
        samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return { medianMs: samples[Math.floor(iterations * 0.5)], p95Ms: samples[Math.floor(iterations * 0.95)] };
}

try {
    await writeFile(executable, `#!/bin/sh\nprintf '%s' '${JSON.stringify(fixture)}'\n`);
    await chmod(executable, 0o700);
    const cli = await measure(async () => {
        const { stdout } = await run(executable, ["widgets", "--json"]);
        assert.deepEqual(JSON.parse(stdout), fixture);
    });
    const persistent = await measure(async () => {
        const result = await executeTool("list_widgets", {}, true, async () => ({
            content: [{ type: "text", text: JSON.stringify(fixture) }],
        }));
        assert.deepEqual(JSON.parse(result.content[0].text), fixture);
    });
    process.stdout.write(
        `${JSON.stringify(
            {
                scope: "Synthetic subprocess transport overhead only; does not measure live renderer/provider latency",
                tool: "list_widgets",
                presentation: "model-backed",
                iterations,
                cli,
                persistent,
                p95ReductionPercent: 100 * (1 - persistent.p95Ms / cli.p95Ms),
            },
            null,
            2
        )}\n`
    );
} finally {
    await rm(directory, { recursive: true, force: true });
}
