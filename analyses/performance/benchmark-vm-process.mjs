// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const addon = new URL("../../dist/native/vm-process.node", import.meta.url);
const [pidText, drive, countText = "100", mode] = process.argv.slice(2);
const pid = Number(pidText);
const count = Number(countText);
assert(
    process.platform === "darwin" &&
        Number.isSafeInteger(pid) &&
        pid >= 2 &&
        drive?.startsWith("/") &&
        Number.isSafeInteger(count) &&
        count > 0,
    "Usage: node benchmark-vm-process.mjs PID /absolute/ubuntu.qcow2 [samples]"
);
const psArgs = ["-p", pidText, "-o", "command="];
const rssKiB = () => process.memoryUsage.rss() / 1024;

function summary(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
    return { median: at(0.5), p95: at(0.95), min: sorted[0], max: sorted.at(-1) };
}

if (mode) {
    assert(["legacy", "native"].includes(mode));
    const baselineRssKiB = rssKiB();
    let native;
    async function verify(path) {
        if (mode === "native") {
            native ??= createRequire(import.meta.url)(fileURLToPath(addon));
            return native.isManagedQemu(pid, `file=${path},format=qcow2,if=virtio`);
        }
        process.kill(pid, 0);
        const { stdout } = await run("ps", psArgs, { timeout: 3000 });
        return stdout.includes("qemu-system-aarch64") && stdout.includes(path);
    }

    const started = performance.now();
    assert(await verify(drive), "The running process does not match the expected drive");
    const firstMs = performance.now() - started;
    const activeRssKiB = rssKiB();
    assert.equal(await verify(drive + ".wrong"), false);
    const warmMs = [];
    for (let i = 0; i < count; i++) {
        const start = performance.now();
        assert(await verify(drive));
        warmMs.push(performance.now() - start);
    }
    console.log(JSON.stringify({ firstMs, baselineRssKiB, activeRssKiB, warmMs }));
} else {
    const vmRssKiB = [];
    const legacyChildPeakRssKiB = [];
    const results = { legacy: [], native: [] };
    const repetitions = 12;
    for (let i = 0; i < repetitions; i++) {
        vmRssKiB.push(Number(execFileSync("/bin/ps", ["-p", pidText, "-o", "rss="], { encoding: "utf8" }).trim()));
        for (const variant of i % 2 ? ["native", "legacy"] : ["legacy", "native"]) {
            const { stdout } = await run(process.execPath, [
                fileURLToPath(import.meta.url),
                pidText,
                drive,
                countText,
                variant,
            ]);
            results[variant].push(JSON.parse(stdout));
        }
        const { stderr } = await run("/usr/bin/time", ["-l", "/bin/ps", ...psArgs]);
        const childPeakBytes = Number(stderr.match(/(\d+)\s+maximum resident set size/)?.[1]);
        assert(Number.isFinite(childPeakBytes));
        legacyChildPeakRssKiB.push(childPeakBytes / 1024);
    }
    console.log(
        JSON.stringify(
            {
                node: process.version,
                arch: process.arch,
                repetitions,
                warmSamplesPerProcess: count,
                vmRssKiB: summary(vmRssKiB),
                legacyChildPeakRssKiB: summary(legacyChildPeakRssKiB),
                paths: Object.fromEntries(
                    Object.entries(results).map(([variant, rows]) => [
                        variant,
                        {
                            firstMs: summary(rows.map((row) => row.firstMs)),
                            warmMs: summary(rows.flatMap((row) => row.warmMs)),
                            parentBaselineRssKiB: summary(rows.map((row) => row.baselineRssKiB)),
                            parentAfterFirstRssKiB: summary(rows.map((row) => row.activeRssKiB)),
                            parentDeltaRssKiB: summary(rows.map((row) => row.activeRssKiB - row.baselineRssKiB)),
                        },
                    ])
                ),
            },
            null,
            2
        )
    );
}
